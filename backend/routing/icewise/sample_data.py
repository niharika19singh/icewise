"""
Sample Prediction Data Generator for Tanusha's ML Iceberg Trajectory Module.
Provides realistic sample prediction data for Antarctic waters (Ross Sea / McMurdo region)
to allow routing engine development and integration testing to proceed independently.
"""

from typing import List
from icewise.interfaces import Waypoint, IcebergPrediction, IcebergSizeCategory, EnvironmentalData, VesselProfile


def get_sample_iceberg_predictions() -> List[IcebergPrediction]:
    """
    Returns sample predicted iceberg trajectories in the Ross Sea region (-75°S to -78°S).
    Includes positions, forecast trajectories (+6h, +12h, +24h), spatial uncertainty, and confidence.
    """
    return [
        IcebergPrediction(
            iceberg_id="ICE-2026-001",
            current_position=Waypoint(lat=-76.2, lon=165.8, time_offset_hours=0.0),
            predicted_positions=[
                Waypoint(lat=-76.2, lon=165.8, time_offset_hours=0.0),
                Waypoint(lat=-76.25, lon=165.85, time_offset_hours=6.0),
                Waypoint(lat=-76.30, lon=165.90, time_offset_hours=12.0),
                Waypoint(lat=-76.40, lon=166.00, time_offset_hours=24.0),
            ],
            spatial_uncertainty_km=4.5,
            confidence_score=0.92,
            drift_velocity_knots=1.2,
            drift_bearing_deg=155.0,
            size_category=IcebergSizeCategory.LARGE,
        ),
        IcebergPrediction(
            iceberg_id="ICE-2026-002",
            current_position=Waypoint(lat=-76.8, lon=165.2, time_offset_hours=0.0),
            predicted_positions=[
                Waypoint(lat=-76.8, lon=165.2, time_offset_hours=0.0),
                Waypoint(lat=-76.83, lon=165.30, time_offset_hours=6.0),
                Waypoint(lat=-76.87, lon=165.40, time_offset_hours=12.0),
                Waypoint(lat=-76.95, lon=165.60, time_offset_hours=24.0),
            ],
            spatial_uncertainty_km=3.0,
            confidence_score=0.88,
            drift_velocity_knots=0.9,
            drift_bearing_deg=120.0,
            size_category=IcebergSizeCategory.MEDIUM,
        ),
        IcebergPrediction(
            iceberg_id="ICE-2026-003",
            current_position=Waypoint(lat=-75.8, lon=166.2, time_offset_hours=0.0),
            predicted_positions=[
                Waypoint(lat=-75.80, lon=166.20, time_offset_hours=0.0),
                Waypoint(lat=-75.82, lon=166.22, time_offset_hours=6.0),
                Waypoint(lat=-75.85, lon=166.25, time_offset_hours=12.0),
                Waypoint(lat=-75.90, lon=166.30, time_offset_hours=24.0),
            ],
            spatial_uncertainty_km=2.0,
            confidence_score=0.78,
            drift_velocity_knots=0.6,
            drift_bearing_deg=140.0,
            size_category=IcebergSizeCategory.BERGY_BIT,
        ),
    ]


def get_sample_vessel_profile() -> VesselProfile:
    """
    Returns a standard research/supply vessel profile operating in Antarctic waters.
    Start: Ross Sea North (-75.0°S, 165.0°E)
    Destination: McMurdo Approach (-77.5°S, 166.5°E)
    """
    return VesselProfile(
        vessel_id="VESSEL-R/V-NATHANIEL-PALMER",
        vessel_name="R/V Nathaniel B. Palmer",
        start_point=Waypoint(lat=-75.0, lon=165.0),
        destination=Waypoint(lat=-77.5, lon=166.5),
        cruise_speed_knots=11.5,
        fuel_consumption_rate_tons_per_day=14.0,
        risk_tolerance_factor=2.5,
        max_risk_threshold=0.65,
        ice_class="POLAR_CLASS_5",
    )


def get_sample_environmental_data() -> EnvironmentalData:
    """
    Returns sample sea-ice concentration map for Ross Sea area.
    Concentration ranges from 0.05 (open water) up to 0.40 (scattered pack ice).
    """
    # Sample background sea-ice distribution
    ice_map = {}
    # Higher concentration near southern coastal zone (-77° to -78°)
    for lat_idx in range(-780, -745, 5):
        lat = lat_idx / 10.0
        for lon_idx in range(1640, 1680, 5):
            lon = lon_idx / 10.0
            # Higher ice concentration in southern/coastal lat
            dist_south = abs(lat - (-78.0))
            conc = max(0.05, min(0.60, 0.45 - dist_south * 0.10))
            ice_map[(round(lat, 2), round(lon, 2))] = round(conc, 2)

    return EnvironmentalData(
        ice_concentration_map=ice_map,
        default_ice_concentration=0.10,
        weather_risk_factor=1.0,
    )
