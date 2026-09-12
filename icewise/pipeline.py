"""
Navigation Engine Orchestrator for ICEWISE Decision Support System.
Provides a clean, modular API for Saiesha's UI/Integration module to consume.
Integrates iceberg predictions, probabilistic risk engine, grid graph, and route optimizers.
"""

import uuid
from typing import List, Optional, Dict, Any
from icewise.interfaces import (
    IcebergPrediction, EnvironmentalData, VesselProfile,
    NavigationRouteResult, Waypoint
)
from icewise.risk_engine import ProbabilisticRiskEngine
from icewise.grid_graph import NavigationGridGraph
from icewise.routing_engine import RouteOptimizer
from icewise.metrics import calculate_route_metrics


class NavigationEngine:
    """
    Core ICEWISE Navigation & Risk Assessment Pipeline.

    Pipeline Flow:
    1. Consumes iceberg predictions & spatial uncertainty (Tanusha's module output).
    2. Builds continuous spatial Gaussian risk field + sea-ice concentration layer.
    3. Constructs 8-connected geospatial grid graph.
    4. Executes risk-aware pathfinding (A* or Dijkstra).
    5. Calculates route metrics (distance, ETA, fuel, risk statistics).
    6. Exposes `update_predictions_and_recalculate()` for dynamic updates.
    """

    def __init__(self,
                 vessel: VesselProfile,
                 iceberg_predictions: Optional[List[IcebergPrediction]] = None,
                 environmental_data: Optional[EnvironmentalData] = None,
                 grid_resolution_deg: float = 0.05):
        """
        :param vessel: Vessel Profile defining start, destination, speed, and risk tolerance
        :param iceberg_predictions: Predictions from Tanusha's ML module
        :param environmental_data: Sea ice concentration & weather layers
        :param grid_resolution_deg: Grid resolution step in degrees (default 0.05° ~ 5.5 km)
        """
        self.vessel = vessel
        self.iceberg_predictions = iceberg_predictions or []
        self.environmental_data = environmental_data or EnvironmentalData()
        self.grid_resolution_deg = grid_resolution_deg

        # Automatically determine spatial bounding box around vessel start & destination with buffer
        self._init_bounds()

        # Initialize engines
        self.risk_engine = ProbabilisticRiskEngine(
            iceberg_predictions=self.iceberg_predictions,
            environmental_data=self.environmental_data,
        )
        self.graph = NavigationGridGraph(
            lat_min=self.lat_min, lat_max=self.lat_max,
            lon_min=self.lon_min, lon_max=self.lon_max,
            resolution_deg=self.grid_resolution_deg,
            risk_engine=self.risk_engine,
        )
        self.current_route_result: Optional[NavigationRouteResult] = None

    def _init_bounds(self) -> None:
        """Determines grid bounding box covering start, destination, and icebergs with safety margin."""
        all_lats = [self.vessel.start_point.lat, self.vessel.destination.lat]
        all_lons = [self.vessel.start_point.lon, self.vessel.destination.lon]

        for berg in self.iceberg_predictions:
            all_lats.append(berg.current_position.lat)
            all_lons.append(berg.current_position.lon)

        # 0.8° (~90 km) safety buffer around workspace boundaries
        buffer = 0.8
        self.lat_min = min(all_lats) - buffer
        self.lat_max = max(all_lats) + buffer
        self.lon_min = min(all_lons) - buffer
        self.lon_max = max(all_lons) + buffer

    def compute_route(self, algorithm: str = "A*", recalculated: bool = False) -> NavigationRouteResult:
        """
        Computes the optimal risk-aware navigation route using A* or Dijkstra search.

        :param algorithm: Pathfinding algorithm ("A*" or "Dijkstra")
        :param recalculated: Flag indicating if this computation is a dynamic recalculation
        :return: NavigationRouteResult ready for UI display or downstream consumption
        """
        optimizer = RouteOptimizer(graph=self.graph, vessel=self.vessel)

        algo_upper = algorithm.upper()
        if algo_upper == "A*" or algo_upper == "ASTAR":
            path_coords, cost = optimizer.find_route_astar()
            algo_name = "A*"
        elif algo_upper == "DIJKSTRA":
            path_coords, cost = optimizer.find_route_dijkstra()
            algo_name = "Dijkstra"
        else:
            raise ValueError(f"Unsupported algorithm '{algorithm}'. Choose 'A*' or 'Dijkstra'.")

        metrics, waypoints = calculate_route_metrics(
            path=path_coords,
            vessel=self.vessel,
            risk_engine=self.risk_engine
        )

        route_id = f"ROUTE-{uuid.uuid4().hex[:8].upper()}"

        notes = [
            f"Algorithm used: {algo_name}",
            f"Grid resolution: {self.grid_resolution_deg}° (~{self.grid_resolution_deg * 111:.1f} km)",
            f"Icebergs evaluated: {len(self.iceberg_predictions)}",
            "Prototype Assumptions: Constant vessel cruising speed; linear fuel burn model; 2D Gaussian drift uncertainty.",
        ]
        if recalculated:
            notes.append("Route dynamically recalculated due to updated iceberg predictions.")

        self.current_route_result = NavigationRouteResult(
            route_id=route_id,
            vessel_id=self.vessel.vessel_id,
            waypoints=waypoints,
            metrics=metrics,
            algorithm_used=algo_name,
            recalculated=recalculated,
            notes=notes,
        )
        return self.current_route_result

    def update_predictions_and_recalculate(self,
                                           new_iceberg_predictions: List[IcebergPrediction],
                                           new_environmental_data: Optional[EnvironmentalData] = None,
                                           algorithm: str = "A*") -> NavigationRouteResult:
        """
        Updates the iceberg predictions/uncertainties and recalculates the navigation route.

        :param new_iceberg_predictions: Updated list of IcebergPrediction DTOs from Tanusha's module
        :param new_environmental_data: Updated sea ice or weather data
        :param algorithm: Algorithm choice ("A*" or "Dijkstra")
        :return: Updated NavigationRouteResult DTO
        """
        self.iceberg_predictions = new_iceberg_predictions
        if new_environmental_data:
            self.environmental_data = new_environmental_data

        # 1. Update Risk Engine with new predictions
        self.risk_engine = ProbabilisticRiskEngine(
            iceberg_predictions=self.iceberg_predictions,
            environmental_data=self.environmental_data,
        )

        # 2. Update Risk Scores on Graph
        self.graph.update_risk_scores(self.risk_engine)

        # 3. Recalculate optimal path
        return self.compute_route(algorithm=algorithm, recalculated=True)


from icewise.adapters import IcebergPredictionAdapter


def run_navigation_pipeline_from_dict(
    vessel_dict: Dict[str, Any],
    iceberg_predictions_dicts: List[Dict[str, Any]],
    environmental_dict: Optional[Dict[str, Any]] = None,
    algorithm: str = "A*",
    grid_resolution_deg: float = 0.05
) -> Dict[str, Any]:
    """
    Convenience helper for REST APIs or cross-module integration.
    Takes raw JSON-serializable dictionaries for vessel, iceberg predictions (via Tanusha Adapter),
    and environment, runs the risk assessment and pathfinder, and returns a JSON-serializable dict output.
    """
    vessel = VesselProfile.from_dict(vessel_dict)
    iceberg_preds = IcebergPredictionAdapter.from_tanusha_json_list(iceberg_predictions_dicts)
    env_data = EnvironmentalData.from_dict(environmental_dict) if environmental_dict else None

    engine = NavigationEngine(
        vessel=vessel,
        iceberg_predictions=iceberg_preds,
        environmental_data=env_data,
        grid_resolution_deg=grid_resolution_deg
    )

    result = engine.compute_route(algorithm=algorithm)
    return result.to_dict()
