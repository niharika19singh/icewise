"""
ICEWISE Routing/Risk API — production-grade FastAPI wrapper around the
real routing & risk engine (icewise/pipeline.py), consuming Tanusha's
real iceberg prediction dataset. No mock/synthetic data.

P0 fixes applied:
  - Input validation: lat/lon bounds, finite floats, Antarctic domain
  - NSIDC sea-ice data loaded at startup and fed into every NavigationEngine call
  - Explicit structured error responses with correct HTTP codes
  - No raw exception strings exposed
  - Explicit NO_ROUTE_FOUND vs validation vs server-error distinction
  - Arbitrary start/destination support (not only the demo corridor)
  - Snapped coordinates returned explicitly when minor snapping occurs
  - Warnings array in all route responses
"""

import csv
import json
import logging
import math
import os
import sys
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator, model_validator

# Make the sibling 'icewise' package importable as a top-level module,
# matching the internal `from icewise.xxx import yyy` imports unchanged.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from icewise.interfaces import VesselProfile  # noqa: E402
from icewise.adapters import IcebergPredictionAdapter, load_nsidc_sea_ice_data  # noqa: E402
from icewise.pipeline import NavigationEngine  # noqa: E402
from icewise.grid_graph import (  # noqa: E402
    SUPPORTED_REGION_ID,
    in_supported_operating_region,
    supported_region_metadata,
    supported_region_summary,
    unsupported_region_reason,
)
from icewise.sea_ice_api import router as sea_ice_router  # noqa: E402

# Tanusha's prediction module lives in backend/prediction/, a sibling of
# backend/routing/ — not currently a package, so it's exposed the same way
# icewise/ is: add its directory to sys.path and import it directly. This is
# the ONLY connection between this file and backend/prediction/; nothing
# about /api/route below changes because of it.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "prediction"))
from predict_iceberg import predict_icebergs  # noqa: E402

logger = logging.getLogger("icewise")
logging.basicConfig(level=logging.INFO)

# ---------------------------------------------------------------------------
# Dataset paths
# ---------------------------------------------------------------------------

CSV_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "prediction", "iceberg_prediction_dataset.csv"
)
C18B_VALIDATION_CSV_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "prediction", "c18b_hybrid_results.csv"
)

# ---------------------------------------------------------------------------
# NSIDC sea-ice — loaded once at startup, shared across all requests.
# If the file is missing the server still starts; routing falls back to the
# 0.05 default concentration and returns a warning in the response.
# ---------------------------------------------------------------------------
_SEA_ICE_ENV = None
_SEA_ICE_WARNING: Optional[str] = None
_SEA_ICE_DATE: Optional[str] = None   # snapshot date of the loaded NSIDC file (YYYY-MM-DD)


def _load_sea_ice() -> None:
    global _SEA_ICE_ENV, _SEA_ICE_WARNING, _SEA_ICE_DATE
    from icewise.adapters import load_nsidc_sea_ice_data
    from icewise.interfaces import EnvironmentalData

    json_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                             "icewise", "data", "nsidc_sea_ice_20200102.json")
    if os.path.exists(json_path):
        env = load_nsidc_sea_ice_data(json_path)
        try:
            with open(json_path, "r", encoding="utf-8") as fh:
                _SEA_ICE_DATE = str(json.load(fh).get("timestamp", ""))[:10] or None
        except Exception:  # the date is informational; never block startup on it
            _SEA_ICE_DATE = None
        if env.ice_concentration_map:
            _SEA_ICE_ENV = env
            logger.info("NSIDC sea-ice data loaded: %d cells", len(env.ice_concentration_map))
        else:
            _SEA_ICE_ENV = EnvironmentalData()
            _SEA_ICE_WARNING = "NSIDC sea-ice file was found but contained no data cells; using default concentration."
            logger.warning(_SEA_ICE_WARNING)
    else:
        _SEA_ICE_ENV = EnvironmentalData()
        _SEA_ICE_WARNING = (
            "NSIDC sea-ice concentration file not found. "
            "Routing will use a uniform default concentration (0.05). "
            "Sea-ice risk will be underrepresented."
        )
        logger.warning(_SEA_ICE_WARNING)


# Load immediately at import time so tests also pick it up
_load_sea_ice()

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

cors_env = os.getenv("CORS_ORIGINS", "*")
cors_origins = [origin.strip() for origin in cors_env.split(",") if origin.strip()]

