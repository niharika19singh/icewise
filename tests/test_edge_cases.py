"""
Edge case verification test suite for ICEWISE Risk & Routing Engine.
Tests:
1. Invalid / extreme coordinates (lat > 90, lon > 360, non-numeric values)
2. Empty iceberg predictions list [] (clear ocean navigation)
3. Blocked destination coordinates
4. Impassable blockade (no feasible route)
"""

import sys
import os
import math

# Ensure parent directory is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from icewise.adapters import IcebergPredictionAdapter, normalize_latitude, normalize_longitude
from icewise.pipeline import NavigationEngine, run_navigation_pipeline_from_dict
from icewise.sample_data import get_sample_vessel_profile, get_sample_environmental_data
from icewise.interfaces import Waypoint


def test_edge_case_invalid_coordinates():
    """Verifies robust normalization of invalid or extreme latitude/longitude values."""
    assert normalize_latitude(95.0) == 90.0
    assert normalize_latitude(-105.0) == -90.0
    assert normalize_longitude(190.0) == -170.0
    assert normalize_longitude(-200.0) == 160.0

    # Test payload with extreme coordinates
    payload = {
        "iceberg_id": "ICE-EXTREME-001",
        "current_latitude": -95.0,  # Clamped to -90.0
        "current_longitude": 370.0,  # Normalized to 10.0
        "predicted_latitudes": [-95.0, -76.0],
        "predicted_longitudes": [370.0, 165.0],
        "uncertainty_error_radius_km": 3.0
    }
    prediction = IcebergPredictionAdapter.from_tanusha_json(payload)
    assert prediction.current_position.lat == -90.0
    assert prediction.current_position.lon == 10.0
    print("✓ Edge Case 1 (Invalid Coordinates): Passed normalization test.")


def test_edge_case_empty_predictions():
    """Verifies navigation routing when iceberg predictions list is completely empty []."""
    vessel = get_sample_vessel_profile()
    engine = NavigationEngine(vessel=vessel, iceberg_predictions=[], grid_resolution_deg=0.08)
    result = engine.compute_route(algorithm="A*")

    assert len(result.waypoints) > 1
    assert result.metrics.total_distance_nm > 0
    assert result.metrics.mean_risk_score >= 0.0
    assert result.metrics.safety_index > 90.0
    print("✓ Edge Case 2 (Empty Predictions): Passed open-water route calculation test.")


def test_edge_case_blocked_destination():
    """Verifies that an impassable destination or start coordinate cleanly raises ValueError."""
    vessel = get_sample_vessel_profile()
    vessel.max_risk_threshold = 0.50

    # Place high-risk icebergs directly surrounding destination (-77.5, 166.5)
    blocking_icebergs = []
    for d_lat in [-0.08, 0.0, 0.08]:
        for d_lon in [-0.08, 0.0, 0.08]:
            blocking_icebergs.append({
                "iceberg_id": f"BLOCK-DEST-{d_lat}-{d_lon}",
                "current_latitude": vessel.destination.lat + d_lat,
                "current_longitude": vessel.destination.lon + d_lon,
                "uncertainty_error_radius_km": 10.0,
                "confidence_score": 1.0
            })

    vessel_dict = vessel.to_dict()

    no_route_caught = False
    try:
        run_navigation_pipeline_from_dict(
            vessel_dict=vessel_dict,
            iceberg_predictions_dicts=blocking_icebergs,
            algorithm="A*",
            grid_resolution_deg=0.08
        )
    except ValueError as e:
        no_route_caught = True
        assert "No safe route found" in str(e)

    assert no_route_caught
    print("✓ Edge Case 3 (Blocked Destination): Cleanly caught impassable destination and raised ValueError.")


def test_edge_case_no_feasible_route_wall():
    """Verifies that a complete horizontal wall of impassable risk across the grid raises ValueError."""
    vessel = get_sample_vessel_profile()
    vessel.max_risk_threshold = 0.50

    wall_icebergs = []
    # Span across all longitudes in grid workspace (160.0 to 171.0)
    for idx in range(1600, 1715, 2):
        wall_icebergs.append({
            "iceberg_id": f"WALL-{idx}",
            "current_latitude": -76.2,
            "current_longitude": idx / 10.0,
            "uncertainty_error_radius_km": 10.0,
            "confidence_score": 1.0
        })

    vessel_dict = vessel.to_dict()

    no_route_caught = False
    try:
        run_navigation_pipeline_from_dict(
            vessel_dict=vessel_dict,
            iceberg_predictions_dicts=wall_icebergs,
            algorithm="A*",
            grid_resolution_deg=0.08
        )
    except ValueError as e:
        no_route_caught = True
        assert "No safe route found" in str(e)

    assert no_route_caught
    print("✓ Edge Case 4 (No Feasible Route Wall): Cleanly caught impassable wall and raised ValueError.")


if __name__ == "__main__":
    print("=" * 70)
    print("  Running Edge Case Verification Tests...")
    print("=" * 70)
    test_edge_case_invalid_coordinates()
    test_edge_case_empty_predictions()
    test_edge_case_blocked_destination()
    test_edge_case_no_feasible_route_wall()
    print("=" * 70)
    print("  All Edge Case Verification Tests Passed Successfully!")
    print("=" * 70)
