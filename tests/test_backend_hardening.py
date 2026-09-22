"""
Backend hardening tests: navigability (supported region), corridor guard,
truthful sea-ice status, recalculation semantics, prediction defaults.

These call the endpoint functions directly (RouteRequest -> generate_route) rather
than through fastapi's TestClient, so they do not need httpx/httpx2 and run in any
environment where fastapi itself is installed.
"""

import inspect
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", "routing")))

from fastapi import HTTPException

from icewise.adapters import IcebergPredictionAdapter, load_nsidc_sea_ice_data
from icewise.grid_graph import (
    NavigationGridGraph,
    SUPPORTED_REGION_ID,
    in_supported_operating_region,
    supported_region_summary,
)
from icewise.interfaces import EnvironmentalData, IcebergPrediction, IcebergSizeCategory, VesselProfile, Waypoint
from icewise.pipeline import NavigationEngine
from icewise.risk_engine import ProbabilisticRiskEngine
from backend.routing import main as api
from backend.routing.main import RecalculateRequest, RouteRequest

CSV_PATH = api.CSV_PATH


def _req(start, dest, cls=RouteRequest, **extra):
    return cls(
        vessel_id="TEST-VESSEL",
        start_point={"lat": start[0], "lon": start[1]},
        destination={"lat": dest[0], "lon": dest[1]},
        **extra,
    )


def _detail(exc_info):
    return exc_info.value.detail


_DEMO_CACHE = {}


def _demo_response():
    """The Weddell demo route, computed once per test process."""
    if "r" not in _DEMO_CACHE:
        _DEMO_CACHE["r"] = api.generate_route(
            _req((-77.0, -42.0), (-74.5, -40.0), target_timestamp="2020-01-02T00:00:00Z")
        )
    return _DEMO_CACHE["r"]


# ---------------------------------------------------------------------------
# 1. Navigability: supported region, no land routing
# ---------------------------------------------------------------------------

LAND_OR_ICE_POINTS = [
    ("Antarctic Peninsula (-72,-68)", -72.0, -68.0),
    ("Peninsula interior (-70,-64)", -70.0, -64.0),
    ("Ronne Ice Shelf (-79,-60)", -79.0, -60.0),
    ("Berkner Island (-79,-45)", -79.0, -45.0),
    ("Filchner ice front / shelf (-78.5,-42)", -78.5, -42.0),
    ("Coats Land interior (-80,-30)", -80.0, -30.0),
    ("East Antarctic ice sheet (-70,100)", -70.0, 100.0),
    ("Ross Island (-77.6,167.4)", -77.6, 167.4),
]


