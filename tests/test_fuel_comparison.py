"""
Unit tests for Route Fuel-Consumption and Risk Comparison functionality.
"""

import unittest
from icewise.interfaces import (
    Waypoint, VesselProfile, RouteMetrics, NavigationRouteResult
)
from icewise.metrics import calculate_route_comparison, calculate_route_metrics
from icewise.pipeline import NavigationEngine
from icewise.sample_data import get_sample_vessel_profile, get_sample_iceberg_predictions


class TestFuelComparison(unittest.TestCase):

    def test_calculate_route_comparison_math(self):
        """Verify exact mathematical formulas for relative fuel, fuel change %, and risk reduction %."""
        # Baseline route: 100 NM, 5.0 tons fuel, 0.40 mean risk
        base_metrics = RouteMetrics(
            total_distance_nm=100.0,
            total_distance_km=185.2,
            estimated_time_hours=8.0,
            estimated_fuel_tons=5.0,
            estimated_fuel_cost_usd=4250.0,
            mean_risk_score=0.40,
            max_risk_score=0.75,
            safety_index=60.0,
            waypoint_count=10,
        )
        base_route = NavigationRouteResult(
            route_id="BASE-001",
            vessel_id="VESSEL-001",
            waypoints=[],
            metrics=base_metrics,
            algorithm_used="Shortest-Path Baseline"
        )

        # Alternative route (detour): 120 NM (+20% dist/fuel), 6.0 tons fuel, 0.10 mean risk (75% risk reduction)
        alt_metrics = RouteMetrics(
            total_distance_nm=120.0,
            total_distance_km=222.24,
            estimated_time_hours=9.6,
            estimated_fuel_tons=6.0,
            estimated_fuel_cost_usd=5100.0,
            mean_risk_score=0.10,
            max_risk_score=0.25,
            safety_index=90.0,
            waypoint_count=12,
        )
        alt_route = NavigationRouteResult(
            route_id="ALT-001",
            vessel_id="VESSEL-001",
            waypoints=[],
            metrics=alt_metrics,
            algorithm_used="A*"
        )

        comparison = calculate_route_comparison(alt_route, base_route)

        # Verify relative fuel = 120%
        self.assertEqual(comparison["relative_fuel_consumption_pct"], 120.0)
        self.assertEqual(alt_metrics.relative_fuel_consumption_pct, 120.0)

        # Verify fuel change = +20%
        self.assertEqual(comparison["fuel_change_pct"], 20.0)
        self.assertEqual(alt_metrics.fuel_change_pct, 20.0)

        # Verify risk reduction = 75%
        self.assertEqual(comparison["risk_reduction_pct"], 75.0)
        self.assertEqual(alt_metrics.risk_reduction_pct, 75.0)

        # Verify JSON export includes comparison
        d = alt_route.to_dict()
        self.assertIn("comparison", d)
        self.assertEqual(d["comparison"]["fuel_change_pct"], 20.0)
        self.assertEqual(d["comparison"]["risk_reduction_pct"], 75.0)
        self.assertIn("relative_fuel_consumption_pct", d["metrics"])

    def test_fuel_proportional_to_distance_not_risk(self):
        """Verify fuel calculation is strictly proportional to distance and not influenced by risk score."""
        vessel = get_sample_vessel_profile()
        preds = get_sample_iceberg_predictions()

        engine = NavigationEngine(
            vessel=vessel,
            iceberg_predictions=preds,
            grid_resolution_deg=0.1
        )

        result = engine.compute_route(algorithm="A*", include_comparison=True)
        dict_out = result.to_dict()

        self.assertIn("comparison", dict_out)
        comp = dict_out["comparison"]

        # Check relative fuel % matches distance ratio %
        dist_ratio_pct = (comp["route_distance_nm"] / comp["baseline_distance_nm"]) * 100.0
        self.assertAlmostEqual(comp["relative_fuel_consumption_pct"], round(dist_ratio_pct, 2), places=1)
        self.assertIn("assumption", comp)


def test_fuel_comparison_suite():
    suite = unittest.TestLoader().loadTestsFromTestCase(TestFuelComparison)
    runner = unittest.TextTestRunner(verbosity=0)
    res = runner.run(suite)
    assert res.wasSuccessful(), "Fuel comparison tests failed"


if __name__ == "__main__":
    unittest.main()
