"""
Normalization boundary: Tanusha's physics+ML prediction JSON contract
(backend/prediction/predict_iceberg.py -> predict_icebergs()) -> the existing
IcebergPrediction DTOs the risk engine already consumes (interfaces.py).

This is a translation layer only. It does not call the routing engine, does
not touch IcebergPredictionAdapter (the CSV-based path /api/route still
uses), and does not change how IcebergPrediction is interpreted downstream.

Field mapping:
    payload["icebergs"][i]["iceberg_id"]              -> IcebergPrediction.iceberg_id
    payload["icebergs"][i]["current_state"]            -> current_position (Waypoint, t=0)
    payload["icebergs"][i]["predictions"][j]           -> predicted_positions[j]
        .latitude/.longitude                           -> Waypoint.lat/.lon
        .forecast_hours                                -> Waypoint.time_offset_hours
        .uncertainty_km (max across j)                 -> spatial_uncertainty_km
            (identical convention to IcebergPredictionAdapter.from_tanusha_csv_rows:
             the risk engine's IcebergPrediction has ONE scalar uncertainty, not one
             per horizon, so the max over the reported horizons is used — same rule,
             same reasoning as the existing CSV adapter, not a new convention.)

uncertainty_km is carried through as `spatial_uncertainty_km` — a positional
uncertainty radius in km, exactly what the risk engine already expects that
field to mean (see ProbabilisticRiskEngine: it feeds a Gaussian spatial
spread, sigma). It is NEVER treated as a collision probability, a confidence
percentage, or a calibrated statistical interval — Tanusha's contract does
not provide any of those, and this bridge does not invent them.

confidence_score / drift_velocity_knots / drift_bearing_deg / size_category
are not present in Tanusha's contract either. They get the exact same
adapter-default values IcebergPredictionAdapter already uses for the CSV
path (0.90 / 0.0 / 0.0 / MEDIUM) — see the identical comment there — so a
route computed from either source is scored on the same footing, not
arbitrarily biased toward or against one.
"""

from typing import Any, Dict, List

from icewise.interfaces import IcebergPrediction, IcebergSizeCategory, Waypoint

# Same defaults as IcewiseIcebergPredictionAdapter.from_tanusha_csv_rows() —
# ADAPTER DEFAULTS, NOT MODEL OUTPUTS. Neither Tanusha's contract nor the
# existing CSV path supplies these; kept identical so neither source is
# scored differently by the risk engine because of a placeholder mismatch.
_DEFAULT_CONFIDENCE_SCORE = 0.90
_MIN_SPATIAL_UNCERTAINTY_KM = 0.5
_FALLBACK_SPATIAL_UNCERTAINTY_KM = 2.5


class TanushaPredictionError(ValueError):
    """Raised only for a payload that isn't a usable OK prediction result."""


def normalize_tanusha_prediction(payload: Dict[str, Any]) -> List[IcebergPrediction]:
    """
    Converts one predict_icebergs() response into IcebergPrediction DTOs.

    Only accepts a `{"status": "OK", "icebergs": [...]}` payload — the
    documented shape. NO_COVERAGE and INVALID_REQUEST are legitimate,
    non-error results from predict_icebergs() itself, but they carry no
    icebergs to normalize, so calling this with one of those is treated as a
    caller mistake (raises) rather than silently returning an empty list,
    which could be mistaken for "coverage exists but no icebergs were
    nearby". Callers should check `payload["status"]` first.
    """
    if not isinstance(payload, dict) or payload.get("status") != "OK":
        raise TanushaPredictionError(
            f"normalize_tanusha_prediction() requires a status=OK payload, got status={payload.get('status') if isinstance(payload, dict) else type(payload)!r}"
        )

    icebergs = payload.get("icebergs")
    if not isinstance(icebergs, list):
        raise TanushaPredictionError("payload['icebergs'] missing or not a list")

    results: List[IcebergPrediction] = []
    for ib in icebergs:
        iceberg_id = str(ib["iceberg_id"])

        current_state = ib["current_state"]
        current_position = Waypoint(
            lat=float(current_state["latitude"]),
            lon=float(current_state["longitude"]),
            time_offset_hours=0.0,
        )

        predicted_positions: List[Waypoint] = []
        uncertainties: List[float] = []
        for p in ib.get("predictions", []):
            predicted_positions.append(
                Waypoint(
                    lat=float(p["latitude"]),
                    lon=float(p["longitude"]),
                    time_offset_hours=float(p["forecast_hours"]),
                )
            )
            uncertainties.append(float(p["uncertainty_km"]))

        spatial_uncertainty_km = max(uncertainties) if uncertainties else _FALLBACK_SPATIAL_UNCERTAINTY_KM
        spatial_uncertainty_km = max(_MIN_SPATIAL_UNCERTAINTY_KM, spatial_uncertainty_km)

        results.append(
            IcebergPrediction(
                iceberg_id=iceberg_id,
                current_position=current_position,
                predicted_positions=predicted_positions,
                spatial_uncertainty_km=spatial_uncertainty_km,
                confidence_score=_DEFAULT_CONFIDENCE_SCORE,
                drift_velocity_knots=0.0,
                drift_bearing_deg=0.0,
                size_category=IcebergSizeCategory.MEDIUM,
            )
        )

    return results
