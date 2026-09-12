"""
Test Suite verifying alignment between Tanusha's ML Prediction JSON payload
and Niharika's Risk & Routing Engine.
"""

import sys
import os
import json
from datetime import datetime

# Ensure parent directory is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from icewise.adapters import IcebergPredictionAdapter
from icewise.pipeline import run_navigation_pipeline_from_dict
from icewise.interfaces import IcebergPrediction


def test_tanusha_parallel_arrays_schema_parsing():
    """
    Tests parsing Tanusha's ML output containing parallel coordinate arrays, ISO 8601 timestamps,
    and optional ML model metadata fields.
    """
    tanusha_json_payload = {
        "iceberg_id": "ICE-TANUSHA-PARALLEL-001",
        "current_timestamp": "2026-09-12T16:00:00Z",
        "current_latitude": -76.20,
        "current_longitude": 165.80,
        "predicted_future_timestamps": [
            "2026-09-12T16:00:00Z",
            "2026-09-12T22:00:00Z",
            "2026-09-13T04:00:00Z",
            "2026-09-13T16:00:00Z"
        ],
        "predicted_latitudes": [-76.20, -76.25, -76.30, -76.40],
        "predicted_longitudes": [165.80, 165.85, 165.90, 166.00],
        "uncertainty_error_radius_km": 4.5,
        "environmental_inputs_used": {
            "wind_speed_knots": 14.5,
            "ocean_current_u_mps": 0.25,
            "sea_surface_temp_celsius": -1.4
        },
        "model_baseline_info": {
            "model_name": "Physics+LSTM_Residual_Hybrid",
            "weights_version": "v2.1.0"
        },
        "evaluation_metrics": {
            "rmse_km": 1.35,
            "mae_km": 0.88
        }
    }

    prediction = IcebergPredictionAdapter.from_tanusha_json(tanusha_json_payload)

    assert isinstance(prediction, IcebergPrediction)
    assert prediction.iceberg_id == "ICE-TANUSHA-PARALLEL-001"
    assert prediction.current_position.lat == -76.20
    assert prediction.current_position.lon == 165.80
    assert len(prediction.predicted_positions) == 4
    assert prediction.spatial_uncertainty_km == 4.5
    # Timestamp difference: 2026-09-12T22:00:00Z - 2026-09-12T16:00:00Z = 6.0 hours
    assert prediction.predicted_positions[1].time_offset_hours == 6.0
    assert prediction.predicted_positions[2].time_offset_hours == 12.0
    assert prediction.predicted_positions[3].time_offset_hours == 24.0
    print("✓ Tanusha Parallel Arrays Schema test passed.")


def test_tanusha_trajectory_objects_schema_parsing():
    """
    Tests parsing Tanusha's ML output format using a list of trajectory position objects.
    """
    tanusha_json_payload = {
        "iceberg_id": "ICE-TANUSHA-OBJECTS-002",
        "current_timestamp": "2026-09-12T12:00:00Z",
        "current_position": {"latitude": -76.80, "longitude": 165.20},
        "predicted_trajectory": [
            {"timestamp": "2026-09-12T12:00:00Z", "latitude": -76.80, "longitude": 165.20},
            {"timestamp": "2026-09-12T18:00:00Z", "latitude": -76.85, "longitude": 165.30},
            {"timestamp": "2026-09-13T00:00:00Z", "latitude": -76.90, "longitude": 165.40}
        ],
        "error_radius_km": 3.8,
        "confidence_score": 0.85
    }

    prediction = IcebergPredictionAdapter.from_tanusha_json(tanusha_json_payload)

    assert prediction.iceberg_id == "ICE-TANUSHA-OBJECTS-002"
    assert prediction.current_position.lat == -76.80
    assert prediction.spatial_uncertainty_km == 3.8
    assert prediction.confidence_score == 0.85
    assert len(prediction.predicted_positions) == 3
    assert prediction.predicted_positions[1].time_offset_hours == 6.0
    print("✓ Tanusha Trajectory Objects Schema test passed.")


def test_tanusha_missing_optional_fields():
    """
    Verifies that missing optional fields (like environmental_inputs_used, model_baseline_info,
    evaluation_metrics, confidence_score) do not break routing parsing.
    """
    minimal_json_payload = {
        "iceberg_id": "ICE-MINIMAL-003",
        "current_latitude": -76.0,
        "current_longitude": 165.0,
        "predicted_latitudes": [-76.0, -76.1],
        "predicted_longitudes": [165.0, 165.1],
        "uncertainty_error_radius_km": 2.0
    }

    prediction = IcebergPredictionAdapter.from_tanusha_json(minimal_json_payload)

    assert prediction.iceberg_id == "ICE-MINIMAL-003"
    assert prediction.current_position.lat == -76.0
    assert prediction.spatial_uncertainty_km == 2.0
    assert prediction.confidence_score == 0.90  # Default fallback
    print("✓ Tanusha Missing Optional Fields test passed.")


def test_tanusha_json_to_risk_engine_to_route_json():
    """
    End-to-end test: Tanusha ML Prediction JSON List -> run_navigation_pipeline_from_dict -> Saiesha Route JSON.
    """
    tanusha_predictions = [
        {
            "iceberg_id": "ICE-TANUSHA-E2E-001",
            "current_timestamp": "2026-09-12T16:00:00Z",
            "current_latitude": -76.20,
            "current_longitude": 165.80,
            "predicted_future_timestamps": ["2026-09-12T16:00:00Z", "2026-09-12T22:00:00Z"],
            "predicted_latitudes": [-76.20, -76.25],
            "predicted_longitudes": [165.80, 165.85],
            "uncertainty_error_radius_km": 4.5,
            "model_baseline_info": {"model": "Physics_LSTM"},
            "evaluation_metrics": {"rmse_km": 1.2}
        }
    ]

    vessel_payload = {
        "vessel_id": "VESSEL-E2E-TEST",
        "start_point": {"lat": -75.0, "lon": 165.0},
        "destination": {"lat": -77.5, "lon": 166.5},
        "cruise_speed_knots": 12.0
    }

    route_output_dict = run_navigation_pipeline_from_dict(
        vessel_dict=vessel_payload,
        iceberg_predictions_dicts=tanusha_predictions,
        algorithm="A*",
        grid_resolution_deg=0.08
    )

    assert "route_id" in route_output_dict
    assert route_output_dict["vessel_id"] == "VESSEL-E2E-TEST"
    assert len(route_output_dict["waypoints"]) > 1
    assert "metrics" in route_output_dict
    assert route_output_dict["metrics"]["total_distance_nm"] > 0
    assert route_output_dict["metrics"]["estimated_fuel_cost_usd"] > 0

    # Ensure result serializes cleanly to JSON string
    json_str = json.dumps(route_output_dict)
    assert len(json_str) > 0
    print("✓ Tanusha JSON -> Risk Engine -> Route JSON end-to-end test passed.")


if __name__ == "__main__":
    print("=" * 70)
    print("  Running Tanusha Alignment Tests...")
    print("=" * 70)
    test_tanusha_parallel_arrays_schema_parsing()
    test_tanusha_trajectory_objects_schema_parsing()
    test_tanusha_missing_optional_fields()
    test_tanusha_json_to_risk_engine_to_route_json()
    print("=" * 70)
    print("  All Tanusha Alignment Tests Passed Successfully!")
    print("=" * 70)
