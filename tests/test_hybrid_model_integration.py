"""
Integration tests for ICEWISE Physics + ML Hybrid Model and Routing Engine.
"""

import unittest
from icewise.hybrid_model import IcebergHybridPredictor
from icewise.interfaces import VesselProfile, Waypoint, IcebergPrediction
from icewise.pipeline import NavigationEngine


class TestHybridModelIntegration(unittest.TestCase):
    def setUp(self):
        self.predictor = IcebergHybridPredictor()

    def test_predictor_outputs_valid_dto(self):
        pred = self.predictor.predict_trajectory(
            iceberg_id="A23A",
            current_lat=-75.78,
            current_lon=-41.06,
            forecast_hours=[24.0, 48.0, 72.0],
            wind_u10=-6.0,
            wind_v10=-4.0
        )
        self.assertIsInstance(pred, IcebergPrediction)
        self.assertEqual(pred.iceberg_id, "A23A")
        self.assertEqual(pred.current_position.lat, -75.78)
        self.assertEqual(len(pred.predicted_positions), 3)
        self.assertEqual([pt.time_offset_hours for pt in pred.predicted_positions], [24.0, 48.0, 72.0])
        self.assertGreater(pred.spatial_uncertainty_km, 0.0)

    def test_hybrid_prediction_to_routing_pipeline(self):
        # 1. Generate predictions for multiple icebergs using trained hybrid model
        iceberg_a = self.predictor.predict_trajectory("A23A", -75.78, -41.06, [24, 48, 72], wind_u10=-6.0, wind_v10=-4.0)
        iceberg_b = self.predictor.predict_trajectory("D21B", -76.06, -39.00, [24, 48, 72], wind_u10=-6.0, wind_v10=-4.0)

        # 2. Setup vessel profile
        vessel = VesselProfile(
            vessel_id="RV-POLAR-STERN-HYBRID",
            vessel_name="R/V Polarstern Hybrid Test",
            start_point=Waypoint(lat=-77.0, lon=-42.0),
            destination=Waypoint(lat=-74.5, lon=-40.0),
            cruise_speed_knots=12.0
        )

        # 3. Execute routing pipeline
        engine = NavigationEngine(
            vessel=vessel,
            iceberg_predictions=[iceberg_a, iceberg_b],
            grid_resolution_deg=0.10
        )

        route_result = engine.compute_route(algorithm="A*")

        self.assertIsNotNone(route_result)
        self.assertEqual(route_result.vessel_id, "RV-POLAR-STERN-HYBRID")
        self.assertGreater(route_result.metrics.total_distance_nm, 0.0)
        self.assertGreater(len(route_result.waypoints), 0)


if __name__ == "__main__":
    unittest.main()
