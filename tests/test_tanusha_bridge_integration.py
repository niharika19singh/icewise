"""
Phase 5 isolated integration test: Tanusha's prediction pipeline ->
normalization bridge -> existing risk/routing engine, WITHOUT touching
/api/route or any production request path.

Purpose: verify the bridge produces usable IcebergPrediction DTOs and that
the existing NavigationEngine can consume them without crashing or losing
data — NOT to prove the hybrid model is more accurate. Skill was already
audited separately and is not re-litigated here.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", "routing")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", "prediction")))

from icewise.adapters import IcebergPredictionAdapter, load_nsidc_sea_ice_data
from icewise.interfaces import VesselProfile
from icewise.pipeline import NavigationEngine
from icewise.tanusha_bridge import TanushaPredictionError, normalize_tanusha_prediction
from predict_iceberg import predict_icebergs

CSV_PATH = os.path.join(
    os.path.dirname(__file__), "..", "backend", "prediction", "iceberg_prediction_dataset.csv"
)

# The verified Weddell mission from the end-to-end pipeline check: all 4
# Weddell-corridor icebergs co-occur on this real historical date.
WEDDELL_REGION = {"min_lat": -77.0, "max_lat": -62.5, "min_lon": -52.0, "max_lon": -30.0}
WEDDELL_START_TIME = "2020-09-24T00:00:00Z"
WEDDELL_HORIZONS = [24.0, 48.0, 72.0]

# Same demo corridor /api/route uses by default.
DEMO_VESSEL = {
    "vessel_id": "TEST-VESSEL",
    "start_point": {"lat": -77.0, "lon": -42.0},
    "destination": {"lat": -74.5, "lon": -40.0},
    "cruise_speed_knots": 12.0,
    "fuel_consumption_rate_tons_per_day": 15.0,
}


def _demo_vessel():
    return VesselProfile.from_dict(DEMO_VESSEL)


def _sea_ice():
    return load_nsidc_sea_ice_data()


_TANUSHA_CACHE = {}


def _tanusha_payload():
    if "r" not in _TANUSHA_CACHE:
        _TANUSHA_CACHE["r"] = predict_icebergs(WEDDELL_REGION, WEDDELL_START_TIME, WEDDELL_HORIZONS)
    return _TANUSHA_CACHE["r"]


# ---------------------------------------------------------------------------
# 1. Prediction pipeline itself
# ---------------------------------------------------------------------------

class TestTanushaWeddellPrediction:
    def test_status_ok_four_icebergs(self):
        payload = _tanusha_payload()
        assert payload["status"] == "OK"
        assert len(payload["icebergs"]) == 4
        assert {ib["iceberg_id"] for ib in payload["icebergs"]} == {"A23A", "A63", "B09I", "D21B"}

    def test_each_iceberg_has_three_forecast_points(self):
        payload = _tanusha_payload()
        for ib in payload["icebergs"]:
            assert len(ib["predictions"]) == 3
            assert [p["forecast_hours"] for p in ib["predictions"]] == [24.0, 48.0, 72.0]


# ---------------------------------------------------------------------------
# 2. Normalization bridge
# ---------------------------------------------------------------------------

class TestNormalizationBridge:
    def test_rejects_non_ok_payloads(self):
        with pytest.raises(TanushaPredictionError):
            normalize_tanusha_prediction({"status": "NO_COVERAGE", "reason": "x"})
        with pytest.raises(TanushaPredictionError):
            normalize_tanusha_prediction({"status": "INVALID_REQUEST", "reason": "x"})

    def test_normalizes_four_icebergs_no_schema_loss(self):
        preds = normalize_tanusha_prediction(_tanusha_payload())
        assert len(preds) == 4
        by_id = {p.iceberg_id: p for p in preds}
        assert set(by_id) == {"A23A", "A63", "B09I", "D21B"}

        a23a = by_id["A23A"]
        # current_state -> current_position, exact position preserved
        assert a23a.current_position.lat == -75.5506
        assert a23a.current_position.lon == -40.3833
        assert a23a.current_position.time_offset_hours == 0.0
        # predictions[] -> predicted_positions, all 3 horizons preserved
        assert len(a23a.predicted_positions) == 3
        assert [w.time_offset_hours for w in a23a.predicted_positions] == [24.0, 48.0, 72.0]
        assert a23a.predicted_positions[0].lat == -75.541185
        assert a23a.predicted_positions[0].lon == -40.403435
        # uncertainty_km -> spatial_uncertainty_km, same "max across horizons"
        # convention as IcebergPredictionAdapter.from_tanusha_csv_rows
        raw_unc = [p["uncertainty_km"] for p in _tanusha_payload()["icebergs"][0]["predictions"]]
        assert a23a.spatial_uncertainty_km == max(raw_unc)

    def test_uncertainty_never_reinterpreted_as_confidence(self):
        """spatial_uncertainty_km must be a plain km radius, never in [0,1] as if it
        were a probability, and confidence_score must be the same fixed adapter
        default used elsewhere — never derived from uncertainty_km."""
        preds = normalize_tanusha_prediction(_tanusha_payload())
        for p in preds:
            assert p.spatial_uncertainty_km > 1.0  # a real km radius, not a [0,1] probability
            assert p.confidence_score == 0.90  # fixed adapter default, not derived from uncertainty


# ---------------------------------------------------------------------------
# 3-5. Feed into the EXISTING risk/routing engine (no /api/route involved)
# ---------------------------------------------------------------------------

class TestRiskEngineIntegration:
    def test_navigation_engine_accepts_tanusha_predictions_without_crashing(self):
        preds = normalize_tanusha_prediction(_tanusha_payload())
        engine = NavigationEngine(vessel=_demo_vessel(), iceberg_predictions=preds, environmental_data=_sea_ice())
        result = engine.compute_route(algorithm="A*")

        # No schema loss: every normalized iceberg actually reached the risk engine.
        assert len(engine.risk_engine.iceberg_predictions) == 4
        assert result.metrics.total_distance_nm > 0
        assert len(result.waypoints) > 1
        assert 0.0 <= result.metrics.mean_risk_score <= 1.0
        assert 0.0 <= result.metrics.max_risk_score <= 1.0

    def test_route_options_all_solvable_with_tanusha_predictions(self):
        """Mirrors _build_route_options in main.py: baseline/balanced/safety all
        computable on the Tanusha-sourced risk field, same as the CSV path."""
        preds = normalize_tanusha_prediction(_tanusha_payload())
        engine = NavigationEngine(vessel=_demo_vessel(), iceberg_predictions=preds, environmental_data=_sea_ice())
        for alpha in (0.0, 2.5, 10.0):
            engine.vessel.risk_tolerance_factor = alpha
            result = engine.compute_route(algorithm="A*", include_comparison=False)
            assert result.metrics.total_distance_nm > 0


# ---------------------------------------------------------------------------
# 6. Honest comparison: Tanusha-sourced risk field vs the existing
# CSV-sourced risk field, same corridor, same sea ice. Dates necessarily
# differ (iceberg_prediction_dataset.csv has no 2020-09-24 row — see the
# written report for why), so this is NOT a controlled ablation; it reports
# both, it does not assert one is better.
# ---------------------------------------------------------------------------

class TestExistingVsTanushaComparison:
    def test_both_sources_produce_a_navigable_route_on_the_demo_corridor(self):
        vessel_a = _demo_vessel()
        vessel_b = _demo_vessel()
        sea_ice = _sea_ice()

        existing_preds = IcebergPredictionAdapter.from_tanusha_csv_file(CSV_PATH, target_timestamp="2020-01-02T00:00:00Z")
        tanusha_preds = normalize_tanusha_prediction(_tanusha_payload())

        engine_existing = NavigationEngine(vessel=vessel_a, iceberg_predictions=existing_preds, environmental_data=sea_ice)
        engine_tanusha = NavigationEngine(vessel=vessel_b, iceberg_predictions=tanusha_preds, environmental_data=sea_ice)

        result_existing = engine_existing.compute_route(algorithm="A*")
        result_tanusha = engine_tanusha.compute_route(algorithm="A*")

        # Both must produce a real, navigable route — this is the actual bar
        # for "the resulting risk field is usable", not whether risk is lower.
        assert result_existing.metrics.total_distance_nm > 0
        assert result_tanusha.metrics.total_distance_nm > 0
        assert result_existing.metrics.safety_index >= 0
        assert result_tanusha.metrics.safety_index >= 0