class TestSupportedRegionNavigability:

    def test_demo_corridor_is_inside_supported_region(self):
        assert in_supported_operating_region(-77.0, -42.0)
        assert in_supported_operating_region(-74.5, -40.0)
        assert in_supported_operating_region(-76.1234, -41.4321)

    def test_known_land_and_ice_points_are_outside_the_region(self):
        for name, lat, lon in LAND_OR_ICE_POINTS:
            assert not in_supported_operating_region(lat, lon), f"{name} must not be navigable"

    def test_region_summary_is_explicit_about_what_is_supported(self):
        text = supported_region_summary()
        assert "Weddell" in text and SUPPORTED_REGION_ID

    def test_api_rejects_land_and_ice_points_as_not_navigable(self):
        for name, lat, lon in LAND_OR_ICE_POINTS:
            with pytest.raises(HTTPException) as ei:
                api.generate_route(_req((lat, lon), (-74.5, -40.0)) if lat > -78.0 else _req((lat, lon), (lat + 0.5, lon + 0.5)))
            d = _detail(ei)
            # A far-apart mission may be refused for size first; anything that reaches the
            # navigability check must use the structured not-navigable error.
            assert d["error"] in ("COORDINATE_NOT_NAVIGABLE", "CORRIDOR_TOO_LARGE"), f"{name}: {d}"
            assert ei.value.status_code == 422

    def test_peninsula_route_is_refused_with_structured_error(self):
        """(-72,-68) -> (-70,-66) used to return a 200 route across the Peninsula."""
        with pytest.raises(HTTPException) as ei:
            api.generate_route(_req((-72.0, -68.0), (-70.0, -66.0)))
        d = _detail(ei)
        assert d["error"] == "COORDINATE_NOT_NAVIGABLE"
        assert d["field"] == "start_point"
        assert "supported" in d["detail"].lower()
        assert d["supported_region"]["id"] == SUPPORTED_REGION_ID

    def test_east_antarctic_ice_sheet_route_is_refused(self):
        with pytest.raises(HTTPException) as ei:
            api.generate_route(_req((-70.0, 100.0), (-66.5, 105.0)))
        assert _detail(ei)["error"] == "COORDINATE_NOT_NAVIGABLE"

    def test_destination_on_land_names_the_destination_field(self):
        # (-78.5, -41.0) is on the Filchner ice front side of the region boundary; the
        # corridor is small, so the size guard passes and the navigability check decides.
        with pytest.raises(HTTPException) as ei:
            api.generate_route(_req((-77.0, -42.0), (-78.5, -41.0)))
        d = _detail(ei)
        assert d["error"] == "COORDINATE_NOT_NAVIGABLE" and d["field"] == "destination"

    def test_recalculate_applies_the_same_navigability_rules(self):
        with pytest.raises(HTTPException) as ei:
            api.recalculate_route(_req((-72.0, -68.0), (-70.0, -66.0), cls=RecalculateRequest))
        assert _detail(ei)["error"] == "COORDINATE_NOT_NAVIGABLE"

    def test_grid_outside_the_region_has_no_nodes_and_is_never_snapped_to_ocean(self):
        g = NavigationGridGraph(lat_min=-72.0, lat_max=-70.0, lon_min=-69.0, lon_max=-66.0, resolution_deg=0.1)
        assert len(g.nodes) == 0
        ok, reason = g.check_point_navigable(Waypoint(lat=-71.0, lon=-67.0))
        assert ok is False and "supported" in reason.lower()
        with pytest.raises(ValueError):
            g.find_nearest_node(Waypoint(lat=-71.0, lon=-67.0))

    def test_every_grid_node_is_inside_the_supported_region(self):
        """A grid that spans coast, ice shelves and open water only ever keeps supported cells."""
        g = NavigationGridGraph(lat_min=-80.0, lat_max=-60.0, lon_min=-60.0, lon_max=-28.0, resolution_deg=0.5)
        assert len(g.nodes) > 0
        for lat, lon in g.nodes:
            assert in_supported_operating_region(lat, lon), f"node ({lat}, {lon}) is outside the supported region"

    def test_routes_never_leave_the_supported_region(self):
        vessel = VesselProfile.from_dict({
            "vessel_id": "V", "start_point": {"lat": -76.0, "lon": -45.0},
            "destination": {"lat": -64.0, "lon": -34.0},
        })
        engine = NavigationEngine(vessel=vessel, iceberg_predictions=[], grid_resolution_deg=0.25)
        result = engine.compute_route()
        for wp in result.waypoints:
            assert in_supported_operating_region(wp.lat, wp.lon), f"waypoint ({wp.lat}, {wp.lon}) left the region"

    def test_demo_route_still_succeeds_and_stays_inside(self):
        r = _demo_response()
        assert len(r["waypoints"]) > 10
        assert all(in_supported_operating_region(w["lat"], w["lon"]) for w in r["waypoints"])
        assert [o["label"] for o in r["route_options"]] == ["Baseline / Shortest", "Balanced", "Safety Priority"]
        assert all("error" not in o for o in r["route_options"])

    def test_invalid_latitude_and_identical_points_still_rejected_first(self):
        with pytest.raises(HTTPException) as ei:
            api.generate_route(_req((-50.0, -42.0), (-74.5, -40.0)))
        assert _detail(ei)["error"] == "OUTSIDE_DOMAIN"
        with pytest.raises(HTTPException) as ei:
            api.generate_route(_req((-74.5, -40.0), (-74.5, -40.0)))
        assert _detail(ei)["error"] == "IDENTICAL_POINTS"


# ---------------------------------------------------------------------------
# 2. Corridor guard matches the real grid resolution
# ---------------------------------------------------------------------------

