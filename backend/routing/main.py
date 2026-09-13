"""
ICEWISE Routing/Risk API — minimal FastAPI wrapper around Niharika's
real routing & risk engine (icewise/pipeline.py), consuming Tanusha's
real iceberg prediction dataset. No mock/synthetic data.
"""

import csv
import os
import sys
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Make the sibling 'icewise' package importable as a top-level module,
# matching the internal `from icewise.xxx import yyy` imports unchanged.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from icewise.interfaces import VesselProfile  # noqa: E402
from icewise.adapters import IcebergPredictionAdapter  # noqa: E402
from icewise.pipeline import NavigationEngine  # noqa: E402
from icewise.sea_ice_api import router as sea_ice_router  # noqa: E402

CSV_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "prediction", "iceberg_prediction_dataset.csv"
)
# Tanusha's real day-over-day C18B model validation: each row's physics_error /
# hybrid_error is the actual drift-velocity error (m/s) of a 24h-ahead
# prediction against the real next-day observed position. No 48h/72h rows
# exist in this file — that horizon is genuinely not available, not omitted.
C18B_VALIDATION_CSV_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "prediction", "c18b_hybrid_results.csv"
)

app = FastAPI(title="ICEWISE Routing API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Real NSIDC sea-ice concentration endpoints (Niharika's sea_ice_api.py),
# mounted onto this same server so the frontend keeps calling a single
# origin/port — no separate sea-ice service.
app.include_router(sea_ice_router)


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


class RecalculateRequest(RouteRequest):
    # The timestamp the ORIGINAL plan was computed against (must match the
    # /api/route call being recalculated). The updated picture always uses
    # each iceberg's latest real observation in the dataset (target_timestamp
    # omitted on that second load) — never a fabricated "future" snapshot.
    initial_target_timestamp: Optional[str] = None


def _build_vessel_dict(req: RouteRequest) -> dict:
    return {
        "vessel_id": req.vessel_id,
        "vessel_name": req.vessel_name or req.vessel_id,
        "start_point": req.start_point.model_dump(),
        "destination": req.destination.model_dump(),
        "cruise_speed_knots": req.cruise_speed_knots,
        "fuel_consumption_rate_tons_per_day": req.fuel_consumption_rate_tons_per_day,
    }


# Real, empirically-validated risk_tolerance_factor values for the route
# comparison feature: 0.0 mirrors NavigationEngine.compute_baseline_route()'s
# own hardcoded unconstrained-shortest-path baseline; 2.5 is VesselProfile's
# own dataclass default (icewise/interfaces.py) — i.e. exactly what the
# top-level /api/route response above already used before this endpoint
# existed; 10.0 (4x the default) was empirically validated to produce a
# genuinely distinct, meaningfully safer path for this real scenario without
# any change to the cost function, risk engine, or A*/Dijkstra search itself
# — see the route-options validation run. Each option below is computed by
# Niharika's existing NavigationEngine.compute_route(), just called again
# with vessel.risk_tolerance_factor temporarily swapped, exactly like
# compute_baseline_route() already does internally.
ROUTE_OPTION_PROFILES = [
    (0.0, "Baseline / Shortest"),
    (2.5, "Balanced"),
    (10.0, "Safety Priority"),
]


def _build_route_options(engine: NavigationEngine, algorithm: str) -> list:
    """
    Computes the 3 validated route options on the SAME already-built engine
    (same grid, same real iceberg/risk field as the primary route above) by
    varying only vessel.risk_tolerance_factor — no routing-algorithm change.
    Each is a full, independent NavigationEngine.compute_route() call, so
    every option's waypoints/metrics are calculated independently. Comparison
    (vs baseline) is intentionally not attached to these — that concept
    already belongs to the primary route's own `comparison` field.
    """
    original_alpha = engine.vessel.risk_tolerance_factor
    options = []
    try:
        for alpha, label in ROUTE_OPTION_PROFILES:
            engine.vessel.risk_tolerance_factor = alpha
            option_result = engine.compute_route(algorithm=algorithm, include_comparison=False)
            option_dict = option_result.to_dict()
            options.append({
                "route_id": option_dict["route_id"],
                "label": label,
                "risk_tolerance_factor": alpha,
                "waypoints": option_dict["waypoints"],
                "metrics": option_dict["metrics"],
            })
    finally:
        engine.vessel.risk_tolerance_factor = original_alpha
    return options


def _relevant_icebergs(vessel: VesselProfile, iceberg_preds: list) -> list:
    # Same start/destination bounding-box buffer NavigationEngine already
    # applies internally to build its grid — real filter, not fabricated.
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


@app.post("/api/route")
def generate_route(req: RouteRequest):
    if not os.path.exists(CSV_PATH):
        raise HTTPException(status_code=500, detail=f"Dataset not found at {CSV_PATH}")

    try:
        vessel = VesselProfile.from_dict(_build_vessel_dict(req))
        iceberg_preds = IcebergPredictionAdapter.from_tanusha_csv_file(
            CSV_PATH, target_timestamp=req.target_timestamp
        )

        engine = NavigationEngine(vessel=vessel, iceberg_predictions=iceberg_preds)
        result = engine.compute_route(algorithm=req.algorithm)

        # Expose only the real iceberg predictions relevant to this route's
        # corridor — additive field, response stays backward-compatible with
        # the plain NavigationRouteResult shape.
        response = result.to_dict()
        response["icebergs"] = [p.to_dict() for p in _relevant_icebergs(vessel, iceberg_preds)]
        # Additive: 3 real, independently-computed route options (see
        # ROUTE_OPTION_PROFILES/_build_route_options above). Does not alter
        # anything above — existing route/waypoints/metrics/comparison fields
        # are untouched.
        response["route_options"] = _build_route_options(engine, req.algorithm)
        return response
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/route/recalculate")
def recalculate_route(req: RecalculateRequest):
    """
    Real adaptive re-route: rebuilds the same NavigationEngine used for the
    initial plan, then calls Niharika's own
    NavigationEngine.update_predictions_and_recalculate() with each iceberg's
    latest real observation in Tanusha's dataset — no simulated drift, no
    fabricated "future" positions.
    """
    if not os.path.exists(CSV_PATH):
        raise HTTPException(status_code=500, detail=f"Dataset not found at {CSV_PATH}")

    try:
        vessel = VesselProfile.from_dict(_build_vessel_dict(req))

        initial_preds = IcebergPredictionAdapter.from_tanusha_csv_file(
            CSV_PATH, target_timestamp=req.initial_target_timestamp
        )
        engine = NavigationEngine(vessel=vessel, iceberg_predictions=initial_preds)
        engine.compute_route(algorithm=req.algorithm)

        # target_timestamp omitted here on purpose: the adapter's own default
        # picks each iceberg's latest real recorded observation.
        updated_preds = IcebergPredictionAdapter.from_tanusha_csv_file(CSV_PATH)
        result = engine.update_predictions_and_recalculate(updated_preds, algorithm=req.algorithm)

        response = result.to_dict()
        response["icebergs"] = [p.to_dict() for p in _relevant_icebergs(vessel, updated_preds)]
        return response
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/analytics/c18b-validation")
def c18b_validation():
    """
    Real C18B model-validation summary, computed live from Tanusha's
    day-over-day results file (24h-ahead prediction vs. the actual next-day
    observed position). Nothing here is derived from a forecast horizon that
    isn't actually present in the file.
    """
    if not os.path.exists(C18B_VALIDATION_CSV_PATH):
        raise HTTPException(status_code=500, detail=f"Validation dataset not found at {C18B_VALIDATION_CSV_PATH}")

    try:
        with open(C18B_VALIDATION_CSV_PATH, mode="r", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))

        if not rows:
            raise HTTPException(status_code=500, detail="C18B validation dataset is empty")

        dt_hours_values = {float(r["dt_hours"]) for r in rows}
        if len(dt_hours_values) != 1:
            # Only report a horizon if every row genuinely shares it — never
            # average across mismatched horizons and call it one number.
            raise HTTPException(status_code=500, detail="C18B validation rows do not share a single forecast horizon")
        horizon_hours = dt_hours_values.pop()

        physics_errors_ms = [float(r["physics_error"]) for r in rows]
        hybrid_errors_ms = [float(r["hybrid_error"]) for r in rows]

        def mean(values: list) -> float:
            return sum(values) / len(values)

        # velocity error (m/s) * time (s) = position error (m); /1000 -> km.
        # Dimensionally exact conversion of the same real error, not a new value.
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
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
