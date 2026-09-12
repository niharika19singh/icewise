#!/usr/bin/env python3
"""
ICEWISE SIH 2026 (SIH26059) - End-to-End Technical Demo
Module Lead: Niharika (Technical Risk Assessment & Route Optimization Lead)

Demonstrates the full pipeline:
Tanusha ML Trajectory Predictions (Multi-timestep + Uncertainty) -> Probabilistic Risk Field ->
A* Route Optimization -> Voyage Metrics -> Dynamic Prediction Update -> Rerouting Comparison
"""

import json
import os
import sys
import time

# Ensure parent path is in python path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from icewise.interfaces import Waypoint, IcebergPrediction, IcebergSizeCategory, VesselProfile
from icewise.pipeline import NavigationEngine


def run_e2e_demo():
    print("=" * 85)
    print("  ICEWISE SIH 2026 — Technical Route Optimization & Risk Engine Demo")
    print("  Module Lead: Niharika (Risk + Dijkstra/Route Optimization Lead)")
    print("=" * 85)

    # -------------------------------------------------------------------------
    # 1. Define Vessel Profile & Start/Destination Coordinates
    # -------------------------------------------------------------------------
    vessel = VesselProfile(
        vessel_id="VESSEL-R/V-PALMER",
        vessel_name="R/V Nathaniel B. Palmer",
        start_point=Waypoint(lat=-75.0, lon=165.0),
        destination=Waypoint(lat=-77.5, lon=166.5),
        cruise_speed_knots=11.5,
        fuel_consumption_rate_tons_per_day=14.0,
        risk_tolerance_factor=3.5,
        max_risk_threshold=0.65,
        ice_class="POLAR_CLASS_5",
    )

    print("\n[STEP 1] Vessel Profile Configured:")
    print(f"  • Name: {vessel.vessel_name} ({vessel.vessel_id})")
    print(f"  • Start Coordinates: ({vessel.start_point.lat:.2f}°S, {vessel.start_point.lon:.2f}°E)")
    print(f"  • Destination:       ({vessel.destination.lat:.2f}°S, {vessel.destination.lon:.2f}°E)")
    print(f"  • Cruising Speed:    {vessel.cruise_speed_knots} knots | Fuel Burn: {vessel.fuel_consumption_rate_tons_per_day} tons/day")

    # -------------------------------------------------------------------------
    # 2. Input: Tanusha's Multi-Timestep Iceberg Predictions
    # -------------------------------------------------------------------------
    initial_iceberg_predictions = [
        IcebergPrediction(
            iceberg_id="ICE-2026-A1",
            current_position=Waypoint(lat=-76.20, lon=165.80, time_offset_hours=0.0),
            predicted_positions=[
                Waypoint(lat=-76.20, lon=165.80, time_offset_hours=0.0),
                Waypoint(lat=-76.25, lon=165.85, time_offset_hours=6.0),
                Waypoint(lat=-76.30, lon=165.90, time_offset_hours=12.0),
                Waypoint(lat=-76.40, lon=166.00, time_offset_hours=24.0),
                Waypoint(lat=-76.50, lon=166.10, time_offset_hours=36.0),
            ],
            spatial_uncertainty_km=4.5,
            confidence_score=0.92,
            drift_velocity_knots=1.2,
            drift_bearing_deg=155.0,
            size_category=IcebergSizeCategory.LARGE,
        ),
        IcebergPrediction(
            iceberg_id="ICE-2026-B2",
            current_position=Waypoint(lat=-76.80, lon=165.20, time_offset_hours=0.0),
            predicted_positions=[
                Waypoint(lat=-76.80, lon=165.20, time_offset_hours=0.0),
                Waypoint(lat=-76.85, lon=165.30, time_offset_hours=6.0),
                Waypoint(lat=-76.90, lon=165.40, time_offset_hours=12.0),
                Waypoint(lat=-77.00, lon=165.60, time_offset_hours=24.0),
            ],
            spatial_uncertainty_km=3.0,
            confidence_score=0.88,
            drift_velocity_knots=0.9,
            drift_bearing_deg=120.0,
            size_category=IcebergSizeCategory.MEDIUM,
        ),
    ]

    print("\n[STEP 2] Consuming Tanusha's ML Trajectory Predictions:")
    for berg in initial_iceberg_predictions:
        print(f"  • Iceberg {berg.iceberg_id} ({berg.size_category.value}):")
        print(f"    - Current Pos: ({berg.current_position.lat:.2f}°S, {berg.current_position.lon:.2f}°E)")
        print(f"    - Uncertainty (σ): {berg.spatial_uncertainty_km} km | Confidence: {berg.confidence_score*100:.0f}%")
        print(f"    - Trajectory Timesteps: {len(berg.predicted_positions)} points over 36 hours")

    # -------------------------------------------------------------------------
    # 3. Initialize Engine & Run Initial Route Optimization
    # -------------------------------------------------------------------------
    print("\n[STEP 3] Converting Predictions to Spatial Risk Field & Running A* Route Engine...")
    t0 = time.time()
    engine = NavigationEngine(
        vessel=vessel,
        iceberg_predictions=initial_iceberg_predictions,
        grid_resolution_deg=0.08,
    )
    initial_route = engine.compute_route(algorithm="A*")
    t_initial_ms = (time.time() - t0) * 1000.0

    im = initial_route.metrics
    print(f"\n✓ INITIAL ROUTE GENERATED ({initial_route.route_id}) in {t_initial_ms:.1f} ms:")
    print(f"  • Total Distance:         {im.total_distance_nm:.2f} NM ({im.total_distance_km:.2f} km)")
    print(f"  • Estimated Time (ETA):   {im.estimated_time_hours:.2f} hours ({im.estimated_time_hours/24.0:.2f} days)")
    print(f"  • Estimated Fuel Burn:   {im.estimated_fuel_tons:.2f} Metric Tons (${im.estimated_fuel_cost_usd:,.2f} USD est.)")
    print(f"  • Mean Risk Score:        {im.mean_risk_score:.4f}")
    print(f"  • Peak Risk Score:        {im.max_risk_score:.4f}")
    print(f"  • Safety Index:           {im.safety_index:.1f} / 100.0")
    print(f"  • Total Waypoints:        {im.waypoint_count}")

    # -------------------------------------------------------------------------
    # 4. Simulate Updated Iceberg Predictions & Recalculate Route
    # -------------------------------------------------------------------------
    print("\n" + "-" * 85)
    print("[STEP 4] SIMULATING DYNAMIC RECALCULATION:")
    print("  Fresh ML prediction update received from Tanusha's module:")
    print("  -> ICE-2026-A1 has accelerated & drifted South-West directly into vessel track")
    print("  -> Spatial uncertainty expanded from 4.5 km to 7.0 km")
    print("-" * 85)

    updated_iceberg_predictions = [
        IcebergPrediction(
            iceberg_id="ICE-2026-A1",
            current_position=Waypoint(lat=-76.35, lon=165.55, time_offset_hours=0.0),
            predicted_positions=[
                Waypoint(lat=-76.35, lon=165.55, time_offset_hours=0.0),
                Waypoint(lat=-76.45, lon=165.65, time_offset_hours=6.0),
                Waypoint(lat=-76.55, lon=165.75, time_offset_hours=12.0),
                Waypoint(lat=-76.70, lon=165.90, time_offset_hours=24.0),
            ],
            spatial_uncertainty_km=7.0,  # Expanded uncertainty
            confidence_score=0.96,
            drift_velocity_knots=1.9,
            drift_bearing_deg=165.0,
            size_category=IcebergSizeCategory.LARGE,
        ),
        initial_iceberg_predictions[1],
    ]

    t1 = time.time()
    recalc_route = engine.update_predictions_and_recalculate(
        new_iceberg_predictions=updated_iceberg_predictions,
        algorithm="A*",
    )
    t_recalc_ms = (time.time() - t1) * 1000.0
    rm = recalc_route.metrics

    print(f"\n✓ RECALCULATED ROUTE GENERATED ({recalc_route.route_id}) in {t_recalc_ms:.1f} ms:")
    print(f"  • Recalculated Flag:      {recalc_route.recalculated}")
    print(f"  • New Total Distance:     {rm.total_distance_nm:.2f} NM ({rm.total_distance_km:.2f} km)")
    print(f"  • New Estimated Time:     {rm.estimated_time_hours:.2f} hours")
    print(f"  • New Fuel Consumption:   {rm.estimated_fuel_tons:.2f} Metric Tons (${rm.estimated_fuel_cost_usd:,.2f} USD est.)")
    print(f"  • New Peak Risk Score:    {rm.max_risk_score:.4f}")
    print(f"  • New Safety Index:       {rm.safety_index:.1f} / 100.0")

    # -------------------------------------------------------------------------
    # 5. Comparative Analysis (Original vs Recalculated Route)
    # -------------------------------------------------------------------------
    print("\n" + "=" * 85)
    print("  COMPARATIVE ANALYSIS: ORIGINAL vs RECALCULATED ROUTE")
    print("=" * 85)
    print(f"  Metric                      Original Route            Recalculated Route        Delta")
    print(f"  --------------------------  ------------------------  ------------------------  ------------------------")
    print(f"  Distance (NM)               {im.total_distance_nm:<24.2f}  {rm.total_distance_nm:<24.2f}  {rm.total_distance_nm - im.total_distance_nm:+.2f} NM")
    print(f"  Transit Time (hours)        {im.estimated_time_hours:<24.2f}  {rm.estimated_time_hours:<24.2f}  {rm.estimated_time_hours - im.estimated_time_hours:+.2f} hrs")
    print(f"  Fuel Burn (Metric Tons)     {im.estimated_fuel_tons:<24.2f}  {rm.estimated_fuel_tons:<24.2f}  {rm.estimated_fuel_tons - im.estimated_fuel_tons:+.2f} tons")
    print(f"  Peak Risk Score             {im.max_risk_score:<24.4f}  {rm.max_risk_score:<24.4f}  {rm.max_risk_score - im.max_risk_score:+.4f}")
    print(f"  Safety Index (0-100)        {im.safety_index:<24.1f}  {rm.safety_index:<24.1f}  {rm.safety_index - im.safety_index:+.1f} pts")
    print("=" * 85)

    # -------------------------------------------------------------------------
    # 6. Export JSON Payload for Saiesha (UI/Integration Lead)
    # -------------------------------------------------------------------------
    export_filename = "output_route_demo.json"
    with open(export_filename, "w") as f:
        json.dump(recalc_route.to_dict(), f, indent=2)

    print(f"\n[STEP 5] Exported complete route JSON payload to '{export_filename}'.")
    print("✓ End-to-end technical demo completed successfully!\n")


if __name__ == "__main__":
    run_e2e_demo()
