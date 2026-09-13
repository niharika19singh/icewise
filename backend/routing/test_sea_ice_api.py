"""
Unit tests for NSIDC Sea-Ice Concentration Data and the FastAPI endpoints as
actually mounted on the real ICEWISE routing server (main.py) — not a
standalone app.
"""

import unittest
import os
import json
from fastapi.testclient import TestClient
from main import app
from icewise.sea_ice_api import DATA_PATH
from icewise.adapters import load_nsidc_sea_ice_data


class TestSeaIceAPI(unittest.TestCase):

    def setUp(self):
        self.client = TestClient(app)

    def test_sea_ice_dataset_file(self):
        """Verify the NSIDC dataset JSON file exists and contains valid cells."""
        self.assertTrue(os.path.exists(DATA_PATH), "Dataset file nsidc_sea_ice_20200102.json should exist")
        with open(DATA_PATH, "r") as f:
            payload = json.load(f)
        self.assertEqual(payload.get("dataset_id"), "S_20200102_concentration_v4.0")
        self.assertEqual(payload.get("cell_count"), 261)
        self.assertEqual(len(payload.get("data", [])), 261)

    def test_load_nsidc_sea_ice_adapter(self):
        """Verify adapter function builds EnvironmentalData instance."""
        env_data = load_nsidc_sea_ice_data()
        self.assertTrue(len(env_data.ice_concentration_map) > 0)
        # Verify a sample cell concentration
        sample_conc = env_data.ice_concentration_map.get((-61.6, -31.98))
        self.assertIsNotNone(sample_conc)
        self.assertGreater(sample_conc, 0.0)

    def test_fastapi_concentration_endpoint(self):
        """Verify GET /api/sea-ice/concentration endpoint."""
        response = self.client.get("/api/sea-ice/concentration")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["dataset_id"], "S_20200102_concentration_v4.0")
        self.assertEqual(data["cell_count"], 261)

        # Test bounding box query filter
        filter_resp = self.client.get("/api/sea-ice/concentration?min_lat=-65.0&max_lat=-60.0")
        self.assertEqual(filter_resp.status_code, 200)
        filtered_data = filter_resp.json()
        self.assertLessEqual(filtered_data["cell_count"], 261)

    def test_fastapi_geojson_endpoint(self):
        """Verify GET /api/sea-ice/geojson endpoint."""
        response = self.client.get("/api/sea-ice/geojson")
        self.assertEqual(response.status_code, 200)
        geojson = response.json()
        self.assertEqual(geojson["type"], "FeatureCollection")
        self.assertIn("metadata", geojson)
        self.assertEqual(len(geojson["features"]), 261)
        feature = geojson["features"][0]
        self.assertEqual(feature["type"], "Feature")
        self.assertEqual(feature["geometry"]["type"], "Point")
        self.assertIn("ice_concentration", feature["properties"])


def test_sea_ice_api_and_loader():
    suite = unittest.TestLoader().loadTestsFromTestCase(TestSeaIceAPI)
    runner = unittest.TextTestRunner(verbosity=0)
    result = runner.run(suite)
    assert result.wasSuccessful(), "Sea-Ice API tests failed"


if __name__ == "__main__":
    unittest.main()
