"""
Route Optimization Engine for ICEWISE Navigation Decision Support System.
Implements A* and Dijkstra pathfinding algorithms over geospatial grid graphs,
utilizing a multi-objective risk-adjusted cost function for ice-safe maritime routing.
"""

import heapq
import math
from typing import List, Tuple, Dict, Optional, Set
from icewise.interfaces import Waypoint, VesselProfile, NavigationRouteResult, RouteMetrics
from icewise.grid_graph import NavigationGridGraph
from icewise.risk_engine import haversine_distance_nm


class RouteOptimizer:
    """
    Executes graph search algorithms (A* and Dijkstra) to compute optimal maritime routes.
    Incorporate distance, iceberg collision risk, and sea ice penalties into edge weights.
    """

    def __init__(self, graph: NavigationGridGraph, vessel: VesselProfile):
        """
        :param graph: Constructed NavigationGridGraph
        :param vessel: Vessel Profile defining start, destination, speed, and risk tolerance α
        """
        self.graph = graph
        self.vessel = vessel

    def compute_edge_cost(self,
                          u: Tuple[float, float],
                          v: Tuple[float, float],
                          distance_nm: float) -> float:
        """
        Multi-objective Cost Function:
        Cost(u -> v) = Distance_NM * (1 + alpha * Risk(v))
        If Risk(v) exceeds vessel.max_risk_threshold, edge is impassable (infinity cost).
        """
        node_risk = self.graph.node_risk.get(v, 0.0)

        # Check hard risk threshold (impassable zone)
        if node_risk > self.vessel.max_risk_threshold:
            return float('inf')

        # Risk-weighted cost multiplier
        alpha = max(0.0, self.vessel.risk_tolerance_factor)
        cost_multiplier = 1.0 + alpha * node_risk
        return distance_nm * cost_multiplier

    def find_route_astar(self) -> Tuple[List[Tuple[float, float]], float]:
        """
        Executes A* search algorithm to find the optimal risk-aware path.
        Heuristic h(n): Haversine distance in NM from node n to destination.
        """
        start_node = self.graph.find_nearest_node(self.vessel.start_point)
        dest_node = self.graph.find_nearest_node(self.vessel.destination)

        if start_node == dest_node:
            return [start_node], 0.0

        # Priority queue stores tuples: (f_score, g_score, current_node)
        open_set: List[Tuple[float, float, Tuple[float, float]]] = []
        heapq.heappush(open_set, (0.0, 0.0, start_node))

        came_from: Dict[Tuple[float, float], Tuple[float, float]] = {}
        g_score: Dict[Tuple[float, float], float] = {start_node: 0.0}

        def heuristic(node: Tuple[float, float]) -> float:
            # Admissible Haversine distance heuristic to destination
            return haversine_distance_nm(node[0], node[1], dest_node[0], dest_node[1])

        visited: Set[Tuple[float, float]] = set()

        while open_set:
            _, current_g, current = heapq.heappop(open_set)

            if current in visited:
                continue
            visited.add(current)

            if current == dest_node:
                # Reconstruct path
                path = []
                curr = dest_node
                while curr in came_from:
                    path.append(curr)
                    curr = came_from[curr]
                path.append(start_node)
                path.reverse()
                return path, g_score[dest_node]

            for neighbor, dist_nm in self.graph.neighbors.get(current, []):
                if neighbor in visited:
                    continue

                edge_cost = self.compute_edge_cost(current, neighbor, dist_nm)
                if edge_cost == float('inf'):
                    continue  # Impassable node due to extreme risk or land

                tentative_g = current_g + edge_cost

                if neighbor not in g_score or tentative_g < g_score[neighbor]:
                    came_from[neighbor] = current
                    g_score[neighbor] = tentative_g
                    f_score = tentative_g + heuristic(neighbor)
                    heapq.heappush(open_set, (f_score, tentative_g, neighbor))

        raise ValueError(f"No safe route found between start {start_node} and destination {dest_node} "
                         f"under risk threshold {self.vessel.max_risk_threshold}")

    def find_route_dijkstra(self) -> Tuple[List[Tuple[float, float]], float]:
        """
        Executes Dijkstra search algorithm (equivalent to A* with zero heuristic h(n) = 0).
        """
        start_node = self.graph.find_nearest_node(self.vessel.start_point)
        dest_node = self.graph.find_nearest_node(self.vessel.destination)

        if start_node == dest_node:
            return [start_node], 0.0

        open_set: List[Tuple[float, Tuple[float, float]]] = []
        heapq.heappush(open_set, (0.0, start_node))

        came_from: Dict[Tuple[float, float], Tuple[float, float]] = {}
        g_score: Dict[Tuple[float, float], float] = {start_node: 0.0}
        visited: Set[Tuple[float, float]] = set()

        while open_set:
            current_g, current = heapq.heappop(open_set)

            if current in visited:
                continue
            visited.add(current)

            if current == dest_node:
                path = []
                curr = dest_node
                while curr in came_from:
                    path.append(curr)
                    curr = came_from[curr]
                path.append(start_node)
                path.reverse()
                return path, g_score[dest_node]

            for neighbor, dist_nm in self.graph.neighbors.get(current, []):
                if neighbor in visited:
                    continue

                edge_cost = self.compute_edge_cost(current, neighbor, dist_nm)
                if edge_cost == float('inf'):
                    continue

                tentative_g = current_g + edge_cost

                if neighbor not in g_score or tentative_g < g_score[neighbor]:
                    came_from[neighbor] = current
                    g_score[neighbor] = tentative_g
                    heapq.heappush(open_set, (tentative_g, neighbor))

        raise ValueError(f"No safe route found using Dijkstra between {start_node} and {dest_node}")