app = FastAPI(
    title="ICEWISE Routing API",
    description="Risk-aware Antarctic maritime routing engine — SIH 2026.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins if cors_origins != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Real NSIDC sea-ice concentration endpoints
app.include_router(sea_ice_router)


# ---------------------------------------------------------------------------
# Custom exception handlers — no raw tracebacks in responses
# ---------------------------------------------------------------------------

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    return JSONResponse(
        status_code=422,
        content={
            "error": "VALIDATION_ERROR",
            "detail": "Request body failed schema validation.",
            "fields": [
                {"field": ".".join(str(l) for l in e["loc"]), "message": e["msg"]}
                for e in errors
            ],
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception in %s %s", request.method, request.url)
    return JSONResponse(
        status_code=500,
        content={
            "error": "INTERNAL_ERROR",
            "detail": "An unexpected server error occurred. Check server logs.",
        },
    )


# ---------------------------------------------------------------------------
# Input validation helpers
# ---------------------------------------------------------------------------

# Enforced Antarctic routing domain.
# _DOMAIN_LAT_MIN_SOFT (-85°S) is the hard limit applied in _validate_domain().
# _DOMAIN_LAT_MIN (-80°S) is a soft advisory — points between -85° and -80°S
# are technically accepted but unlikely to be navigable open ocean.
_DOMAIN_LAT_MIN = -80.0        # soft advisory (no enforcement)
_DOMAIN_LAT_MAX = -55.0        # northern limit, enforced
_DOMAIN_LAT_MIN_SOFT = -85.0   # southern hard limit, enforced

# Grid resolution the routing engine uses for EVERY API request. This single
# constant is shared by the corridor guard's node estimate and by the
# NavigationEngine(...) calls below, so the estimate cannot drift from what is
# actually built. (An earlier version assumed 0.1 while the engine ran at 0.05,
# which under-counted nodes about 4x.)
_GRID_RESOLUTION_DEG = 0.05
_API_GRID_RESOLUTION_DEG = _GRID_RESOLUTION_DEG   # backwards-compatible alias

# Buffer (degrees) NavigationEngine._init_bounds adds around the start/destination box.
_GRID_BUFFER_DEG = 1.0

# Maximum ESTIMATED grid nodes (at _GRID_RESOLUTION_DEG) per routing request.
# Measured on the development machine (local CPython, one request at a time):
#   demo corridor  (~7,400 nodes)   ->  ~1.5-2.5 s
#   ~38,800 nodes                   ->  ~13 s
#   ~39,400 nodes                   ->  ~14 s
# Cost grows roughly linearly with nodes, and each request also runs four more
# path searches (three strategies + baseline). 30,000 keeps the worst accepted
# corridor near 10 s locally, leaving headroom for a slower shared host and for
# the frontend's 90 s request timeout. NOT measured on the Render free tier.
_MAX_GRID_NODES = 30_000


def _validate_latlon(lat: float, lon: float, label: str) -> None:
    """
    Raises HTTPException 422 if lat/lon are out-of-range or non-finite.
    Never silently passes invalid values.
    """
    if not (math.isfinite(lat) and math.isfinite(lon)):
        raise HTTPException(
            status_code=422,
            detail={
                "error": "INVALID_COORDINATE",
                "detail": f"{label}: lat and lon must be finite numbers (got lat={lat}, lon={lon}).",
            },
        )
    if not (-90.0 <= lat <= 90.0):
        raise HTTPException(
            status_code=422,
            detail={
                "error": "INVALID_COORDINATE",
                "detail": f"{label}: latitude {lat} is out of range [-90, 90].",
            },
        )
    if not (-180.0 <= lon <= 180.0):
        raise HTTPException(
            status_code=422,
            detail={
                "error": "INVALID_COORDINATE",
                "detail": f"{label}: longitude {lon} is out of range [-180, 180].",
            },
        )


def _validate_domain(lat: float, lon: float, label: str) -> None:
    """
    Raises HTTPException 422 if the coordinate is outside the supported
    Antarctic routing domain. We support lat ∈ [-80, -55] (open ocean above
    the continental floor). Points far outside this range are almost certainly
    wrong coordinates, not edge cases to silently snap.
    """
    if not (_DOMAIN_LAT_MIN_SOFT <= lat <= _DOMAIN_LAT_MAX):
        raise HTTPException(
            status_code=422,
            detail={
                "error": "OUTSIDE_DOMAIN",
                "detail": (
                    f"{label}: latitude {lat:.4f}° is outside the supported Antarctic routing domain "
                    f"[{_DOMAIN_LAT_MIN_SOFT}°S, {_DOMAIN_LAT_MAX}°S]. "
                    "Supported region: Southern Ocean, Antarctica."
                ),
            },
        )


def _validate_not_identical(start_lat: float, start_lon: float,
                             dest_lat: float, dest_lon: float) -> None:
    if abs(start_lat - dest_lat) < 1e-6 and abs(start_lon - dest_lon) < 1e-6:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "IDENTICAL_POINTS",
                "detail": "Start and destination are the same coordinate. No route needed.",
            },
        )


def _estimate_grid_nodes(start_lat: float, start_lon: float,
                         dest_lat: float, dest_lon: float) -> int:
    """Nodes NavigationEngine would allocate for this corridor (before land masking)."""
    lat_span = abs(dest_lat - start_lat) + 2 * _GRID_BUFFER_DEG
    lon_span = abs(dest_lon - start_lon) + 2 * _GRID_BUFFER_DEG
    return int((lat_span / _GRID_RESOLUTION_DEG + 1) * (lon_span / _GRID_RESOLUTION_DEG + 1))


def _validate_corridor_size(start_lat: float, start_lon: float,
                             dest_lat: float, dest_lon: float) -> None:
    """
    Estimates the grid nodes the routing engine would allocate for this corridor
    (1° buffer on all sides, _GRID_RESOLUTION_DEG resolution) and raises
    HTTPException 422 CORRIDOR_TOO_LARGE — before any grid is built — if the
    estimate exceeds _MAX_GRID_NODES. This protects against runaway compute on
    oversized or cross-region requests while leaving normal missions unaffected.

    Longitude span is the plain difference, so a corridor that crosses the
    antimeridian (e.g. 179°E to 179°W) is treated as ~358° wide and rejected.
    """
    estimated_nodes = _estimate_grid_nodes(start_lat, start_lon, dest_lat, dest_lon)
    if estimated_nodes > _MAX_GRID_NODES:
        lat_span = abs(dest_lat - start_lat)
        lon_span = abs(dest_lon - start_lon)
        # Side of the largest square corridor that still fits the node budget.
        max_square_deg = (math.sqrt(_MAX_GRID_NODES) - 1) * _GRID_RESOLUTION_DEG - 2 * _GRID_BUFFER_DEG
        raise HTTPException(
            status_code=422,
            detail={
                "error": "CORRIDOR_TOO_LARGE",
                "detail": (
                    f"The requested corridor (lat_span={lat_span:.1f}°, lon_span={lon_span:.1f}°, "
                    f"estimated ~{estimated_nodes:,} grid nodes at {_GRID_RESOLUTION_DEG}° resolution) exceeds "
                    f"the maximum routing grid size ({_MAX_GRID_NODES:,} nodes). "
                    f"Split the mission into shorter legs (roughly ≤ {max_square_deg:.0f}° latitude × "
                    f"{max_square_deg:.0f}° longitude each)."
                ),
                "estimated_grid_nodes": estimated_nodes,
                "max_grid_nodes": _MAX_GRID_NODES,
                "grid_resolution_deg": _GRID_RESOLUTION_DEG,
            },
        )


def _validate_supported_region(lat: float, lon: float, field: str) -> None:
    """
    Raises 422 COORDINATE_NOT_NAVIGABLE if the point is outside the supported
    navigable region (icewise/grid_graph.py). There is no coastline dataset in
    the repository, so outside that region land, ice shelves and ice sheet cannot
    be ruled out and the point is refused rather than routed or snapped.
    """
    if not in_supported_operating_region(lat, lon):
        raise HTTPException(
            status_code=422,
            detail={
                "error": "COORDINATE_NOT_NAVIGABLE",
                "field": field,
                "detail": unsupported_region_reason(lat, lon),
                "supported_region": supported_region_metadata(),
            },
        )


def _validate_mission_request(req: "RouteRequest") -> None:
    """Every up-front (grid-free) check, in a fixed order, shared by both routing endpoints."""
    s, d = req.start_point, req.destination
    _validate_latlon(s.lat, s.lon, "start_point")
    _validate_latlon(d.lat, d.lon, "destination")
    _validate_domain(s.lat, s.lon, "start_point")
    _validate_domain(d.lat, d.lon, "destination")
    _validate_not_identical(s.lat, s.lon, d.lat, d.lon)
    _validate_corridor_size(s.lat, s.lon, d.lat, d.lon)
    _validate_supported_region(s.lat, s.lon, "start_point")
    _validate_supported_region(d.lat, d.lon, "destination")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class LatLon(BaseModel):
    lat: float
    lon: float


class RouteRequest(BaseModel):
    vessel_id: str
    start_point: LatLon
    destination: LatLon
    vessel_name: Optional[str] = None
    cruise_speed_knots: float = 12.0
    fuel_consumption_rate_tons_per_day: float = 15.0
    algorithm: str = "A*"
    target_timestamp: Optional[str] = None
    # Opt-in: also compute a second, time-aware set of the 3 route strategies
    # (see _build_time_aware_route_options). Off by default so existing
    # callers/tests see byte-identical responses; the extra pass costs about
    # the same as building the grid once more.
    time_aware: bool = False

    @field_validator("algorithm")
    @classmethod
    def validate_algorithm(cls, v: str) -> str:
        if v.upper() not in {"A*", "ASTAR", "DIJKSTRA"}:
            raise ValueError(f"algorithm must be 'A*' or 'Dijkstra', got '{v}'")
        return v

    @field_validator("cruise_speed_knots")
    @classmethod
    def validate_speed(cls, v: float) -> float:
        if v <= 0 or not math.isfinite(v):
            raise ValueError(f"cruise_speed_knots must be a positive finite number, got {v}")
        return v

    @field_validator("fuel_consumption_rate_tons_per_day")
    @classmethod
    def validate_fuel_rate(cls, v: float) -> float:
        if v <= 0 or not math.isfinite(v):
            raise ValueError(f"fuel_consumption_rate_tons_per_day must be positive and finite, got {v}")
        return v


class RecalculateRequest(RouteRequest):
    initial_target_timestamp: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_vessel_dict(req: RouteRequest) -> dict:
    return {
        "vessel_id": req.vessel_id,
        "vessel_name": req.vessel_name or req.vessel_id,
        "start_point": req.start_point.model_dump(),
        "destination": req.destination.model_dump(),
        "cruise_speed_knots": req.cruise_speed_knots,
        "fuel_consumption_rate_tons_per_day": req.fuel_consumption_rate_tons_per_day,
    }


# Empirically validated risk_tolerance_factor values for the 3-strategy comparison.
# 0.0 = unconstrained shortest path (baseline), 2.5 = VesselProfile default (balanced),
# 10.0 = safety priority (distinct safer path confirmed in validation runs).
ROUTE_OPTION_PROFILES = [
    (0.0, "Baseline / Shortest"),
    (2.5, "Balanced"),
    (10.0, "Safety Priority"),
]


def _build_route_options(engine: NavigationEngine, algorithm: str) -> list:
    """
    Computes the 3 validated route options on the SAME already-built engine
    by varying only vessel.risk_tolerance_factor.
    """
    original_alpha = engine.vessel.risk_tolerance_factor
    options = []
    try:
        for alpha, label in ROUTE_OPTION_PROFILES:
            engine.vessel.risk_tolerance_factor = alpha
            try:
                option_result = engine.compute_route(algorithm=algorithm, include_comparison=False)
                option_dict = option_result.to_dict()
                options.append({
                    "route_id": option_dict["route_id"],
                    "label": label,
                    "risk_tolerance_factor": alpha,
                    "waypoints": option_dict["waypoints"],
                    "metrics": option_dict["metrics"],
                    "waypoint_risks": option_dict.get("waypoint_risks"),
                })
            except ValueError as e:
                # A strategy may fail (e.g. safety priority can't find any safe path)
                # — include the error in-band rather than failing the whole response.
                options.append({
                    "label": label,
                    "risk_tolerance_factor": alpha,
                    "error": "NO_ROUTE_FOUND",
                    "detail": str(e),
                })
    finally:
        engine.vessel.risk_tolerance_factor = original_alpha
    return options


# Explains the difference between `route_options` and `time_aware_route_options`
# whenever the latter is present — kept as one constant so the wording is
# identical everywhere it's surfaced.
TIME_AWARE_METHODOLOGY_NOTE = (
    "Time-aware option set: each option's node risk is evaluated at that cell's "
    "straight-line ETA from the start point at cruise speed, instead of the "
    "worst-case-ever forecast envelope route_options above use for path search. "
    "This is a bounded lower-bound arrival-time approximation (not the actual "
    "path-dependent arrival time, which depends on which path is taken, and not "
    "a time-expanded-graph search) — see NavigationGridGraph.compute_time_aware_node_risk."
)


def _build_time_aware_route_options(engine: NavigationEngine, algorithm: str) -> list:
    """
    Same 3 strategies as _build_route_options, but path search uses a
    time-aware risk grid (each cell evaluated at its estimated arrival time)
    instead of the static worst-case forecast envelope. See
    NavigationEngine.compute_time_aware_route / TIME_AWARE_METHODOLOGY_NOTE.
    Restores the engine's static node_risk and risk_tolerance_factor
    afterward, so it never affects the primary route_options.
    """
    original_alpha = engine.vessel.risk_tolerance_factor
    original_node_risk = engine.graph.node_risk
    options = []
    try:
        engine.graph.node_risk = engine.graph.compute_time_aware_node_risk(
            engine.vessel.start_point, engine.vessel.cruise_speed_knots
        )
        for alpha, label in ROUTE_OPTION_PROFILES:
            engine.vessel.risk_tolerance_factor = alpha
            try:
                option_result = engine.compute_route(algorithm=algorithm, include_comparison=False)
                option_dict = option_result.to_dict()
                options.append({
                    "route_id": option_dict["route_id"],
                    "label": label,
                    "risk_tolerance_factor": alpha,
                    "waypoints": option_dict["waypoints"],
                    "metrics": option_dict["metrics"],
                    "waypoint_risks": option_dict.get("waypoint_risks"),
                })
            except ValueError as e:
                options.append({
                    "label": label,
                    "risk_tolerance_factor": alpha,
                    "error": "NO_ROUTE_FOUND",
                    "detail": str(e),
                })
    finally:
        engine.vessel.risk_tolerance_factor = original_alpha
        engine.graph.node_risk = original_node_risk
    return options


def _relevant_icebergs(vessel: VesselProfile, iceberg_preds: list) -> list:
    """Filters iceberg predictions to those within 1° of the route corridor."""
    buffer_deg = 1.0
    lat_min = min(vessel.start_point.lat, vessel.destination.lat) - buffer_deg
    lat_max = max(vessel.start_point.lat, vessel.destination.lat) + buffer_deg
    lon_min = min(vessel.start_point.lon, vessel.destination.lon) - buffer_deg
    lon_max = max(vessel.start_point.lon, vessel.destination.lon) + buffer_deg

    return [
        p
        for p in iceberg_preds
        if lat_min <= p.current_position.lat <= lat_max
        and lon_min <= p.current_position.lon <= lon_max
    ]


def _max_forecast_horizon(iceberg_preds: list) -> Optional[float]:
    """
    The real maximum forecast horizon (hours) actually present across these
    iceberg predictions' own predicted_positions — None when there are no
    predictions to draw a horizon from (never a fabricated default).
    """
    horizons = [p.time_offset_hours for berg in iceberg_preds for p in berg.predicted_positions]
    return max(horizons) if horizons else None


def _collect_warnings() -> list:
    """Returns any active server-level warnings (e.g. missing sea-ice file)."""
    warnings = []
    if _SEA_ICE_WARNING:
        warnings.append(_SEA_ICE_WARNING)
    return warnings


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/")
def root():
    return {"status": "ok", "service": "icewise-backend", "docs": "/docs"}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "icewise-backend",
        "sea_ice_loaded": bool(_SEA_ICE_ENV and _SEA_ICE_ENV.ice_concentration_map),
        "dataset_exists": os.path.exists(CSV_PATH),
    }