class TestCorridorGuard:

    def test_guard_uses_the_resolution_the_engine_actually_uses(self):
        assert api._GRID_RESOLUTION_DEG == 0.05
        # NavigationEngine's own default must agree with the guard's constant.
        default = inspect.signature(NavigationEngine.__init__).parameters["grid_resolution_deg"].default
        assert default == api._GRID_RESOLUTION_DEG

    def test_estimate_matches_the_lattice_the_engine_really_builds(self):
        vessel = VesselProfile.from_dict({
            "vessel_id": "V", "start_point": {"lat": -77.0, "lon": -42.0},
            "destination": {"lat": -74.5, "lon": -40.0},
        })
        engine = NavigationEngine(vessel=vessel, iceberg_predictions=[], grid_resolution_deg=api._GRID_RESOLUTION_DEG)
        g = engine.graph
        res = g.resolution_deg
        lattice = (round((g.lat_max - g.lat_min) / res) + 1) * (round((g.lon_max - g.lon_min) / res) + 1)
        est = api._estimate_grid_nodes(-77.0, -42.0, -74.5, -40.0)
        assert abs(est - lattice) / lattice < 0.02, f"estimate {est} vs real lattice {lattice}"
        assert len(g.nodes) <= est  # land masking only removes nodes

    def test_demo_corridor_is_accepted(self):
        api._validate_corridor_size(-77.0, -42.0, -74.5, -40.0)

    def test_near_limit_corridor_is_accepted_and_just_over_is_rejected(self):
        # 6 x 6 degrees -> 25,921 estimated nodes (< 30,000)
        assert api._estimate_grid_nodes(-70.0, -50.0, -64.0, -44.0) < api._MAX_GRID_NODES
        api._validate_corridor_size(-70.0, -50.0, -64.0, -44.0)
        # 7 x 7 degrees -> 32,761 (> 30,000)
        assert api._estimate_grid_nodes(-71.0, -50.0, -64.0, -43.0) > api._MAX_GRID_NODES
        with pytest.raises(HTTPException) as ei:
            api._validate_corridor_size(-71.0, -50.0, -64.0, -43.0)
        d = _detail(ei)
        assert d["error"] == "CORRIDOR_TOO_LARGE"
        assert d["estimated_grid_nodes"] > d["max_grid_nodes"]
        assert d["grid_resolution_deg"] == 0.05

    def test_far_apart_cross_region_mission_is_rejected_immediately(self):
        with pytest.raises(HTTPException) as ei:
            api._validate_corridor_size(-78.0, 168.0, -74.5, -40.0)
        assert _detail(ei)["error"] == "CORRIDOR_TOO_LARGE"

    def test_antimeridian_pair_is_rejected_as_too_wide(self):
        with pytest.raises(HTTPException) as ei:
            api._validate_corridor_size(-70.0, 179.0, -70.0, -179.0)
        assert _detail(ei)["error"] == "CORRIDOR_TOO_LARGE"

    def test_route_response_reports_the_real_grid_resolution(self):
        notes = " ".join(_demo_response()["notes"])
        assert "Grid resolution: 0.05°" in notes


# ---------------------------------------------------------------------------
# 3. Sea ice: truthful status, nothing fabricated
# ---------------------------------------------------------------------------

