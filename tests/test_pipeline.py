"""
Integration tests for NavigationEngine orchestrator.
"""

from icewise.pipeline import NavigationEngine
from icewise.sample_data import (
    get_sample_vessel_profile, get_sample_iceberg_predictions,
    get_sample_environmental_data
)
from icewise.interfaces import IcebergPrediction, Waypoint, IcebergSizeCategory


def test_navigation_engine_end_to_end():
    vessel = get_sample_vessel_profile()
    preds = get_sample_iceberg_predictions()
    env = get_sample_environmental_data()

    engine = NavigationEngine(
        vessel=vessel,
        iceberg_predictions=preds,
        environmental_data=env,
        grid_resolution_deg=0.1
    )

    result = engine.compute_route(algorithm="A*")

    assert result.route_id.startswith("ROUTE-")
    assert result.vessel_id == vessel.vessel_id
    assert len(result.waypoints) > 1
    assert result.metrics.total_distance_nm > 0
    assert result.metrics.estimated_time_hours > 0
    assert result.metrics.estimated_fuel_tons > 0
    assert 0.0 <= result.metrics.mean_risk_score <= 1.0
    assert 0.0 <= result.metrics.safety_index <= 100.0


def test_route_recalculation_on_prediction_update():
    vessel = get_sample_vessel_profile()
    preds = get_sample_iceberg_predictions()

    engine = NavigationEngine(
        vessel=vessel,
        iceberg_predictions=preds,
        grid_resolution_deg=0.1
    )

    initial_result = engine.compute_route(algorithm="A*")
    assert not initial_result.recalculated

    # Simulate updated predictions from Tanusha's module (iceberg drifts into path)
    updated_preds = get_sample_iceberg_predictions()
    updated_preds[0] = IcebergPrediction(
        iceberg_id="ICE-2026-001-UPDATE",
        current_position=Waypoint(lat=-76.0, lon=165.5),
        predicted_positions=[Waypoint(lat=-76.0, lon=165.5)],
        spatial_uncertainty_km=8.0,  # Larger uncertainty buffer
        confidence_score=0.98,
        size_category=IcebergSizeCategory.VERY_LARGE
    )

    recalculated_result = engine.update_predictions_and_recalculate(
        new_iceberg_predictions=updated_preds,
        algorithm="A*"
    )

    assert recalculated_result.recalculated
    assert recalculated_result.route_id != initial_result.route_id
    assert len(recalculated_result.waypoints) > 1
