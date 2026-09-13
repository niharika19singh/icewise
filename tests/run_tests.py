#!/usr/bin/env python3
"""
Test runner for ICEWISE test suite.
Runs all test functions without requiring external test runner dependencies.
"""

import sys
import os

# Add parent directory to python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
from tests.test_interfaces import (
    test_waypoint_serialization,
    test_iceberg_prediction_serialization,
    test_vessel_profile,
)
from tests.test_risk_engine import (
    test_haversine_distance,
    test_iceberg_collision_risk_attenuation,
    test_combined_total_risk,
)
from tests.test_grid_graph import (
    test_grid_graph_construction,
    test_land_masking,
    test_nearest_node_lookup,
)
from tests.test_routing_engine import (
    test_astar_route_finding,
    test_dijkstra_route_finding,
    test_risk_avoidance_behavior,
)
from tests.test_pipeline import (
    test_navigation_engine_end_to_end,
    test_route_recalculation_on_prediction_update,
)
from tests.test_audit_scenarios import (
    test_scenario_1_normal_safe_environment,
    test_scenario_2_iceberg_blocking_shortest_route,
    test_scenario_3_high_risk_region_avoidance,
    test_scenario_4_no_feasible_route,
    test_scenario_5_changed_iceberg_prediction_recalculation,
)
from tests.test_focused_risk_review import (
    test_increasing_uncertainty_expands_risk_area,
    test_moving_iceberg_onto_route_increases_route_risk,
    test_lower_risk_alternative_selected_over_shorter_high_risk_route,
)
from tests.test_tanusha_alignment import (
    test_tanusha_parallel_arrays_schema_parsing,
    test_tanusha_trajectory_objects_schema_parsing,
    test_tanusha_missing_optional_fields,
    test_tanusha_json_to_risk_engine_to_route_json,
)
from tests.test_real_csv import TestRealCSVIntegration
from tests.test_hybrid_model_integration import TestHybridModelIntegration
from tests.test_edge_cases import (
    test_edge_case_invalid_coordinates,
    test_edge_case_empty_predictions,
    test_edge_case_blocked_destination,
    test_edge_case_no_feasible_route_wall,
)
from tests.test_sea_ice_api import test_sea_ice_api_and_loader
from tests.test_fuel_comparison import test_fuel_comparison_suite


def test_real_csv_dataset_parsing():
    suite = unittest.TestLoader().loadTestsFromTestCase(TestRealCSVIntegration)
    result = unittest.TextTestRunner(stream=sys.stdout, verbosity=0).run(suite)
    assert result.wasSuccessful(), "Real CSV Integration test failed"


def test_hybrid_model_integration():
    suite = unittest.TestLoader().loadTestsFromTestCase(TestHybridModelIntegration)
    result = unittest.TextTestRunner(stream=sys.stdout, verbosity=0).run(suite)
    assert result.wasSuccessful(), "Hybrid Model Integration test failed"




def run_all_tests():
    test_cases = [
        ("test_waypoint_serialization", test_waypoint_serialization),
        ("test_iceberg_prediction_serialization", test_iceberg_prediction_serialization),
        ("test_vessel_profile", test_vessel_profile),
        ("test_haversine_distance", test_haversine_distance),
        ("test_iceberg_collision_risk_attenuation", test_iceberg_collision_risk_attenuation),
        ("test_combined_total_risk", test_combined_total_risk),
        ("test_grid_graph_construction", test_grid_graph_construction),
        ("test_land_masking", test_land_masking),
        ("test_nearest_node_lookup", test_nearest_node_lookup),
        ("test_astar_route_finding", test_astar_route_finding),
        ("test_dijkstra_route_finding", test_dijkstra_route_finding),
        ("test_risk_avoidance_behavior", test_risk_avoidance_behavior),
        ("test_navigation_engine_end_to_end", test_navigation_engine_end_to_end),
        ("test_route_recalculation_on_prediction_update", test_route_recalculation_on_prediction_update),
        ("test_scenario_1_normal_safe_environment", test_scenario_1_normal_safe_environment),
        ("test_scenario_2_iceberg_blocking_shortest_route", test_scenario_2_iceberg_blocking_shortest_route),
        ("test_scenario_3_high_risk_region_avoidance", test_scenario_3_high_risk_region_avoidance),
        ("test_scenario_4_no_feasible_route", test_scenario_4_no_feasible_route),
        ("test_scenario_5_changed_iceberg_prediction_recalculation", test_scenario_5_changed_iceberg_prediction_recalculation),
        ("test_increasing_uncertainty_expands_risk_area", test_increasing_uncertainty_expands_risk_area),
        ("test_moving_iceberg_onto_route_increases_route_risk", test_moving_iceberg_onto_route_increases_route_risk),
        ("test_lower_risk_alternative_selected_over_shorter_high_risk_route", test_lower_risk_alternative_selected_over_shorter_high_risk_route),
        ("test_tanusha_parallel_arrays_schema_parsing", test_tanusha_parallel_arrays_schema_parsing),
        ("test_tanusha_trajectory_objects_schema_parsing", test_tanusha_trajectory_objects_schema_parsing),
        ("test_tanusha_missing_optional_fields", test_tanusha_missing_optional_fields),
        ("test_tanusha_json_to_risk_engine_to_route_json", test_tanusha_json_to_risk_engine_to_route_json),
        ("test_edge_case_invalid_coordinates", test_edge_case_invalid_coordinates),
        ("test_edge_case_empty_predictions", test_edge_case_empty_predictions),
        ("test_edge_case_blocked_destination", test_edge_case_blocked_destination),
        ("test_edge_case_no_feasible_route_wall", test_edge_case_no_feasible_route_wall),
        ("test_real_csv_dataset_parsing", test_real_csv_dataset_parsing),
        ("test_hybrid_model_integration", test_hybrid_model_integration),
        ("test_sea_ice_api_and_loader", test_sea_ice_api_and_loader),
        ("test_fuel_comparison_suite", test_fuel_comparison_suite),
    ]

    print("=" * 60)
    print("  Running ICEWISE Test Suite...")
    print("=" * 60)

    passed = 0
    failed = 0

    for name, func in test_cases:
        try:
            func()
            print(f"  [PASS] {name}")
            passed += 1
        except Exception as e:
            print(f"  [FAIL] {name}: {e}")
            failed += 1

    print("=" * 60)
    print(f"  Test Results: {passed} passed, {failed} failed.")
    print("=" * 60)

    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    run_all_tests()
