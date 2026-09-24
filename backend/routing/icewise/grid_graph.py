"""
Geospatial Grid Graph Generator for Antarctic Maritime Navigation.
Constructs a discrete 8-connected spatial graph over a bounded coordinate grid,
incorporates land masking, and evaluates Haversine edge distances.
"""

import math
from typing import List, Tuple, Dict, Set, Optional
from icewise.interfaces import Waypoint
from icewise.risk_engine import haversine_distance_nm, ProbabilisticRiskEngine

# Maximum snap distance (degrees) before find_nearest_node raises instead of
# silently snapping. ~0.5° ≈ 55 km — beyond this the user almost certainly
# supplied a wrong coordinate (land, wrong ocean basin, typo).
_MAX_SILENT_SNAP_DEG = 0.5


# ---------------------------------------------------------------------------
# Supported operating region (navigability model)
# ---------------------------------------------------------------------------
#
# The repository contains NO coastline, ice-shelf or bathymetry dataset (no
# GSHHS/GEBCO/Natural Earth/shapefile), and no geo libraries are installed. A
# real land mask therefore cannot be built here, and this module does not claim
# one. Instead, navigability is restricted to a small, deliberately CONSERVATIVE
# set of open-water rectangles in the Weddell Sea. Anything outside them is
# treated as NOT navigable, so the router can never produce a "valid" route over
# the Antarctic Peninsula, the Ronne/Filchner ice shelves, Berkner Island or the
# continental ice sheet.
#
# These rectangles are hand-drawn approximations, not surveyed geometry. They are
# kept well clear of the known coast/ice fronts and are consistent with the real
# observations in this repository:
#   - iceberg tracks in iceberg_prediction_dataset.csv (e.g. A23A near
#     (-75.8, -41.1), D21B drifting through (-70.6, -43.7) and (-67.6, -43.9)),
#   - 181 of the 261 NSIDC ocean concentration cells (NSIDC only reports
#     concentration over ocean).
# Rectangle A is the open Weddell Sea between the Peninsula and Coats Land;
# rectangle B is the approach toward the Filchner ice front that contains the
# ICEWISE demo corridor (-77.0, -42.0) -> (-74.5, -40.0), with a ~0.25 deg margin
# on its southern edge.
#
# Replace this with a real GSHHS/GEBCO-derived mask before operational use.
SUPPORTED_REGION_ID = "weddell-sea-conservative-v1"

# (lat_min, lat_max, lon_min, lon_max) in degrees.
_SUPPORTED_WATER_RECTS: Tuple[Tuple[float, float, float, float], ...] = (
    (-74.0, -62.0, -52.0, -30.0),   # A: open Weddell Sea
    (-77.25, -74.0, -46.0, -36.0),  # B: approach to the Filchner ice front (demo corridor)
)


def in_supported_operating_region(lat: float, lon: float) -> bool:
    """True if (lat, lon) lies inside one of the supported open-water rectangles."""
    return any(a <= lat <= b and c <= lon <= d for a, b, c, d in _SUPPORTED_WATER_RECTS)


def supported_region_summary() -> str:
    """Human-readable description of the supported operating region."""
    parts = [
        f"lat {abs(b):g}°S to {abs(a):g}°S, lon {abs(d):g}°W to {abs(c):g}°W"
        for a, b, c, d in _SUPPORTED_WATER_RECTS
    ]
    return "Weddell Sea open-water region (" + "; ".join(parts) + ")"


def unsupported_region_reason(lat: float, lon: float) -> str:
    """Operator-facing reason used when a point is outside the supported region."""
    return (
        f"Coordinate ({lat:.4f}, {lon:.4f}) is outside ICEWISE's supported navigable region and "
        f"is treated as not navigable. Supported: {supported_region_summary()}. "
        "ICEWISE has no coastline dataset, so land and ice shelves cannot be ruled out elsewhere."
    )


def supported_region_metadata() -> dict:
    """Machine-readable form of the supported region (for API error/health payloads)."""
    return {
        "id": SUPPORTED_REGION_ID,
        "rectangles": [
            {"lat_min": a, "lat_max": b, "lon_min": c, "lon_max": d}
            for a, b, c, d in _SUPPORTED_WATER_RECTS
        ],
    }


