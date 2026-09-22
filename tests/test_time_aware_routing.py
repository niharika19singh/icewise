"""
Time-aware routing test suite (SIH Grand Finale upgrade).

Covers the new, additive, opt-in `time_aware` capability:
  - NavigationGridGraph.compute_time_aware_node_risk returns a risk snapshot
    keyed by estimated arrival time, without mutating the static node_risk.
  - NavigationEngine.compute_time_aware_route restores graph state afterward.
  - calculate_route_metrics now also returns per-waypoint risk (waypoint_risks),
    exposed on NavigationRouteResult.to_dict().
  - POST /api/route and /api/route/recalculate: `time_aware=False` (default)
    is byte-for-byte unaffected; `time_aware=True` adds time_aware_route_options
    alongside (not instead of) the existing static route_options.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", "routing")))

from icewise.interfaces import VesselProfile, Waypoint, IcebergPrediction, IcebergSizeCategory
from icewise.risk_engine import ProbabilisticRiskEngine
from icewise.grid_graph import NavigationGridGraph
from icewise.pipeline import NavigationEngine
from icewise.metrics import calculate_route_metrics


def _weddell_vessel() -> VesselProfile:
    return VesselProfile.from_dict({
        "vessel_id": "TEST-VESSEL-TA",
        "vessel_name": "Test Vessel Time-Aware",
        "start_point": {"lat": -77.0, "lon": -42.0},
        "destination": {"lat": -74.5, "lon": -40.0},
        "cruise_speed_knots": 12.0,
        "fuel_consumption_rate_tons_per_day": 15.0,
    })


def _iceberg_with_drift() -> IcebergPrediction:
    """A single real-shaped iceberg that drifts from near the start toward the
    corridor over 72h, so its risk field genuinely differs between t=0 and a
    later ETA (needed to prove time-awareness actually changes something)."""
    return IcebergPrediction(
        iceberg_id="TA23A",
        current_position=Waypoint(lat=-76.9, lon=-41.9, time_offset_hours=0.0),
        predicted_positions=[
            Waypoint(lat=-75.9, lon=-41.0, time_offset_hours=24.0),
            Waypoint(lat=-75.3, lon=-40.6, time_offset_hours=48.0),
            Waypoint(lat=-74.8, lon=-40.2, time_offset_hours=72.0),
        ],
        spatial_uncertainty_km=5.0,
        confidence_score=0.9,
        size_category=IcebergSizeCategory.LARGE,
    )


class TestComputeTimeAwareNodeRisk:
    def test_returns_new_dict_without_mutating_static_node_risk(self):
        vessel = _weddell_vessel()
        risk_engine = ProbabilisticRiskEngine(iceberg_predictions=[_iceberg_with_drift()])
        graph = NavigationGridGraph(
            lat_min=-78.25, lat_max=-73.5, lon_min=-43.0, lon_max=-39.0,
            resolution_deg=0.1, risk_engine=risk_engine,
        )
        static_before = dict(graph.node_risk)

        time_aware = graph.compute_time_aware_node_risk(vessel.start_point, vessel.cruise_speed_knots)

        assert set(time_aware.keys()) == set(graph.nodes)
        assert graph.node_risk == static_before  # untouched

    def test_differs_from_static_envelope_for_a_drifting_iceberg(self):
        """The whole point of time-awareness: a cell far from the iceberg's
        current position but on its future track should show LOWER risk under
        the static worst-case envelope (which already accounts for every
        forecast position) being reduced once ETA-based evaluation only
        weighs the iceberg's interpolated position at that specific time,
        for at least one node in the grid."""
        vessel = _weddell_vessel()
        risk_engine = ProbabilisticRiskEngine(iceberg_predictions=[_iceberg_with_drift()])
        graph = NavigationGridGraph(
            lat_min=-78.25, lat_max=-73.5, lon_min=-43.0, lon_max=-39.0,
            resolution_deg=0.1, risk_engine=risk_engine,
        )
        time_aware = graph.compute_time_aware_node_risk(vessel.start_point, vessel.cruise_speed_knots)

        differs = any(
            abs(time_aware[node] - graph.node_risk[node]) > 1e-9
            for node in graph.nodes
        )
        assert differs, "time-aware risk grid should differ from the static envelope somewhere"

    def test_zero_speed_falls_back_to_t0_without_crashing(self):
        vessel = _weddell_vessel()
        risk_engine = ProbabilisticRiskEngine(iceberg_predictions=[_iceberg_with_drift()])
        graph = NavigationGridGraph(
            lat_min=-78.25, lat_max=-73.5, lon_min=-43.0, lon_max=-39.0,
            resolution_deg=0.1, risk_engine=risk_engine,
        )
        time_aware = graph.compute_time_aware_node_risk(vessel.start_point, 0.0)
        assert set(time_aware.keys()) == set(graph.nodes)


class TestCalculateRouteMetricsWaypointRisks:
    def test_waypoint_risks_matches_waypoints_length_and_derives_mean_max(self):
        path = [(-77.0, -42.0), (-76.0, -41.5), (-74.5, -40.0)]
        vessel = _weddell_vessel()
        risk_engine = ProbabilisticRiskEngine(iceberg_predictions=[_iceberg_with_drift()])

        metrics, waypoints, path_risks = calculate_route_metrics(path, vessel, risk_engine)

        assert len(path_risks) == len(waypoints)
        assert metrics.mean_risk_score == pytest.approx(sum(path_risks) / len(path_risks))
        assert metrics.max_risk_score == pytest.approx(max(path_risks))


class TestComputeTimeAwareRoute:
    def test_restores_static_node_risk_after_running(self):
        vessel = _weddell_vessel()
        engine = NavigationEngine(
            vessel=vessel,
            iceberg_predictions=[_iceberg_with_drift()],
            grid_resolution_deg=0.1,
        )
        static_before = dict(engine.graph.node_risk)

        result = engine.compute_time_aware_route(algorithm="A*")

        assert engine.graph.node_risk == static_before
        assert result.waypoints[0].time_offset_hours == 0.0
        assert result.waypoint_risks is not None
        assert any("Time-aware routing" in n for n in result.notes)

    def test_does_not_affect_a_subsequent_static_compute_route(self):
        vessel = _weddell_vessel()
        engine = NavigationEngine(
            vessel=vessel,
            iceberg_predictions=[_iceberg_with_drift()],
            grid_resolution_deg=0.1,
        )
        static_result_before = engine.compute_route(algorithm="A*", include_comparison=False)
        engine.compute_time_aware_route(algorithm="A*")
        static_result_after = engine.compute_route(algorithm="A*", include_comparison=False)

        assert static_result_before.metrics.total_distance_nm == pytest.approx(
            static_result_after.metrics.total_distance_nm
        )


class TestTimeAwareAPI:
    @pytest.fixture(scope="class")
    @classmethod
    def client(cls):
        try:
            from fastapi.testclient import TestClient
            from backend.routing.main import app
            return TestClient(app, raise_server_exceptions=False)
        except ImportError:
            pytest.skip("fastapi[testclient] not installed")

    def _weddell_payload(self, **overrides):
        payload = {
            "vessel_id": "TEST-VESSEL-TA",
            "start_point": {"lat": -77.0, "lon": -42.0},
            "destination": {"lat": -74.5, "lon": -40.0},
            "cruise_speed_knots": 12.0,
            "fuel_consumption_rate_tons_per_day": 15.0,
            "algorithm": "A*",
            "target_timestamp": "2020-01-02T00:00:00Z",
        }
        payload.update(overrides)
        return payload

    def test_default_response_has_no_time_aware_fields(self, client):
        resp = client.post("/api/route", json=self._weddell_payload())
        assert resp.status_code == 200
        data = resp.json()
        assert "time_aware_route_options" not in data
        assert "time_aware_methodology" not in data
        # Additive fields that ARE always present now:
        assert "waypoint_risks" in data
        assert "forecast_horizon_hours" in data

    def test_time_aware_true_adds_parallel_option_set(self, client):
        resp = client.post("/api/route", json=self._weddell_payload(time_aware=True))
        assert resp.status_code == 200
        data = resp.json()

        assert "route_options" in data  # unchanged, still present
        assert "time_aware_route_options" in data
        assert "time_aware_methodology" in data

        static_labels = {o["label"] for o in data["route_options"]}
        time_aware_labels = {o["label"] for o in data["time_aware_route_options"]}
        assert static_labels == time_aware_labels == {"Baseline / Shortest", "Balanced", "Safety Priority"}

        for option in data["time_aware_route_options"]:
            if "metrics" in option:
                assert "waypoint_risks" in option
                assert len(option["waypoint_risks"]) == len(option["waypoints"])

    def test_recalculate_time_aware_true_adds_parallel_option_set(self, client):
        payload = self._weddell_payload(time_aware=True)
        payload["initial_target_timestamp"] = payload.pop("target_timestamp")
        resp = client.post("/api/route/recalculate", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert "time_aware_route_options" in data
        assert "forecast_horizon_hours" in data
