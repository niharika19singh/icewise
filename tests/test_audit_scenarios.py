"""
Audit Scenario Test Suite for ICEWISE Risk & Routing Engine.
Verifies all 5 required scenario cases:
1. Normal/safe environment
2. Iceberg directly blocking shortest route
3. High-risk region avoidance
4. No feasible route handling
5. Dynamic route recalculation on changed iceberg predictions
"""

import sys
import os
import math

# Ensure parent path is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from icewise.interfaces import (
    Waypoint, IcebergPrediction, IcebergSizeCategory,
    VesselProfile, EnvironmentalData
)
from icewise.risk_engine import ProbabilisticRiskEngine, haversine_distance_nm
from icewise.grid_graph import NavigationGridGraph
from icewise.routing_engine import RouteOptimizer
from icewise.pipeline import NavigationEngine


def create_base_vessel():
    """Creates a standard test vessel profile moving from (-75.0, 165.0) to (-77.0, 165.0)."""
    return VesselProfile(
        vessel_id="AUDIT-VESSEL-001",
        vessel_name="R/V Audit Test",
        start_point=Waypoint(lat=-75.0, lon=165.0),
        destination=Waypoint(lat=-77.0, lon=165.0),
        cruise_speed_knots=12.0,
        fuel_consumption_rate_tons_per_day=15.0,
        risk_tolerance_factor=4.0,  # High risk sensitivity to force detour
        max_risk_threshold=0.60,
    )


def test_scenario_1_normal_safe_environment():
    """Scenario 1: Clear water, no icebergs. Should produce direct shortest route."""
    vessel = create_base_vessel()
    engine = NavigationEngine(
        vessel=vessel,
        iceberg_predictions=[],
        environmental_data=EnvironmentalData(default_ice_concentration=0.0),
        grid_resolution_deg=0.05
    )

    result = engine.compute_route(algorithm="A*")
    assert len(result.waypoints) > 1
    assert result.metrics.total_distance_nm > 0
    assert result.metrics.mean_risk_score == 0.0

    # In zero-risk open water, latitude should decrease monotonically from -75.0 to -77.0 along longitude 165.0
    lons = [wp.lon for wp in result.waypoints]
    max_lon_deviation = max(abs(lon - 165.0) for lon in lons)
    assert max_lon_deviation < 0.06  # Straight line along meridian
    print("✓ Scenario 1 (Normal/Safe Environment): Passed direct path test.")


def test_scenario_2_iceberg_blocking_shortest_route():
    """Scenario 2: Iceberg directly blocking the straight path at (-76.0, 165.0). Should steer around it."""
    vessel = create_base_vessel()

    # Iceberg placed right in middle of straight line (-76.0, 165.0)
    blocking_berg = IcebergPrediction(
        iceberg_id="BLOCKING-BERG-001",
        current_position=Waypoint(lat=-76.0, lon=165.0),
        predicted_positions=[Waypoint(lat=-76.0, lon=165.0)],
        spatial_uncertainty_km=6.0,
        confidence_score=0.95,
        size_category=IcebergSizeCategory.LARGE
    )

    # 1. Clear route baseline
    engine_clear = NavigationEngine(
        vessel=vessel,
        iceberg_predictions=[],
        grid_resolution_deg=0.05
    )
    result_clear = engine_clear.compute_route(algorithm="A*")

    # 2. Blocked route
    engine_blocked = NavigationEngine(
        vessel=vessel,
        iceberg_predictions=[blocking_berg],
        grid_resolution_deg=0.05
    )
    result_blocked = engine_blocked.compute_route(algorithm="A*")

    # Verify detour: path should steer away from longitude 165.0 near latitude -76.0
    blocked_waypoints = result_blocked.waypoints
    mid_waypoints = [wp for wp in blocked_waypoints if -76.3 <= wp.lat <= -75.7]
    assert len(mid_waypoints) > 0

    # Minimum deviation from lon 165.0 in the mid section should be significant
    mid_lon_deviations = [abs(wp.lon - 165.0) for wp in mid_waypoints]
    max_deviation = max(mid_lon_deviations)
    assert max_deviation > 0.10  # Steered at least ~10-15 km east or west to avoid iceberg!

    # Peak risk encountered on blocked path should remain below max_risk_threshold (0.60)
    assert result_blocked.metrics.max_risk_score < vessel.max_risk_threshold
    print(f"✓ Scenario 2 (Iceberg Blocking Route): Steered around iceberg with {max_deviation:.2f}° lon detour.")