# ---------------------------------------------------------------------------
# Shared helpers for the routing endpoints
# ---------------------------------------------------------------------------

def _load_predictions(target_timestamp: Optional[str], warnings: list) -> tuple:
    """
    Loads the iceberg snapshot for a timestamp; if none matches, falls back to each
    iceberg's latest observation WITH a warning. Returns (predictions, matched), where
    matched is True only when the requested timestamp really was the data used.
    """
    preds = IcebergPredictionAdapter.from_tanusha_csv_file(CSV_PATH, target_timestamp=target_timestamp)
    if target_timestamp and not preds:
        warnings.append(
            f"No iceberg predictions found for timestamp '{target_timestamp}'. "
            "Falling back to latest available observations."
        )
        return IcebergPredictionAdapter.from_tanusha_csv_file(CSV_PATH), False
    return preds, bool(target_timestamp)


def _latest_snapshot_range() -> Optional[tuple]:
    """(earliest, latest) date of each iceberg's most recent observation in the dataset."""
    try:
        latest = {}
        with open(CSV_PATH, mode="r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                iid, ts = row.get("iceberg_id", ""), row.get("current_timestamp", "")
                if ts and (iid not in latest or ts > latest[iid]):
                    latest[iid] = ts
        if not latest:
            return None
        dates = sorted(ts[:10] for ts in latest.values())
        return dates[0], dates[-1]
    except Exception:
        return None


def _latest_snapshot_warning(prefix: str) -> Optional[str]:
    span = _latest_snapshot_range()
    if not span:
        return None
    a, b = span
    when = a if a == b else f"{a} to {b}"
    return (
        f"{prefix} each iceberg's latest recorded observation is used (snapshot dates {when}); "
        "these are not a single consistent point in time."
    )


def _require_navigable(engine: NavigationEngine, vessel: VesselProfile) -> None:
    """Grid-level navigability check for both endpoints (raises 422 COORDINATE_NOT_NAVIGABLE)."""
    for field, wp in (("start_point", vessel.start_point), ("destination", vessel.destination)):
        ok, reason = engine.graph.check_point_navigable(wp)
        if not ok:
            raise HTTPException(
                status_code=422,
                detail={"error": "COORDINATE_NOT_NAVIGABLE", "field": field, "detail": reason},
            )


def _sea_ice_report(engine: NavigationEngine, waypoints: list,
                    iceberg_dates: Optional[tuple]) -> tuple:
    """
    Truthful sea-ice status for THIS request. Distinguishes:
      sea_ice_layer_available      the NSIDC dataset is loaded (a layer exists);
      sea_ice_grid_coverage_pct    % of this request's routing-grid cells that have a REAL
                                   NSIDC observation within 0.2° (the rest use a uniform
                                   default concentration);
      sea_ice_route_coverage_pct   same, for the route's waypoints;
      sea_ice_integrated           True only if real observations actually entered this
                                   request's risk field (grid coverage > 0).
    Nothing is interpolated or invented beyond 0.2° of a real cell.
    Returns (fields, warnings).
    """
    env = engine.environmental_data
    layer = bool(env and env.ice_concentration_map)
    if not layer:
        return {
            "sea_ice_layer_available": False,
            "sea_ice_integrated": False,
            "sea_ice_grid_coverage_pct": 0.0,
            "sea_ice_route_coverage_pct": 0.0,
        }, []

    risk = engine.risk_engine
    nodes = engine.graph.nodes
    covered_nodes = sum(1 for lat, lon in nodes if risk.sea_ice_observation_at(lat, lon) is not None)
    grid_pct = 100.0 * covered_nodes / len(nodes) if nodes else 0.0
    covered_wps = sum(1 for w in waypoints if risk.sea_ice_observation_at(w.lat, w.lon) is not None)
    route_pct = 100.0 * covered_wps / len(waypoints) if waypoints else 0.0
    used = covered_nodes > 0
    default = env.default_ice_concentration

    warnings = []
    ice_date = _SEA_ICE_DATE or "unknown date"
    if not used:
        warnings.append(
            f"NSIDC sea-ice observations ({ice_date}) do not cover this corridor: no routing-grid cell has a "
            f"real observation within {risk._ICE_NEIGHBOUR_RADIUS_DEG}°, so sea ice does not influence this "
            f"route. A uniform default concentration of {default} is applied everywhere."
        )
    elif grid_pct < 100.0:
        warnings.append(
            f"NSIDC sea-ice observations ({ice_date}) cover {grid_pct:.1f}% of this routing grid "
            f"({route_pct:.0f}% of route waypoints); the rest uses a uniform default concentration of {default}."
        )
    if iceberg_dates and _SEA_ICE_DATE and not (iceberg_dates[0] <= _SEA_ICE_DATE <= iceberg_dates[1]):
        a, b = iceberg_dates
        when = a if a == b else f"{a} to {b}"
        warnings.append(
            f"Sea-ice data is the NSIDC {_SEA_ICE_DATE} snapshot but the iceberg data is from {when}; "
            "the two are not from the same time."
        )
    return {
        "sea_ice_layer_available": True,
        "sea_ice_integrated": used,
        "sea_ice_grid_coverage_pct": round(grid_pct, 1),
        "sea_ice_route_coverage_pct": round(route_pct, 1),
    }, warnings


def _snap_fields(engine: NavigationEngine, vessel: VesselProfile) -> dict:
    """snapped_* fields, present only when a requested point moved to a different grid node."""
    snaps = {}
    for key, wp in (("start", vessel.start_point), ("destination", vessel.destination)):
        node = engine.graph.find_nearest_node(wp)
        if abs(node[0] - wp.lat) > 1e-4 or abs(node[1] - wp.lon) > 1e-4:
            snaps[f"snapped_{key}"] = {"lat": node[0], "lon": node[1]}
            snaps[f"snapped_{key}_reason"] = "Coordinate snapped to nearest navigable grid node."
    return snaps


def _methodology_notes() -> list:
    """Plain statements of how the risk/navigability numbers are produced (appended to route notes)."""
    return [
        "Path search uses the static forecast-envelope risk field (worst case over every forecast position "
        "of every iceberg); the reported mean/max risk is evaluated at each waypoint's ETA. Pathfinding itself "
        "is not time-dependent.",
        "Iceberg confidence (0.90) is an adapter default, not a model output. Drift speed/bearing and size are "
        "not provided by the prediction data and are not used by the risk engine.",
        f"Navigability model {SUPPORTED_REGION_ID}: {supported_region_summary()}. This is a conservative "
        "supported region, not a coastline dataset.",
    ]


# ---------------------------------------------------------------------------
# Routing endpoints
# ---------------------------------------------------------------------------

@app.post("/api/route")
def generate_route(req: RouteRequest):
    """
    Compute a risk-aware route from start to destination.

    Returns three route options (Baseline, Balanced, Safety Priority)
    plus the primary route, icebergs in corridor, and all metadata.

    Errors:
      422 VALIDATION_ERROR         — malformed request body
      422 INVALID_COORDINATE       — non-finite or out-of-range lat/lon
      422 OUTSIDE_DOMAIN           — latitude outside -85°..-55°
      422 IDENTICAL_POINTS         — start == destination
      422 CORRIDOR_TOO_LARGE       — corridor span would exceed the grid node budget
      422 COORDINATE_NOT_NAVIGABLE — outside the supported navigable region, or unusable grid point
      422 NO_ROUTE_FOUND           — no feasible path under risk threshold
      500 INTERNAL_ERROR           — unexpected server-side failure
    """
    _validate_mission_request(req)

    if not os.path.exists(CSV_PATH):
        raise HTTPException(
            status_code=500,
            detail={
                "error": "DATASET_MISSING",
                "detail": f"Iceberg prediction dataset not found at {CSV_PATH}",
            },
        )

    warnings = _collect_warnings()

    try:
        vessel = VesselProfile.from_dict(_build_vessel_dict(req))
        iceberg_preds, timestamp_matched = _load_predictions(req.target_timestamp, warnings)

        if not req.target_timestamp:
            note = _latest_snapshot_warning("No target_timestamp was supplied:")
            if note:
                warnings.append(note)

        # Pass the real NSIDC sea-ice data into the routing engine.
        # _SEA_ICE_ENV is always set (may be empty map if file missing — see startup).
        engine = NavigationEngine(
            vessel=vessel,
            iceberg_predictions=iceberg_preds,
            environmental_data=_SEA_ICE_ENV,
            grid_resolution_deg=_GRID_RESOLUTION_DEG,
        )

        # Pre-validate that start and destination are navigable before running A*/Dijkstra.
        _require_navigable(engine, vessel)

        result = engine.compute_route(algorithm=req.algorithm)

        response = result.to_dict()
        response["icebergs"] = [p.to_dict() for p in _relevant_icebergs(vessel, iceberg_preds)]
        response["route_options"] = _build_route_options(engine, req.algorithm)
        response["iceberg_prediction_count"] = len(iceberg_preds)
        response["forecast_horizon_hours"] = _max_forecast_horizon(iceberg_preds)

        if req.time_aware:
            response["time_aware_route_options"] = _build_time_aware_route_options(engine, req.algorithm)
            response["time_aware_methodology"] = TIME_AWARE_METHODOLOGY_NOTE

        if timestamp_matched:
            day = req.target_timestamp[:10]
            iceberg_dates = (day, day)
        else:
            # No timestamp, or it did not match and the latest observations were used instead.
            iceberg_dates = _latest_snapshot_range()
        ice_fields, ice_warnings = _sea_ice_report(engine, result.waypoints, iceberg_dates)
        response.update(ice_fields)
        warnings.extend(ice_warnings)

        response["notes"] = list(response.get("notes", [])) + _methodology_notes()
        if warnings:
            response["warnings"] = warnings

        # Expose snapped coordinates if they differ from requested (small tolerance snap)
        response.update(_snap_fields(engine, vessel))
        return response

    except HTTPException:
        raise
    except ValueError as e:
        err_str = str(e)
        if "No safe route found" in err_str or "No valid grid" in err_str or "not navigable" in err_str.lower():
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "NO_ROUTE_FOUND",
                    "detail": err_str,
                },
            )
        raise HTTPException(
            status_code=400,
            detail={
                "error": "BAD_REQUEST",
                "detail": err_str,
            },
        )
    except Exception:
        logger.exception("Unexpected error in /api/route")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "INTERNAL_ERROR",
                "detail": "An unexpected error occurred while computing the route. Check server logs.",
            },
        )


