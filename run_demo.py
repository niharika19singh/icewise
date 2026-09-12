#!/usr/bin/env python3
"""
ICEWISE SIH 2026 (SIH26059) - Navigation Decision Support & Risk Engine Demo
Module Lead: Niharika (Risk + Dijkstra/Route Optimization Lead)

Demonstrates the core pipeline:
Prediction (Tanusha DTOs) -> Spatial Uncertainty & Probabilistic Risk -> A*/Dijkstra Route Optimization -> Voyage Metrics -> Dynamic Recalculation
"""

import json
import time
from icewise.sample_data import (
    get_sample_vessel_profile,
    get_sample_iceberg_predictions,
    get_sample_environmental_data,
)
from icewise.pipeline import NavigationEngine
from icewise.interfaces import IcebergPrediction, Waypoint, IcebergSizeCategory


def main():
    print("=" * 80)
    print("  ICEWISE SIH 2026 - Risk & Route Optimization Engine Prototype")
    print("  Module Lead: Niharika (Risk + Route Optimization Lead)")
    print("=" * 80)
    print()

    # 1. Load Inputs
    vessel = get_sample_vessel_profile()
    iceberg_preds = get_sample_iceberg_predictions()
    env_data = get_sample_environmental_data()

    print(f"[1] Vessel Profile Loaded:")
    print(f"    Name: {vessel.vessel_name} (ID: {vessel.vessel_id})")
    print(f"    Ice Class: {vessel.ice_class}")
    print(f"    Cruising Speed: {vessel.cruise_speed_knots} knots")
    print(f"    Fuel Rate: {vessel.fuel_consumption_rate_tons_per_day} tons/day")
    print(f"    Start Point: ({vessel.start_point.lat:.2f}°S, {vessel.start_point.lon:.2f}°E)")
    print(f"    Destination: ({vessel.destination.lat:.2f}°S, {vessel.destination.lon:.2f}°E)")
    print()

    print(f"[2] Consuming Tanusha's ML Iceberg Predictions:")
    for berg in iceberg_preds:
        print(f"    • {berg.iceberg_id} ({berg.size_category.value if hasattr(berg.size_category, 'value') else berg.size_category}):")
        print(f"      Position: ({berg.current_position.lat:.2f}°S, {berg.current_position.lon:.2f}°E)")
        print(f"      Spatial Uncertainty (σ): {berg.spatial_uncertainty_km} km")
        print(f"      Model Confidence: {berg.confidence_score * 100:.0f}%")
        print(f"      Forecast Horizon: {len(berg.predicted_positions)} trajectory points")
    print()

    # 3. Initialize Navigation Engine
    print("[3] Initializing Navigation Engine & Building Geospatial Risk Field...")
    start_time = time.time()
    engine = NavigationEngine(
        vessel=vessel,
        iceberg_predictions=iceberg_preds,
        environmental_data=env_data,
        grid_resolution_deg=0.08  # ~8.8 km resolution grid for prototype
    )

    # 4. Compute Initial Route using A*
    print("[4] Computing Optimal Risk-Aware Route (A* Algorithm)...")
    route_result = engine.compute_route(algorithm="A*")
    compute_duration_ms = (time.time() - start_time) * 1000.0

    print()
    print("=" * 80)
    print(f"  INITIAL NAVIGATION ROUTE RESULT ({route_result.route_id})")
    print("=" * 80)
    m = route_result.metrics
    print(f"  • Algorithm:              {route_result.algorithm_used}")
    print(f"  • Execution Time:         {compute_duration_ms:.1f} ms")
    print(f"  • Total Distance:         {m.total_distance_nm:.2f} NM ({m.total_distance_km:.2f} km)")
    print(f"  • Estimated Transit Time: {m.estimated_time_hours:.2f} hours ({m.estimated_time_hours / 24.0:.2f} days)")
    print(f"  • Estimated Fuel Burn:   {m.estimated_fuel_tons:.2f} Metric Tons")
    print(f"  • Mean Risk Score:        {m.mean_risk_score:.4f}")
    print(f"  • Peak Risk Score:        {m.max_risk_score:.4f}")
    print(f"  • Safety Index:           {m.safety_index:.1f} / 100.0")
    print(f"  • Waypoint Count:         {m.waypoint_count}")
    print("  • Route Notes:")
    for note in route_result.notes:
        print(f"    - {note}")
    print()

    print("  Waypoints Preview (First 4 & Last 2):")
    for i, wp in enumerate(route_result.waypoints[:4]):
        print(f"    [{i+1}] ({wp.lat:.4f}°S, {wp.lon:.4f}°E) @ +{wp.time_offset_hours:.2f}h")
    print("    ...")
    for i, wp in enumerate(route_result.waypoints[-2:]):
        idx = len(route_result.waypoints) - 2 + i + 1
        print(f"    [{idx}] ({wp.lat:.4f}°S, {wp.lon:.4f}°E) @ +{wp.time_offset_hours:.2f}h")
    print()

    # 5. Simulate Dynamic Recalculation on Updated Predictions
    print("-" * 80)
    print("[5] SIMULATING DYNAMIC RECALCULATION:")
    print("    Updated iceberg prediction update received from Tanusha's ML pipeline:")
    print("    -> ICE-2026-001 has drifted South-West directly into vessel track with increased uncertainty (6.5 km).")
    print("-" * 80)

    # Shift ICE-2026-001 directly into original path
    updated_preds = [
        IcebergPrediction(
            iceberg_id="ICE-2026-001",
            current_position=Waypoint(lat=-76.4, lon=165.6, time_offset_hours=0.0),
            predicted_positions=[
                Waypoint(lat=-76.4, lon=165.6, time_offset_hours=0.0),
                Waypoint(lat=-76.5, lon=165.7, time_offset_hours=6.0),
                Waypoint(lat=-76.6, lon=165.8, time_offset_hours=12.0),
            ],
            spatial_uncertainty_km=6.5,
            confidence_score=0.95,
            drift_velocity_knots=1.8,
            drift_bearing_deg=170.0,
            size_category=IcebergSizeCategory.LARGE,
        ),
        iceberg_preds[1],
        iceberg_preds[2],
    ]

    recalc_result = engine.update_predictions_and_recalculate(
        new_iceberg_predictions=updated_preds,
        algorithm="A*"
    )
    rm = recalc_result.metrics

    print()
    print("=" * 80)
    print(f"  RECALCULATED ROUTE RESULT ({recalc_result.route_id})")
    print("=" * 80)
    print(f"  • Recalculated Flag:      {recalc_result.recalculated}")
    print(f"  • New Total Distance:     {rm.total_distance_nm:.2f} NM ({rm.total_distance_km:.2f} km)")
    print(f"  • New Transit Time:       {rm.estimated_time_hours:.2f} hours")
    print(f"  • New Estimated Fuel:     {rm.estimated_fuel_tons:.2f} Metric Tons")
    print(f"  • New Peak Risk Score:    {rm.max_risk_score:.4f}")
    print(f"  • New Safety Index:       {rm.safety_index:.1f} / 100.0")
    print()

    # Output JSON payload structure for Saiesha's UI/Integration
    print("[6] Generating JSON output payload for Saiesha (UI/Integration Lead)...")
    json_output = json.dumps(recalc_result.to_dict(), indent=2)
    print("    Sample JSON DTO keys:", list(json.loads(json_output).keys()))
    print()
    print("✓ Demo execution completed successfully!")


if __name__ == "__main__":
    main()
