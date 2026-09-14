"""
Unit tests for ICEWISE Probabilistic Risk Engine.
"""

import math
from icewise.risk_engine import ProbabilisticRiskEngine, haversine_distance_km, haversine_distance_nm
from icewise.sample_data import get_sample_iceberg_predictions, get_sample_environmental_data
from icewise.interfaces import Waypoint, IcebergPrediction


def test_haversine_distance():
    # Distance between (-75.0, 165.0) and (-76.0, 165.0) is approx 111 km (60 NM)
    dist_km = haversine_distance_km(-75.0, 165.0, -76.0, 165.0)
    assert 110.0 < dist_km < 112.0

    dist_nm = haversine_distance_nm(-75.0, 165.0, -76.0, 165.0)
    assert 59.0 < dist_nm < 61.0


def test_iceberg_collision_risk_attenuation():
    preds = get_sample_iceberg_predictions()
    engine = ProbabilisticRiskEngine(iceberg_predictions=preds)

    # Risk at exact iceberg position (-76.2, 165.8) should be high
    high_risk = engine.calculate_iceberg_collision_risk(-76.2, 165.8)
    assert high_risk > 0.80

    # Risk 50 km away (-75.0, 165.0) should decay close to 0.0
    low_risk = engine.calculate_iceberg_collision_risk(-75.0, 165.0)
    assert low_risk < 0.05

    assert high_risk > low_risk


def test_combined_total_risk():
    preds = get_sample_iceberg_predictions()
    env = get_sample_environmental_data()
    engine = ProbabilisticRiskEngine(iceberg_predictions=preds, environmental_data=env)

    total_risk_center = engine.calculate_total_risk(-76.2, 165.8)
    assert 0.0 <= total_risk_center <= 1.0
    assert total_risk_center > 0.50