@app.post("/api/route/recalculate")
def recalculate_route(req: RecalculateRequest):
    """
    Adaptive re-route: rebuilds the NavigationEngine with the original plan,
    then recalculates using each iceberg's latest real observation.

    Semantics (deliberately unchanged, and stated in the response warnings):
    - initial_target_timestamp = snapshot the original plan was made against
      (an unknown timestamp now falls back to the latest data WITH a warning);
    - the updated state is each iceberg's latest recorded observation, which is
      NOT a single consistent point in time and NOT a forecast for the original
      departure;
    - the first route is computed only to seed the engine and is not returned.

    Error codes are identical to /api/route.
    """
    _validate_mission_request(req)

    if not os.path.exists(CSV_PATH):
        raise HTTPException(
            status_code=500,
            detail={
                "error": "DATASET_MISSING",
                "detail": f"Iceberg prediction dataset not found at {CSV_PATH}",
            },
        )

    warnings = _collect_warnings()

    try:
        vessel = VesselProfile.from_dict(_build_vessel_dict(req))

        initial_preds, _ = _load_predictions(req.initial_target_timestamp, warnings)
        engine = NavigationEngine(
            vessel=vessel,
            iceberg_predictions=initial_preds,
            environmental_data=_SEA_ICE_ENV,
            grid_resolution_deg=_GRID_RESOLUTION_DEG,
        )

        _require_navigable(engine, vessel)

        engine.compute_route(algorithm=req.algorithm)

        # target_timestamp omitted: adapter picks each iceberg's latest real observation.
        updated_preds = IcebergPredictionAdapter.from_tanusha_csv_file(CSV_PATH)
        result = engine.update_predictions_and_recalculate(updated_preds, algorithm=req.algorithm)

        response = result.to_dict()
        response["icebergs"] = [p.to_dict() for p in _relevant_icebergs(vessel, updated_preds)]
        response["iceberg_prediction_count"] = len(updated_preds)
        response["forecast_horizon_hours"] = _max_forecast_horizon(updated_preds)

        if req.time_aware:
            response["time_aware_route_options"] = _build_time_aware_route_options(engine, req.algorithm)
            response["time_aware_methodology"] = TIME_AWARE_METHODOLOGY_NOTE

        note = _latest_snapshot_warning("Recalculation uses the latest data:")
        if note:
            warnings.append(note + " It is not a forecast for the original departure time.")
        ice_fields, ice_warnings = _sea_ice_report(engine, result.waypoints, _latest_snapshot_range())
        response.update(ice_fields)
        warnings.extend(ice_warnings)

        response["notes"] = list(response.get("notes", [])) + _methodology_notes()
        if warnings:
            response["warnings"] = warnings

        response.update(_snap_fields(engine, vessel))
        return response

    except HTTPException:
        raise
    except ValueError as e:
        err_str = str(e)
        if "No safe route found" in err_str or "No valid grid" in err_str:
            raise HTTPException(
                status_code=422,
                detail={"error": "NO_ROUTE_FOUND", "detail": err_str},
            )
        raise HTTPException(
            status_code=400,
            detail={"error": "BAD_REQUEST", "detail": err_str},
        )
    except Exception:
        logger.exception("Unexpected error in /api/route/recalculate")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "INTERNAL_ERROR",
                "detail": "An unexpected error occurred during route recalculation. Check server logs.",
            },
        )