def test_scenario_3_high_risk_region_avoidance():
    """Scenario 3: A cluster of icebergs/high sea-ice in one sector. Route steers clear of high-risk region."""
    vessel = create_base_vessel()

    # High ice concentration region on eastern side (lon >= 165.0)
    ice_map = {}
    for lat_idx in range(-770, -745, 5):
        lat = lat_idx / 10.0
        for lon_idx in range(1645, 1665, 5):
            lon = lon_idx / 10.0
            if lon >= 165.0:
                ice_map[(round(lat, 2), round(lon, 2))] = 0.80  # Heavy ice zone
            else:
                ice_map[(round(lat, 2), round(lon, 2))] = 0.05  # Clear water west

    env = EnvironmentalData(ice_concentration_map=ice_map, default_ice_concentration=0.05)

    engine = NavigationEngine(
        vessel=vessel,
        iceberg_predictions=[],
        environmental_data=env,
        grid_resolution_deg=0.05
    )

    result = engine.compute_route(algorithm="A*")

    # Path should favor western route (lon < 165.0) to avoid 0.80 heavy ice zone
    west_waypoints = [wp for wp in result.waypoints if wp.lon < 165.0]
    assert len(west_waypoints) > len(result.waypoints) * 0.5  # Majority of route is in clear western water
    print("✓ Scenario 3 (High-Risk Region Avoidance): Successfully favored clear water western corridor.")


def test_scenario_4_no_feasible_route():
    """Scenario 4: Complete wall of extreme risk exceeding max_risk_threshold. Should raise ValueError."""
    vessel = create_base_vessel()
    vessel.max_risk_threshold = 0.50

    # Build a tight ring of high-risk icebergs completely surrounding destination (-77.0, 165.0)
    wall_icebergs = []
    dest_lat, dest_lon = -77.0, 165.0
    for d_lat in [-0.1, -0.05, 0.0, 0.05, 0.1]:
        for d_lon in [-0.1, -0.05, 0.0, 0.05, 0.1]:
            if d_lat == 0.0 and d_lon == 0.0:
                continue
            wall_icebergs.append(
                IcebergPrediction(
                    iceberg_id=f"RING-BERG-{d_lat}-{d_lon}",
                    current_position=Waypoint(lat=dest_lat + d_lat, lon=dest_lon + d_lon),
                    predicted_positions=[Waypoint(lat=dest_lat + d_lat, lon=dest_lon + d_lon)],
                    spatial_uncertainty_km=10.0,
                    confidence_score=1.0,
                    size_category=IcebergSizeCategory.VERY_LARGE
                )
            )

    engine = NavigationEngine(
        vessel=vessel,
        iceberg_predictions=wall_icebergs,
        grid_resolution_deg=0.05
    )

    no_route_caught = False
    try:
        engine.compute_route(algorithm="A*")
    except ValueError as e:
        no_route_caught = True
        assert "No safe route found" in str(e)

    assert no_route_caught
    print("✓ Scenario 4 (No Feasible Route): Cleanly caught impassable blockade and raised ValueError.")


def test_scenario_5_changed_iceberg_prediction_recalculation():
    """Scenario 5: Dynamic recalculation when iceberg moves into vessel path."""
    vessel = create_base_vessel()

    # Initial iceberg far to east
    berg_initial = IcebergPrediction(
        iceberg_id="DRIFT-BERG",
        current_position=Waypoint(lat=-76.0, lon=167.0),
        predicted_positions=[Waypoint(lat=-76.0, lon=167.0)],
        spatial_uncertainty_km=3.0,
        confidence_score=0.90
    )

    engine = NavigationEngine(
        vessel=vessel,
        iceberg_predictions=[berg_initial],
        grid_resolution_deg=0.05
    )

    result_1 = engine.compute_route(algorithm="A*")

    # Iceberg drifts directly to (-76.0, 165.0)
    berg_updated = IcebergPrediction(
        iceberg_id="DRIFT-BERG",
        current_position=Waypoint(lat=-76.0, lon=165.0),
        predicted_positions=[Waypoint(lat=-76.0, lon=165.0)],
        spatial_uncertainty_km=5.0,
        confidence_score=0.95
    )

    result_2 = engine.update_predictions_and_recalculate([berg_updated], algorithm="A*")

    assert result_2.recalculated
    assert result_2.route_id != result_1.route_id
    assert result_2.metrics.total_distance_nm >= result_1.metrics.total_distance_nm
    print("✓ Scenario 5 (Changed Iceberg Prediction): Dynamic recalculation successfully updated route.")


if __name__ == "__main__":
    print("=" * 70)
    print("  Running Audit Scenario Tests...")
    print("=" * 70)
    test_scenario_1_normal_safe_environment()
    test_scenario_2_iceberg_blocking_shortest_route()
    test_scenario_3_high_risk_region_avoidance()
    test_scenario_4_no_feasible_route()
    test_scenario_5_changed_iceberg_prediction_recalculation()
    print("=" * 70)
    print("  All 5 Audit Scenarios Passed Successfully!")
    print("=" * 70)