class TestSeaIceTruthfulness:

    def test_demo_corridor_has_no_real_sea_ice_and_says_so(self):
        r = _demo_response()
        assert r["sea_ice_layer_available"] is True          # the layer exists...
        assert r["sea_ice_integrated"] is False              # ...but did not influence this route
        assert r["sea_ice_grid_coverage_pct"] == 0.0
        assert r["sea_ice_route_coverage_pct"] == 0.0
        assert any("do not cover this corridor" in w for w in r["warnings"])

    def test_default_concentration_is_never_reported_as_observation(self):
        env = load_nsidc_sea_ice_data()
        eng = ProbabilisticRiskEngine([], env)
        assert eng.sea_ice_observation_at(-75.5, -41.0) is None            # demo corridor
        assert eng.get_sea_ice_concentration(-75.5, -41.0) == env.default_ice_concentration
        # with no icebergs the only risk is 0.5 * default: nothing fabricated on top of it
        assert abs(eng.calculate_total_risk(-75.5, -41.0) - 0.5 * env.default_ice_concentration) < 1e-9

    def test_real_cells_return_their_real_value(self):
        env = load_nsidc_sea_ice_data()
        eng = ProbabilisticRiskEngine([], env)
        for (lat, lon), conc in list(env.ice_concentration_map.items())[:25]:
            assert eng.sea_ice_observation_at(lat, lon) == conc

    def test_lookup_matches_the_original_brute_force_rule(self):
        env = load_nsidc_sea_ice_data()
        eng = ProbabilisticRiskEngine([], env)
        import random
        rnd = random.Random(11)

        def brute(lat, lon):
            m = env.ice_concentration_map
            if (round(lat, 2), round(lon, 2)) in m:
                return m[(round(lat, 2), round(lon, 2))]
            best, val = 0.04, None
            for (a, b), c in m.items():
                d = (lat - a) ** 2 + (lon - b) ** 2
                if d < best:
                    best, val = d, c
            return val if val is not None else env.default_ice_concentration

        for _ in range(3000):
            la, lo = rnd.uniform(-78, -60), rnd.uniform(-66, -29)
            assert eng.get_sea_ice_concentration(la, lo) == brute(la, lo)

    def test_northern_weddell_corridor_has_real_but_partial_coverage(self):
        r = api.generate_route(_req((-68.0, -40.0), (-65.0, -37.0), target_timestamp="2020-01-02T00:00:00Z"))
        assert r["sea_ice_integrated"] is True
        assert 0.0 < r["sea_ice_grid_coverage_pct"] < 100.0
        assert any("cover" in w and "%" in w for w in r["warnings"])

    def test_sea_ice_date_mismatch_is_reported(self):
        r = api.generate_route(_req((-68.0, -40.0), (-65.0, -37.0), target_timestamp="2020-07-20T00:00:00Z"))
        assert any("not from the same time" in w for w in r["warnings"])


# ---------------------------------------------------------------------------
# 4. Time-aware routing: the limitation is stated, not hidden
# ---------------------------------------------------------------------------

class TestTimeAwareRoutingLimitation:

    def test_response_states_that_pathfinding_is_static(self):
        notes = " ".join(_demo_response()["notes"])
        assert "static forecast-envelope risk" in notes
        assert "not time-dependent" in notes

    def test_reported_metrics_are_temporal_but_node_risk_is_static(self):
        import re
        from icewise import grid_graph
        src = inspect.getsource(grid_graph.NavigationGridGraph._build_grid)
        # node risk is computed without a time offset...
        assert re.search(r"calculate_total_risk\(lat, lon\)", src)
        assert "time_offset" not in src
        # ...while route metrics pass each waypoint's ETA.
        from icewise import metrics
        assert "time_offset_hours=wp.time_offset_hours" in inspect.getsource(metrics.calculate_route_metrics)


# ---------------------------------------------------------------------------
# 5. Prediction defaults
# ---------------------------------------------------------------------------

class TestPredictionDefaults:

    def test_adapter_defaults_are_the_documented_placeholders(self):
        preds = IcebergPredictionAdapter.from_tanusha_csv_file(CSV_PATH, target_timestamp="2020-01-02T00:00:00Z")
        assert len(preds) > 0
        assert {p.confidence_score for p in preds} == {0.90}
        assert {p.drift_velocity_knots for p in preds} == {0.0}
        assert {p.size_category for p in preds} == {IcebergSizeCategory.MEDIUM}

    def test_drift_and_size_do_not_affect_risk(self):
        def berg(drift, bearing, size):
            return IcebergPrediction(
                iceberg_id="B", current_position=Waypoint(lat=-75.0, lon=-41.0),
                predicted_positions=[Waypoint(lat=-75.1, lon=-41.1, time_offset_hours=24.0)],
                spatial_uncertainty_km=5.0, confidence_score=0.9,
                drift_velocity_knots=drift, drift_bearing_deg=bearing, size_category=size,
            )
        a = ProbabilisticRiskEngine([berg(0.0, 0.0, IcebergSizeCategory.MEDIUM)])
        b = ProbabilisticRiskEngine([berg(4.0, 210.0, IcebergSizeCategory.VERY_LARGE)])
        for pt in [(-75.0, -41.0), (-75.05, -41.05), (-74.5, -40.5)]:
            assert a.calculate_total_risk(*pt) == b.calculate_total_risk(*pt)
            assert a.calculate_total_risk(*pt, time_offset_hours=12.0) == b.calculate_total_risk(*pt, time_offset_hours=12.0)

    def test_confidence_is_a_real_risk_input(self):
        def eng(conf):
            return ProbabilisticRiskEngine([IcebergPrediction(
                iceberg_id="B", current_position=Waypoint(lat=-75.0, lon=-41.0), predicted_positions=[],
                spatial_uncertainty_km=5.0, confidence_score=conf)])
        assert eng(0.9).calculate_total_risk(-75.0, -41.0) > eng(0.5).calculate_total_risk(-75.0, -41.0)

    def test_response_says_confidence_is_an_adapter_default(self):
        notes = " ".join(_demo_response()["notes"])
        assert "adapter default" in notes and "not a model output" in notes