@app.get("/api/analytics/c18b-validation")
def c18b_validation():
    """
    Real C18B model-validation summary, computed live from Tanusha's
    day-over-day results file (24h-ahead prediction vs. the actual next-day
    observed position).
    """
    if not os.path.exists(C18B_VALIDATION_CSV_PATH):
        raise HTTPException(
            status_code=500,
            detail={
                "error": "DATASET_MISSING",
                "detail": f"C18B validation dataset not found at {C18B_VALIDATION_CSV_PATH}",
            },
        )

    try:
        with open(C18B_VALIDATION_CSV_PATH, mode="r", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))

        if not rows:
            raise HTTPException(
                status_code=500,
                detail={"error": "DATASET_EMPTY", "detail": "C18B validation dataset is empty."},
            )

        dt_hours_values = {float(r["dt_hours"]) for r in rows}
        if len(dt_hours_values) != 1:
            raise HTTPException(
                status_code=500,
                detail={
                    "error": "INCONSISTENT_DATASET",
                    "detail": "C18B validation rows do not share a single forecast horizon.",
                },
            )
        horizon_hours = dt_hours_values.pop()

        physics_errors_ms = [float(r["physics_error"]) for r in rows]
        hybrid_errors_ms = [float(r["hybrid_error"]) for r in rows]

        def mean(values: list) -> float:
            return sum(values) / len(values)

        seconds = horizon_hours * 3600.0
        mean_physics_error_km = mean(physics_errors_ms) * seconds / 1000.0
        mean_hybrid_error_km = mean(hybrid_errors_ms) * seconds / 1000.0

        return {
            "iceberg_id": "C18B",
            "sample_count": len(rows),
            "forecast_horizon_hours": horizon_hours,
            "mean_physics_error_ms": round(mean(physics_errors_ms), 4),
            "mean_hybrid_error_ms": round(mean(hybrid_errors_ms), 4),
            "mean_physics_error_km": round(mean_physics_error_km, 2),
            "mean_hybrid_error_km": round(mean_hybrid_error_km, 2),
            "other_horizons_available": False,
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Unexpected error in /api/analytics/c18b-validation")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "INTERNAL_ERROR",
                "detail": "An unexpected error occurred reading C18B validation data.",
            },
        )


