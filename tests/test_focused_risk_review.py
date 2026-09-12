"""
Focused Technical Review Test Suite for ICEWISE Risk & Routing Engine.
Verifies requirement 6:
1. Increasing iceberg uncertainty increases affected risk area.
2. Moving an iceberg prediction onto the route increases route risk.
3. A lower-risk alternative route is selected over a shorter high-risk route.
"""

import sys
import os
import math

# Add parent path to python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from icewise.interfaces import Waypoint, IcebergPrediction, VesselProfile, EnvironmentalData
from icewise.risk_engine import ProbabilisticRiskEngine, haversine_distance_km
from icewise.grid_graph import NavigationGridGraph
from icewise.routing_engine import RouteOptimizer
from icewise.pipeline import NavigationEngine


def test_increasing_uncertainty_expands_risk_area():
    """
    Verifies that increasing spatial uncertainty σ expands the affected high-risk zone
    around an iceberg.
    """
    berg_lat, berg_lon = -76.0, 165.0
    eval_lat, eval_lon = -76.0, 165.10  # ~4.2 km east of iceberg

    # 1. Low uncertainty (σ = 1.5 km)
    berg_low_unc = IcebergPrediction(
        iceberg_id="BERG-LOW-UNC",
        current_position=Waypoint(lat=berg_lat, lon=berg_lon),
        predicted_positions=[Waypoint(lat=berg_lat, lon=berg_lon)],
        spatial_uncertainty_km=1.5,
        confidence_score=0.90
    )
    engine_low = ProbabilisticRiskEngine(iceberg_predictions=[berg_low_unc])
    risk_low_unc = engine_low.calculate_iceberg_collision_risk(eval_lat, eval_lon)

    # 2. High uncertainty (σ = 6.0 km)
    berg_high_unc = IcebergPrediction(
        iceberg_id="BERG-HIGH-UNC",
        current_position=Waypoint(lat=berg_lat, lon=berg_lon),
        predicted_positions=[Waypoint(lat=berg_lat, lon=berg_lon)],
        spatial_uncertainty_km=6.0,
        confidence_score=0.90
    )
    engine_high = ProbabilisticRiskEngine(iceberg_predictions=[berg_high_unc])
    risk_high_unc = engine_high.calculate_iceberg_collision_risk(eval_lat, eval_lon)

    print(f"  Uncertainty Test: Risk at 4.2 km (σ=1.5 km) = {risk_low_unc:.4f} vs (σ=6.0 km) = {risk_high_unc:.4f}")
    assert risk_high_unc > risk_low_unc
    assert risk_low_unc < 0.20  # Decay is sharp for small σ
    assert risk_high_unc > 0.50  # Risk remains high for large σ at same distance
    print("✓ Test 1: Increasing uncertainty expanded affected risk area as expected.")


def test_moving_iceberg_onto_route_increases_route_risk():
    """
    Verifies that moving an iceberg prediction onto the vessel's path increases overall route risk metrics.
    """
    vessel = VesselProfile(
        vessel_id="TEST-VESSEL-RISK",
        vessel_name="R/V Risk Test",
        start_point=Waypoint(lat=-75.0, lon=165.0),
        destination=Waypoint(lat=-77.0, lon=165.0),
        cruise_speed_knots=12.0,
        risk_tolerance_factor=0.5,  # Low risk penalty to allow route to pass near iceberg
        max_risk_threshold=0.90,
    )

    # 1. Iceberg far away at lon 168.0
    berg_far = IcebergPrediction(
        iceberg_id="BERG-FAR",
        current_position=Waypoint(lat=-76.0, lon=168.0),
        predicted_positions=[Waypoint(lat=-76.0, lon=168.0)],
        spatial_uncertainty_km=3.0,
        confidence_score=0.90
    )
    engine_far = NavigationEngine(vessel=vessel, iceberg_predictions=[berg_far], grid_resolution_deg=0.05)
    result_far = engine_far.compute_route(algorithm="A*")

    # 2. Iceberg moved directly onto route at lat -76.0, lon 165.0
    berg_on_path = IcebergPrediction(
        iceberg_id="BERG-ON-PATH",
        current_position=Waypoint(lat=-76.0, lon=165.0),
        predicted_positions=[Waypoint(lat=-76.0, lon=165.0)],
        spatial_uncertainty_km=3.0,
        confidence_score=0.90
    )
    engine_near = NavigationEngine(vessel=vessel, iceberg_predictions=[berg_on_path], grid_resolution_deg=0.05)
    result_near = engine_near.compute_route(algorithm="A*")

    print(f"  Route Risk Test: Far Peak Risk = {result_far.metrics.max_risk_score:.4f} vs Near Peak Risk = {result_near.metrics.max_risk_score:.4f}")
    assert result_near.metrics.max_risk_score > result_far.metrics.max_risk_score
    assert result_near.metrics.mean_risk_score > result_far.metrics.mean_risk_score
    print("✓ Test 2: Moving iceberg prediction onto route increased route risk metrics.")


def test_lower_risk_alternative_selected_over_shorter_high_risk_route():
    """
    Verifies that the route engine selects a longer, lower-risk corridor over a shorter, high-risk route
    when risk tolerance is active.
    """
    vessel = VesselProfile(
        vessel_id="TEST-VESSEL-CHOICE",
        vessel_name="R/V Choice Test",
        start_point=Waypoint(lat=-75.0, lon=165.0),
        destination=Waypoint(lat=-77.0, lon=165.0),
        cruise_speed_knots=12.0,
        risk_tolerance_factor=5.0,  # High risk penalty
        max_risk_threshold=0.85,
    )

    # Moderate/high risk zone along direct meridian path (lon 165.0)
    iceberg_direct = IcebergPrediction(
        iceberg_id="BERG-DIRECT",
        current_position=Waypoint(lat=-76.0, lon=165.0),
        predicted_positions=[Waypoint(lat=-76.0, lon=165.0)],
        spatial_uncertainty_km=5.0,
        confidence_score=0.80
    )

    engine = NavigationEngine(vessel=vessel, iceberg_predictions=[iceberg_direct], grid_resolution_deg=0.05)
    result = engine.compute_route(algorithm="A*")

    # Pure straight-line distance is 120 NM
    straight_dist_nm = haversine_distance_km(-75.0, 165.0, -77.0, 165.0) / 1.852

    # Selected route distance should be slightly longer than straight-line distance due to detour
    print(f"  Alternative Selection Test: Straight Dist = {straight_dist_nm:.2f} NM vs Risk-Optimal Route Dist = {result.metrics.total_distance_nm:.2f} NM")
    assert result.metrics.total_distance_nm > straight_dist_nm
    assert result.metrics.max_risk_score < 0.85
    print("✓ Test 3: Longer lower-risk alternative path successfully selected over high-risk direct path.")


if __name__ == "__main__":
    print("=" * 70)
    print("  Running Focused Technical Review Tests...")
    print("=" * 70)
    test_increasing_uncertainty_expands_risk_area()
    test_moving_iceberg_onto_route_increases_route_risk()
    test_lower_risk_alternative_selected_over_shorter_high_risk_route()
    print("=" * 70)
    print("  All Focused Technical Review Tests Passed!")
    print("=" * 70)