# ---------------------------------------------------------------------------
# 6. Recalculation semantics and warnings
# ---------------------------------------------------------------------------

class TestRecalculation:

    def _recalc(self, initial_ts):
        return api.recalculate_route(
            _req((-77.0, -42.0), (-74.5, -40.0), cls=RecalculateRequest, initial_target_timestamp=initial_ts)
        )

    def test_recalculation_states_that_latest_snapshots_are_not_one_time(self):
        r = self._recalc("2020-01-02T00:00:00Z")
        assert r["recalculated"] is True
        joined = " ".join(r["warnings"])
        assert "latest recorded observation" in joined and "not a single consistent point in time" in joined
        assert "not a forecast for the original departure time" in joined

    def test_recalculation_reports_sea_ice_status_like_the_route_endpoint(self):
        r = self._recalc("2020-01-02T00:00:00Z")
        assert r["sea_ice_layer_available"] is True
        assert r["sea_ice_integrated"] is False and r["sea_ice_grid_coverage_pct"] == 0.0
        assert any("not from the same time" in w for w in r["warnings"])   # sea ice is Jan 2, icebergs Mar-Sep

    def test_unknown_initial_timestamp_now_warns_instead_of_silently_using_nothing(self):
        r = self._recalc("1999-01-01T00:00:00Z")
        assert any("No iceberg predictions found for timestamp '1999-01-01T00:00:00Z'" in w for w in r["warnings"])

    def test_recalculation_does_not_return_route_options(self):
        assert "route_options" not in self._recalc("2020-01-02T00:00:00Z")


# ---------------------------------------------------------------------------
# 7. Route endpoint: timestamps, warnings, snapping
# ---------------------------------------------------------------------------

class TestRouteWarningsAndSnapping:

    def test_unknown_timestamp_warns_and_falls_back(self):
        r = api.generate_route(_req((-77.0, -42.0), (-74.5, -40.0), target_timestamp="1999-01-01T00:00:00Z"))
        assert any("Falling back to latest available observations" in w for w in r["warnings"])

    def test_fallback_warning_describes_the_data_actually_used(self):
        """After an unknown timestamp the iceberg data is the LATEST snapshots, not the requested date."""
        r = api.generate_route(_req((-77.0, -42.0), (-74.5, -40.0), target_timestamp="1999-01-01T00:00:00Z"))
        mismatch = [w for w in r["warnings"] if "not from the same time" in w]
        assert mismatch and "1999" not in mismatch[0]
        assert "2020-03-05 to 2020-09-06" in mismatch[0]

    def test_missing_timestamp_is_disclosed(self):
        r = api.generate_route(_req((-77.0, -42.0), (-74.5, -40.0)))
        assert any("No target_timestamp was supplied" in w for w in r["warnings"])

    def test_snapped_destination_is_reported_for_off_grid_points(self):
        r = api.generate_route(_req((-76.1234, -41.4321), (-74.9876, -39.5432), target_timestamp="2020-01-02T00:00:00Z"))
        assert "snapped_destination" in r and "snapped_start" not in r
        assert abs(r["snapped_destination"]["lat"] - (-74.9876)) < 0.06

    def test_response_still_has_every_field_the_frontend_reads(self):
        r = _demo_response()
        for key in ("route_id", "waypoints", "metrics", "algorithm_used", "recalculated", "notes", "comparison",
                    "icebergs", "route_options", "sea_ice_integrated", "iceberg_prediction_count"):
            assert key in r, key
        assert r["iceberg_prediction_count"] >= len(r["icebergs"])
