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
import logging
import math
import os
import sys
from typing import Optional

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
from icewise.sea_ice_api import router as sea_ice_router  # noqa: E402

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


def _load_sea_ice() -> None:
    global _SEA_ICE_ENV, _SEA_ICE_WARNING
    from icewise.adapters import load_nsidc_sea_ice_data
    from icewise.interfaces import EnvironmentalData

    json_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                             "icewise", "data", "nsidc_sea_ice_20200102.json")
    if os.path.exists(json_path):
        env = load_nsidc_sea_ice_data(json_path)
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

# Supported Antarctic routing domain (approx.)
_DOMAIN_LAT_MIN = -80.0
_DOMAIN_LAT_MAX = -55.0
_DOMAIN_LAT_MIN_SOFT = -85.0   # absolute floor (no ship goes here)


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


@app.post("/api/route")
def generate_route(req: RouteRequest):
    """
    Compute a risk-aware route from start to destination.

    Returns three route options (Baseline, Balanced, Safety Priority)
    plus the primary route, icebergs in corridor, and all metadata.

    Errors:
      422 VALIDATION_ERROR        — invalid lat/lon, outside domain
      422 OUTSIDE_DOMAIN          — coordinate not in Antarctic routing domain
      422 IDENTICAL_POINTS        — start == destination
      422 COORDINATE_NOT_NAVIGABLE — land or unnavigable point
      422 NO_ROUTE_FOUND          — no feasible path under risk threshold
      500 INTERNAL_ERROR          — unexpected server-side failure
    """
    # 1. Validate coordinates
    _validate_latlon(req.start_point.lat, req.start_point.lon, "start_point")
    _validate_latlon(req.destination.lat, req.destination.lon, "destination")
    _validate_domain(req.start_point.lat, req.start_point.lon, "start_point")
    _validate_domain(req.destination.lat, req.destination.lon, "destination")
    _validate_not_identical(req.start_point.lat, req.start_point.lon,
                            req.destination.lat, req.destination.lon)

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
        iceberg_preds = IcebergPredictionAdapter.from_tanusha_csv_file(
            CSV_PATH, target_timestamp=req.target_timestamp
        )

        if req.target_timestamp and not iceberg_preds:
            # Timestamp specified but no predictions match — warn and fall back
            # to latest available rather than returning empty predictions silently.
            warnings.append(
                f"No iceberg predictions found for timestamp '{req.target_timestamp}'. "
                "Falling back to latest available observations."
            )
            iceberg_preds = IcebergPredictionAdapter.from_tanusha_csv_file(CSV_PATH)

        # Pass the real NSIDC sea-ice data into the routing engine.
        # _SEA_ICE_ENV is always set (may be empty map if file missing — see startup).
        engine = NavigationEngine(
            vessel=vessel,
            iceberg_predictions=iceberg_preds,
            environmental_data=_SEA_ICE_ENV,
        )

        # Pre-validate that start and destination are navigable before running A*/Dijkstra.
        # This gives a clear error message rather than a cryptic routing failure.
        start_wp = vessel.start_point
        dest_wp = vessel.destination
        start_ok, start_reason = engine.graph.check_point_navigable(start_wp)
        if not start_ok:
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "COORDINATE_NOT_NAVIGABLE",
                    "field": "start_point",
                    "detail": start_reason,
                },
            )
        dest_ok, dest_reason = engine.graph.check_point_navigable(dest_wp)
        if not dest_ok:
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "COORDINATE_NOT_NAVIGABLE",
                    "field": "destination",
                    "detail": dest_reason,
                },
            )

        result = engine.compute_route(algorithm=req.algorithm)

        response = result.to_dict()
        response["icebergs"] = [p.to_dict() for p in _relevant_icebergs(vessel, iceberg_preds)]
        response["route_options"] = _build_route_options(engine, req.algorithm)
        response["sea_ice_integrated"] = bool(_SEA_ICE_ENV and _SEA_ICE_ENV.ice_concentration_map)
        response["iceberg_prediction_count"] = len(iceberg_preds)
        if warnings:
            response["warnings"] = warnings

        # Expose snapped coordinates if they differ from requested (small tolerance snap)
        start_node = engine.graph.find_nearest_node(start_wp)
        dest_node = engine.graph.find_nearest_node(dest_wp)
        snaps = {}
        if abs(start_node[0] - start_wp.lat) > 1e-4 or abs(start_node[1] - start_wp.lon) > 1e-4:
            snaps["snapped_start"] = {"lat": start_node[0], "lon": start_node[1]}
            snaps["snapped_start_reason"] = "Coordinate snapped to nearest navigable grid node."
        if abs(dest_node[0] - dest_wp.lat) > 1e-4 or abs(dest_node[1] - dest_wp.lon) > 1e-4:
            snaps["snapped_destination"] = {"lat": dest_node[0], "lon": dest_node[1]}
            snaps["snapped_destination_reason"] = "Coordinate snapped to nearest navigable grid node."
        if snaps:
            response.update(snaps)

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

    Preserves OBSERVE → PREDICT → REASSESS → RE-ROUTE semantics:
    - initial_target_timestamp = snapshot the original plan was made against
    - Latest predictions are loaded from the dataset automatically
    - New risk field is built and A*/Dijkstra re-run on updated grid

    Error codes are identical to /api/route.
    """
    _validate_latlon(req.start_point.lat, req.start_point.lon, "start_point")
    _validate_latlon(req.destination.lat, req.destination.lon, "destination")
    _validate_domain(req.start_point.lat, req.start_point.lon, "start_point")
    _validate_domain(req.destination.lat, req.destination.lon, "destination")
    _validate_not_identical(req.start_point.lat, req.start_point.lon,
                            req.destination.lat, req.destination.lon)

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

        initial_preds = IcebergPredictionAdapter.from_tanusha_csv_file(
            CSV_PATH, target_timestamp=req.initial_target_timestamp
        )
        engine = NavigationEngine(
            vessel=vessel,
            iceberg_predictions=initial_preds,
            environmental_data=_SEA_ICE_ENV,
        )

        start_ok, start_reason = engine.graph.check_point_navigable(vessel.start_point)
        if not start_ok:
            raise HTTPException(
                status_code=422,
                detail={"error": "COORDINATE_NOT_NAVIGABLE", "field": "start_point", "detail": start_reason},
            )
        dest_ok, dest_reason = engine.graph.check_point_navigable(vessel.destination)
        if not dest_ok:
            raise HTTPException(
                status_code=422,
                detail={"error": "COORDINATE_NOT_NAVIGABLE", "field": "destination", "detail": dest_reason},
            )

        engine.compute_route(algorithm=req.algorithm)

        # target_timestamp omitted: adapter picks each iceberg's latest real observation.
        updated_preds = IcebergPredictionAdapter.from_tanusha_csv_file(CSV_PATH)
        result = engine.update_predictions_and_recalculate(updated_preds, algorithm=req.algorithm)

        response = result.to_dict()
        response["icebergs"] = [p.to_dict() for p in _relevant_icebergs(vessel, updated_preds)]
        response["sea_ice_integrated"] = bool(_SEA_ICE_ENV and _SEA_ICE_ENV.ice_concentration_map)
        response["iceberg_prediction_count"] = len(updated_preds)
        if warnings:
            response["warnings"] = warnings

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
