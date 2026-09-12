"""
Unit tests for ICEWISE interfaces and DTOs.
"""

from icewise.interfaces import (
    Waypoint, IcebergPrediction, IcebergSizeCategory,
    VesselProfile, RouteMetrics, NavigationRouteResult
)
from icewise.sample_data import get_sample_iceberg_predictions, get_sample_vessel_profile


def test_waypoint_serialization():
    wp = Waypoint(lat=-76.5, lon=165.2, time_offset_hours=6.0)
    d = wp.to_dict()
    assert d["lat"] == -76.5
    assert d["lon"] == 165.2
    assert d["time_offset_hours"] == 6.0

    wp2 = Waypoint.from_dict(d)
    assert wp2.lat == wp.lat
    assert wp2.lon == wp.lon
    assert wp2.time_offset_hours == wp.time_offset_hours


def test_iceberg_prediction_serialization():
    preds = get_sample_iceberg_predictions()
    assert len(preds) > 0

    berg = preds[0]
    d = berg.to_dict()
    assert d["iceberg_id"] == "ICE-2026-001"
    assert d["spatial_uncertainty_km"] == 4.5
    assert d["confidence_score"] == 0.92
    assert len(d["predicted_positions"]) == 4


def test_vessel_profile():
    vessel = get_sample_vessel_profile()
    assert vessel.vessel_id == "VESSEL-R/V-NATHANIEL-PALMER"
    assert vessel.cruise_speed_knots == 11.5
    assert vessel.risk_tolerance_factor == 2.5
