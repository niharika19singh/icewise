"""
Geospatial Grid Graph Generator for Antarctic Maritime Navigation.
Constructs a discrete 8-connected spatial graph over a bounded coordinate grid,
incorporates land masking, and evaluates Haversine edge distances.
"""

import math
from typing import List, Tuple, Dict, Set, Optional
from icewise.interfaces import Waypoint
from icewise.risk_engine import haversine_distance_nm, ProbabilisticRiskEngine


class NavigationGridGraph:
    """
    Represents the navigation workspace as a 2D spatial grid graph.
    Nodes are (lat, lon) coordinates, edges link 8-neighbor adjacent cells.
    """

    def __init__(self,
                 lat_min: float, lat_max: float,
                 lon_min: float, lon_max: float,
                 resolution_deg: float = 0.05,
                 risk_engine: Optional[ProbabilisticRiskEngine] = None):
        """
        :param lat_min: Southern boundary latitude (e.g. -78.0)
        :param lat_max: Northern boundary latitude (e.g. -74.0)
        :param lon_min: Western boundary longitude (e.g. 162.0)
        :param lon_max: Eastern boundary longitude (e.g. 168.0)
        :param resolution_deg: Grid resolution in degrees (e.g. 0.05° ~ 5.5 km)
        :param risk_engine: Risk Engine instance to evaluate node risks
        """
        self.lat_min = round(lat_min, 4)
        self.lat_max = round(lat_max, 4)
        self.lon_min = round(lon_min, 4)
        self.lon_max = round(lon_max, 4)
        self.resolution_deg = round(resolution_deg, 4)
        self.risk_engine = risk_engine

        self.nodes: Set[Tuple[float, float]] = set()
        self.neighbors: Dict[Tuple[float, float], List[Tuple[Tuple[float, float], float]]] = {}
        self.node_risk: Dict[Tuple[float, float], float] = {}

        self._build_grid()

    def _is_land(self, lat: float, lon: float) -> bool:
        """
        Basic land masking check for Ross Sea / Victoria Land / Ross Island region.
        In production, this would query a bathymetry GMTED/GEBCO shapefile.
        Here we define realistic coastal land approximations for Antarctic Ross Sea region.
        """
        # Victoria Land coastline boundary approximation (West of ~163.5°E in south)
        if lat < -76.5 and lon < 163.5:
            return True
        # Ross Island / Mount Erebus area approximation (-77.5° to -77.8°S, 166.8° to 168.0°E)
        if -77.9 <= lat <= -77.4 and 166.8 <= lon <= 168.0:
            return True
        # Ross Ice Shelf southern barrier boundary (South of -78.1°S)
        if lat < -78.1:
            return True
        return False

    def _build_grid(self) -> None:
        """Generates graph nodes and 8-connected edges within bounding box."""
        # 1. Generate valid water nodes
        lat_count = int(round((self.lat_max - self.lat_min) / self.resolution_deg)) + 1
        lon_count = int(round((self.lon_max - self.lon_min) / self.resolution_deg)) + 1

        for i in range(lat_count):
            lat = round(self.lat_min + i * self.resolution_deg, 4)
            for j in range(lon_count):
                lon = round(self.lon_min + j * self.resolution_deg, 4)
                if not self._is_land(lat, lon):
                    node = (lat, lon)
                    self.nodes.add(node)
                    # Evaluate node risk score
                    if self.risk_engine:
                        self.node_risk[node] = self.risk_engine.calculate_total_risk(lat, lon)
                    else:
                        self.node_risk[node] = 0.0

        # 2. Build 8-neighbor connectivity graph
        # Relative grid step offsets for 8 directions: N, NE, E, SE, S, SW, W, NW
        step = self.resolution_deg
        directions = [
            (step, 0.0), (step, step), (0.0, step), (-step, step),
            (-step, 0.0), (-step, -step), (0.0, -step), (step, -step)
        ]

        for node in self.nodes:
            lat, lon = node
            adj_list = []
            for d_lat, d_lon in directions:
                neighbor = (round(lat + d_lat, 4), round(lon + d_lon, 4))
                if neighbor in self.nodes:
                    # Edge weight = Haversine distance in Nautical Miles
                    dist_nm = haversine_distance_nm(lat, lon, neighbor[0], neighbor[1])
                    adj_list.append((neighbor, dist_nm))
            self.neighbors[node] = adj_list

    def find_nearest_node(self, waypoint: Waypoint) -> Tuple[float, float]:
        """Finds the closest valid grid node to a given Waypoint."""
        target_node = (round(waypoint.lat, 4), round(waypoint.lon, 4))
        if target_node in self.nodes:
            return target_node

        # Fallback: search for node with minimum Haversine distance
        best_node = None
        min_dist = float('inf')
        for node in self.nodes:
            dist = haversine_distance_nm(waypoint.lat, waypoint.lon, node[0], node[1])
            if dist < min_dist:
                min_dist = dist
                best_node = node

        if best_node is None:
            raise ValueError(f"No valid grid nodes found near waypoint ({waypoint.lat}, {waypoint.lon})")
        return best_node

    def update_risk_scores(self, new_risk_engine: ProbabilisticRiskEngine) -> None:
        """Updates node risk values across the graph when risk engine predictions change."""
        self.risk_engine = new_risk_engine
        for node in self.nodes:
            self.node_risk[node] = self.risk_engine.calculate_total_risk(node[0], node[1])
