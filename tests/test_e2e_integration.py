"""
End-to-End Integration and System Audit Test Suite for ICEWISE SIH 2026.
"""

import unittest
import os
import sys
from fastapi.testclient import TestClient

# Ensure sibling backend/routing package is importable
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", "routing")))

from main import app, CSV_PATH, C18B_VALIDATION_CSV_PATH


class TestICEWISEEndToEndIntegration(unittest.TestCase):

    def setUp(self):
        self.client = TestClient(app)

    def test_datasets_exist(self):
        """Verify all real datasets exist in the backend repository structure."""
        self.assertTrue(os.path.exists(CSV_PATH), f"Prediction dataset missing at {CSV_PATH}")
        self.assertTrue(os.path.exists(C18B_VALIDATION_CSV_PATH), f"C18B validation dataset missing at {C18B_VALIDATION_CSV_PATH}")

    def test_generate_route_endpoint(self):
        """Test POST /api/route endpoint with real C18B scenario inputs."""
        payload = {
            "vessel_id": "RV-POLAR-STERN-01",
            "start_point": {"lat": -77.0, "lon": -42.0},
            "destination": {"lat": -74.5, "lon": -40.0},
            "cruise_speed_knots": 12.0,
            "fuel_consumption_rate_tons_per_day": 15.0,
            "algorithm": "A*",
            "target_timestamp": "2020-01-02T00:00:00Z"
        }
        response = self.client.post("/api/route", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()

        # Validate response structure
        self.assertIn("route_id", data)
        self.assertIn("waypoints", data)
        self.assertIn("metrics", data)
        self.assertIn("route_options", data)
        self.assertIn("icebergs", data)

        # Validate metrics
        metrics = data["metrics"]
        self.assertGreater(metrics["total_distance_nm"], 0.0)
        self.assertGreater(metrics["estimated_time_hours"], 0.0)
        self.assertGreater(metrics["estimated_fuel_tons"], 0.0)
        self.assertIn("relative_fuel_consumption_pct", metrics)
        self.assertIn("fuel_change_pct", metrics)
        self.assertIn("risk_reduction_pct", metrics)

        # Validate route options
        self.assertEqual(len(data["route_options"]), 3)
        labels = [opt["label"] for opt in data["route_options"]]
        self.assertIn("Baseline / Shortest", labels)
        self.assertIn("Balanced", labels)
        self.assertIn("Safety Priority", labels)

    def test_recalculate_route_endpoint(self):
        """Test POST /api/route/recalculate adaptive re-routing endpoint."""
        payload = {
            "vessel_id": "RV-POLAR-STERN-01",
            "start_point": {"lat": -77.0, "lon": -42.0},
            "destination": {"lat": -74.5, "lon": -40.0},
            "cruise_speed_knots": 12.0,
            "fuel_consumption_rate_tons_per_day": 15.0,
            "algorithm": "A*",
            "initial_target_timestamp": "2020-01-02T00:00:00Z"
        }
        response = self.client.post("/api/route/recalculate", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data.get("recalculated", False))

    def test_c18b_validation_endpoint(self):
        """Test GET /api/analytics/c18b-validation endpoint."""
        response = self.client.get("/api/analytics/c18b-validation")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["iceberg_id"], "C18B")
        self.assertEqual(data["forecast_horizon_hours"], 24.0)
        self.assertGreater(data["sample_count"], 0)
        self.assertIn("mean_physics_error_km", data)
        self.assertIn("mean_hybrid_error_km", data)

    def test_sea_ice_endpoints(self):
        """Test GET /api/sea-ice/concentration and /api/sea-ice/geojson endpoints."""
        res_conc = self.client.get("/api/sea-ice/concentration")
        self.assertEqual(res_conc.status_code, 200)
        self.assertEqual(res_conc.json()["cell_count"], 261)

        res_geo = self.client.get("/api/sea-ice/geojson")
        self.assertEqual(res_geo.status_code, 200)
        geojson = res_geo.json()
        self.assertEqual(geojson["type"], "FeatureCollection")
        self.assertEqual(len(geojson["features"]), 261)


def test_e2e_integration_suite():
    suite = unittest.TestLoader().loadTestsFromTestCase(TestICEWISEEndToEndIntegration)
    runner = unittest.TextTestRunner(verbosity=0)
    res = runner.run(suite)
    assert res.wasSuccessful(), "E2E Integration suite failed"


if __name__ == "__main__":
    unittest.main()
