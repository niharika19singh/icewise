"""
Tests for direct integration of Tanusha's real iceberg prediction dataset CSV format.
"""

import os
import unittest
from icewise.adapters import IcebergPredictionAdapter
from icewise.interfaces import IcebergPrediction, Waypoint


class TestRealCSVIntegration(unittest.TestCase):
    CSV_PATH = "/Users/user/Downloads/iceberg_prediction_dataset.csv"

    def setUp(self):
        if not os.path.exists(self.CSV_PATH):
            self.skipTest(f"Dataset file not found at {self.CSV_PATH}")

    def test_load_csv_file(self):
        predictions = IcebergPredictionAdapter.from_tanusha_csv_file(
            self.CSV_PATH, target_timestamp="2020-01-02T00:00:00Z"
        )
        self.assertGreater(len(predictions), 0)

        # Check an iceberg prediction object
        iceberg_ids = [p.iceberg_id for p in predictions]
        self.assertIn("A23A", iceberg_ids)

        a23a = next(p for p in predictions if p.iceberg_id == "A23A")
        self.assertIsInstance(a23a, IcebergPrediction)
        self.assertEqual(a23a.current_position.lat, -75.7833)
        self.assertEqual(a23a.current_position.lon, -41.0659)
        self.assertEqual(len(a23a.predicted_positions), 3)  # 24h, 48h, 72h

        # Check forecast hours
        fhours = [pt.time_offset_hours for pt in a23a.predicted_positions]
        self.assertEqual(fhours, [24.0, 48.0, 72.0])

        # Check uncertainty radius
        self.assertGreater(a23a.spatial_uncertainty_km, 0.0)

    def test_load_csv_rows(self):
        sample_rows = [
            {
                "iceberg_id": "TEST1",
                "current_timestamp": "2020-01-02T00:00:00Z",
                "current_latitude": "-70.0",
                "current_longitude": "-40.0",
                "prediction_timestamp": "2020-01-03T00:00:00Z",
                "forecast_hours": "24",
                "predicted_latitude": "-70.1",
                "predicted_longitude": "-40.1",
                "uncertainty_km": "3.5",
                "model": "physics_ml_hybrid",
            },
            {
                "iceberg_id": "TEST1",
                "current_timestamp": "2020-01-02T00:00:00Z",
                "current_latitude": "-70.0",
                "current_longitude": "-40.0",
                "prediction_timestamp": "2020-01-04T00:00:00Z",
                "forecast_hours": "48",
                "predicted_latitude": "-70.2",
                "predicted_longitude": "-40.2",
                "uncertainty_km": "4.5",
                "model": "physics_ml_hybrid",
            },
        ]
        predictions = IcebergPredictionAdapter.from_tanusha_csv_rows(sample_rows)
        self.assertEqual(len(predictions), 1)
        pred = predictions[0]
        self.assertEqual(pred.iceberg_id, "TEST1")
        self.assertEqual(pred.current_position.lat, -70.0)
        self.assertEqual(len(pred.predicted_positions), 2)
        self.assertEqual(pred.spatial_uncertainty_km, 4.5)


if __name__ == "__main__":
    unittest.main()
