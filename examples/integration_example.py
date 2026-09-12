#!/usr/bin/env python3
"""
ICEWISE SIH 2026 (SIH26059) - Minimal Integration Example
Module: Niharika (Risk Assessment & Route Optimization)

Demonstrates how Tanusha's ML Prediction JSON output is fed directly into the Routing Engine,
and how the JSON output is formatted for Saiesha's Integration/UI module.
"""

import sys
import os
import json

# Ensure parent directory is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from icewise.pipeline import run_navigation_pipeline_from_dict, NavigationEngine
from icewise.interfaces import IcebergPrediction


def main():
    # -------------------------------------------------------------------------
    # 1. INPUT: Raw JSON Payload from Tanusha's ML Prediction Module
    # -------------------------------------------------------------------------
    raw_tanusha_predictions_json = """
    [
      {
        "iceberg_id": "ICE-TANUSHA-101",
        "current_position": { "lat": -76.25, "lon": 165.75, "time_offset_hours": 0.0 },
        "predicted_positions": [
          { "lat": -76.25, "lon": 165.75, "time_offset_hours": 0.0 },
          { "lat": -76.30, "lon": 165.80, "time_offset_hours": 6.0 },
          { "lat": -76.35, "lon": 165.85, "time_offset_hours": 12.0 },
          { "lat": -76.45, "lon": 165.95, "time_offset_hours": 24.0 }
        ],
        "spatial_uncertainty_km": 5.0,
        "confidence_score": 0.94,
        "drift_velocity_knots": 1.4,
        "drift_bearing_deg": 145.0,
        "size_category": "Large (45-75m height)"
      },
      {
        "iceberg_id": "ICE-TANUSHA-102",
        "current_position": { "lat": -76.70, "lon": 165.30, "time_offset_hours": 0.0 },
        "predicted_positions": [
          { "lat": -76.70, "lon": 165.30, "time_offset_hours": 0.0 },
          { "lat": -76.75, "lon": 165.40, "time_offset_hours": 6.0 }
        ],
        "spatial_uncertainty_km": 3.5,
        "confidence_score": 0.86,
        "drift_velocity_knots": 0.8,
        "drift_bearing_deg": 120.0,
        "size_category": "Medium (15-45m height)"
      }
    ]
    """

    # Vessel specification input
    raw_vessel_json = """
    {
      "vessel_id": "VESSEL-PALMER-01",
      "vessel_name": "R/V Nathaniel B. Palmer",
      "start_point": { "lat": -75.0, "lon": 165.0 },
      "destination": { "lat": -77.5, "lon": 166.5 },
      "cruise_speed_knots": 11.5,
      "fuel_consumption_rate_tons_per_day": 14.0,
      "risk_tolerance_factor": 3.0,
      "max_risk_threshold": 0.65,
      "ice_class": "POLAR_CLASS_5"
    }
    """

    print("=" * 80)
    print("  ICEWISE PIPELINE INTEGRATION DEMO")
    print("=" * 80)
    print("\n[1] Parsing Raw Prediction Input from Tanusha's ML Module...")
    predictions_list = json.loads(raw_tanusha_predictions_json)
    vessel_dict = json.loads(raw_vessel_json)

    print(f"    Loaded {len(predictions_list)} iceberg predictions for vessel '{vessel_dict['vessel_name']}'.")

    # -------------------------------------------------------------------------
    # 2. ROUTING PIPELINE EXECUTION
    # -------------------------------------------------------------------------
    print("\n[2] Executing Risk-Aware A* Route Optimization Pipeline...")
    output_result_dict = run_navigation_pipeline_from_dict(
        vessel_dict=vessel_dict,
        iceberg_predictions_dicts=predictions_list,
        algorithm="A*",
        grid_resolution_deg=0.08
    )

    # -------------------------------------------------------------------------
    # 3. OUTPUT: Clean JSON Payload for Saiesha's UI/Integration Module
    # -------------------------------------------------------------------------
    print("\n[3] Generating JSON Output Payload for Saiesha (UI/Integration):")
    final_json_string = json.dumps(output_result_dict, indent=2)
    print(final_json_string)

    print("\n✓ Integration pipeline executed successfully!")


if __name__ == "__main__":
    main()