def _classify_region(lon_min: float, lon_max: float) -> str:
    """
    Classifies grid region based on longitude range.

    Returns one of:
      'weddell'  — lon range overlaps Weddell Sea corridor [-65W, -30W]
      'ross'     — lon range overlaps Ross Sea corridor [155E, 175E]
      'antarctic'— generic Southern Ocean (neither Ross nor Weddell)

    In production this would be replaced by a proper GEBCO/GSHHS polygon
    lookup; for now we use basin heuristics which are correct for all known
    ICEWISE mission profiles.
    """
    # Weddell Sea: roughly -65W to -30W
    weddell_lon_min, weddell_lon_max = -65.0, -30.0
    # Ross Sea: roughly 155E to 175E (positive degrees)
    ross_lon_min, ross_lon_max = 155.0, 175.0

    if lon_max >= weddell_lon_min and lon_min <= weddell_lon_max:
        return "weddell"
    if lon_max >= ross_lon_min and lon_min <= ross_lon_max:
        return "ross"
    return "antarctic"


class NavigationGridGraph:
    """
    Represents the navigation workspace as a 2D spatial grid graph.
    Nodes are (lat, lon) coordinates, edges link 8-neighbor adjacent cells.

    Navigability is region-aware and deliberately conservative (see
    "Supported operating region" above; there is no coastline dataset in the repo):
    - Weddell Sea  : water ONLY inside the supported open-water rectangles;
                     everything else (Peninsula, ice shelves, ice sheet) is blocked
    - Ross Sea     : legacy hardcoded Victoria Land / Ross Island / Ross Ice Shelf
                     approximations, kept for the engine's original sample data
                     only. Unverified; the public API does not offer Ross routing.
    - Generic      : no supported model -> everything is blocked

    In production, swap _is_land() for a GEBCO/GSHHS bathymetry query.
    """

    def __init__(self,
                 lat_min: float, lat_max: float,
                 lon_min: float, lon_max: float,
                 resolution_deg: float = 0.05,
                 risk_engine: Optional[ProbabilisticRiskEngine] = None):
        """
        :param lat_min: Southern boundary latitude
        :param lat_max: Northern boundary latitude
        :param lon_min: Western boundary longitude
        :param lon_max: Eastern boundary longitude
        :param resolution_deg: Grid resolution in degrees (e.g. 0.05° ~ 5.5 km)
        :param risk_engine: Risk Engine instance to evaluate node risks
        """
        self.lat_min = round(lat_min, 4)
        self.lat_max = round(lat_max, 4)
        self.lon_min = round(lon_min, 4)
        self.lon_max = round(lon_max, 4)
        self.resolution_deg = round(resolution_deg, 4)
        self.risk_engine = risk_engine

        self._region = _classify_region(self.lon_min, self.lon_max)

        self.nodes: Set[Tuple[float, float]] = set()
        self.neighbors: Dict[Tuple[float, float], List[Tuple[Tuple[float, float], float]]] = {}
        self.node_risk: Dict[Tuple[float, float], float] = {}

        self._build_grid()

    def _is_land(self, lat: float, lon: float) -> bool:
        """
        Region-aware "not navigable" cell check (True = blocked).

        Weddell Sea basin (-65W to -30W):
            Water only inside the supported open-water rectangles
            (SUPPORTED_REGION_ID). Everything else is blocked, which keeps the
            Antarctic Peninsula, Ronne/Filchner ice shelves, Berkner Island and
            the ice sheet out of every route. An earlier version assumed the
            whole basin between -80 and -55 was open ocean, and routed across
            all of those.

        Ross Sea basin (155E to 175E):
            Legacy Victoria Land / Ross Island / Ross Ice Shelf approximations
            from the original implementation. Unverified; not offered by the API.

        Generic Southern Ocean:
            No supported navigability model, so every cell is blocked.
        """
        if self._region == "weddell":
            return not in_supported_operating_region(lat, lon)

        elif self._region == "ross":
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

        else:
            # No supported navigability model outside the Weddell/Ross basins.
            return True

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
                    # Evaluate node risk score. NOTE: this is the STATIC forecast-envelope
                    # risk (no time offset): the worst case over every forecast position of
                    # every iceberg. Path search therefore does not know when the vessel
                    # would reach a cell; only the reported route metrics (metrics.py) are
                    # evaluated at each waypoint's ETA. See routing_engine.py.
                    if self.risk_engine:
                        self.node_risk[node] = self.risk_engine.calculate_total_risk(lat, lon)
                    else:
                        self.node_risk[node] = 0.0

        # 2. Build 8-neighbor connectivity graph
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
                    dist_nm = haversine_distance_nm(lat, lon, neighbor[0], neighbor[1])
                    adj_list.append((neighbor, dist_nm))
            self.neighbors[node] = adj_list

    def is_land(self, lat: float, lon: float) -> bool:
        """Public wrapper for land check — used by API validation layer."""
        return self._is_land(lat, lon)

    def find_nearest_node(self, waypoint: Waypoint) -> Tuple[float, float]:
        """
        Finds the closest valid (non-land, in-domain) grid node to a given Waypoint.

        Raises ValueError if:
        - No nodes exist in the graph at all.
        - The closest valid node is more than _MAX_SILENT_SNAP_DEG degrees away,
          indicating the requested coordinate is in a fundamentally wrong location
          (land mass, wrong ocean basin, far outside grid domain). Silent snapping
          within _MAX_SILENT_SNAP_DEG is allowed and recorded via snapped_from.
        """
        if not self.nodes:
            raise ValueError(
                "Navigation grid has no traversable nodes. "
                "Check that the bounding box is within the supported Antarctic domain "
                "and that the start/destination are not in a fully blocked region."
            )

        target_node = (round(waypoint.lat, 4), round(waypoint.lon, 4))
        if target_node in self.nodes:
            return target_node

        # Search for nearest valid node by Haversine distance
        best_node = None
        min_dist = float('inf')
        for node in self.nodes:
            dist = haversine_distance_nm(waypoint.lat, waypoint.lon, node[0], node[1])
            if dist < min_dist:
                min_dist = dist
                best_node = node

        if best_node is None:
            raise ValueError(
                f"No valid grid nodes found near waypoint ({waypoint.lat:.4f}, {waypoint.lon:.4f})."
            )

        # Approximate snap distance in degrees for the threshold check
        snap_deg = math.sqrt(
            (waypoint.lat - best_node[0]) ** 2 + (waypoint.lon - best_node[1]) ** 2
        )
        if snap_deg > _MAX_SILENT_SNAP_DEG:
            raise ValueError(
                f"Coordinate ({waypoint.lat:.4f}, {waypoint.lon:.4f}) is not navigable: "
                f"nearest valid water node is ({best_node[0]:.4f}, {best_node[1]:.4f}), "
                f"{snap_deg:.2f}° away ({min_dist:.1f} NM). "
                "This coordinate may be on land, outside the supported Antarctic domain, "
                "or in an unnavigable region. "
                f"Supported region for this grid: lat [{self.lat_min}, {self.lat_max}], "
                f"lon [{self.lon_min}, {self.lon_max}]."
            )

        return best_node

    def check_point_navigable(self, waypoint: Waypoint) -> Tuple[bool, Optional[str]]:
        """
        Returns (is_navigable, reason_string).
        Used by the API validation layer before routing to give clear error messages.
        """
        if self._is_land(waypoint.lat, waypoint.lon):
            if self._region in ("weddell", "antarctic"):
                return False, unsupported_region_reason(waypoint.lat, waypoint.lon)
            return False, (
                f"Coordinate ({waypoint.lat:.4f}, {waypoint.lon:.4f}) falls on land or "
                "an ice shelf and cannot be used as a route endpoint."
            )
        try:
            self.find_nearest_node(waypoint)
            return True, None
        except ValueError as e:
            return False, str(e)

    def update_risk_scores(self, new_risk_engine: ProbabilisticRiskEngine) -> None:
        """Updates node risk values across the graph when risk engine predictions change."""
        self.risk_engine = new_risk_engine
        for node in self.nodes:
            self.node_risk[node] = self.risk_engine.calculate_total_risk(node[0], node[1])

    def compute_time_aware_node_risk(
        self, start_point: Waypoint, cruise_speed_knots: float
    ) -> Dict[Tuple[float, float], float]:
        """
        Time-aware risk snapshot: same nodes as `node_risk`, but each node's risk
        is evaluated at that node's estimated arrival time (risk_engine.py's
        calculate_total_risk(lat, lon, time_offset_hours)) instead of the static
        worst-case-ever forecast envelope `node_risk` uses (see
        routing_engine.py's module docstring for why the search itself is
        normally time-independent).

        Bounded, honest approximation — NOT the actual path-dependent arrival
        time (which depends on which path reaches the node, and isn't known
        until a path is chosen): ETA is the straight-line great-circle distance
        from the mission's start point at constant cruise speed, the same
        distance/speed -> time conversion metrics.py already uses for real
        waypoint ETAs, applied directly to every node instead of along a found
        path. One extra full-grid risk pass (same order of cost as building the
        graph once) — no per-edge time lookups, no time-expanded graph.
        Returned as a new dict; does not mutate `self.node_risk`.
        """
        if not self.risk_engine:
            return dict(self.node_risk)
        result: Dict[Tuple[float, float], float] = {}
        for node in self.nodes:
            if cruise_speed_knots > 0:
                dist_nm = haversine_distance_nm(start_point.lat, start_point.lon, node[0], node[1])
                eta_hours = dist_nm / cruise_speed_knots
            else:
                eta_hours = 0.0
            result[node] = self.risk_engine.calculate_total_risk(node[0], node[1], time_offset_hours=eta_hours)
        return result