# ---------------------------------------------------------------------------
# Prediction (Tanusha) — a standalone, read-only capability. Deliberately
# separate from /api/route: it does not touch VesselProfile, the risk engine,
# NavigationEngine, or the routing dataset in any way. See
# backend/routing/icewise/tanusha_bridge.py for the normalization boundary
# used to feed this into the risk engine OUTSIDE of this endpoint (tests
# only, for now — not wired into any routing request).
# ---------------------------------------------------------------------------

class PredictionRegion(BaseModel):
    min_lat: float
    max_lat: float
    min_lon: float
    max_lon: float


class PredictionMissionRequest(BaseModel):
    region: PredictionRegion
    start_time: str
    horizon_hours: List[float] = [24.0, 48.0, 72.0]


@app.post("/api/prediction/mission")
def prediction_mission(req: PredictionMissionRequest):
    """
    Historical-replay iceberg trajectory prediction (Tanusha's physics + ML
    hybrid model) for an arbitrary region / historical date / forecast
    horizon set — NOT a live forecast, and NOT connected to /api/route or
    any routing/risk calculation.

    Response is Tanusha's own documented contract, unmodified:
      status: "OK" | "NO_COVERAGE" | "INVALID_REQUEST"
      OK          -> mission, icebergs[], model, prediction_mode
      NO_COVERAGE -> reason (+ context); a well-formed request that
                     legitimately found no historical data — not an error.
      (INVALID_REQUEST from the prediction module's own business-rule checks
      is translated to HTTP 422 below; structurally malformed JSON is
      rejected by FastAPI/Pydantic as 422 before this function ever runs.)
    """
    try:
        result = predict_icebergs(
            region=req.region.model_dump(),
            start_time=req.start_time,
            horizon_hours=req.horizon_hours,
        )
    except Exception:
        logger.exception("Unexpected error in /api/prediction/mission")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "INTERNAL_ERROR",
                "detail": "An unexpected error occurred while generating the prediction.",
            },
        )

    if result.get("status") == "INVALID_REQUEST":
        raise HTTPException(
            status_code=422,
            detail={"error": "INVALID_REQUEST", "detail": result.get("reason")},
        )

    # OK or NO_COVERAGE: both are legitimate outcomes for a well-formed
    # request, returned as-is — NO_COVERAGE is never turned into a fake OK.
    return result
