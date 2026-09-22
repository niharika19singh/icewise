"""
Probabilistic Risk Assessment Engine for ICEWISE Navigation Decision Support.
Converts predicted iceberg positions, spatial uncertainty, confidence scores,
and sea-ice environmental conditions into a continuous spatial risk field.
"""

import math
from typing import List, Tuple, Dict, Optional
from icewise.interfaces import IcebergPrediction, EnvironmentalData, Waypoint


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculates the Great Circle / Haversine distance between two coordinates in kilometers.
    """
    R_EARTH_KM = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R_EARTH_KM * c


def haversine_distance_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculates the Great Circle distance in Nautical Miles (1 NM = 1.852 km).
    """
    return haversine_distance_km(lat1, lon1, lat2, lon2) / 1.852


class ProbabilisticRiskEngine:
    """
    Evaluates probabilistic navigation risk across geospatial coordinates.
    Computes spatial Gaussian probability fields for icebergs based on predicted positions
    and uncertainty, combined with sea-ice concentration layer.
    """

    def __init__(self,
                 iceberg_predictions: List[IcebergPrediction],
                 environmental_data: Optional[EnvironmentalData] = None,
                 sea_ice_risk_weight: float = 0.5):
        """
        :param iceberg_predictions: List of iceberg predictions from Tanusha's ML module.
        :param environmental_data: Environmental layers (sea ice concentration, weather).
        :param sea_ice_risk_weight: Weight of sea-ice concentration in total risk score.
        """
        self.iceberg_predictions = iceberg_predictions
        self.environmental_data = environmental_data or EnvironmentalData()
        self.sea_ice_risk_weight = sea_ice_risk_weight

    def _interpolate_position_at_time(self, berg: IcebergPrediction, t_hours: float) -> Waypoint:
        """
        Interpolates predicted iceberg position at time t_hours along forecast trajectory points.
        """
        positions = [berg.current_position] + berg.predicted_positions
        if not positions:
            return berg.current_position

        if t_hours <= positions[0].time_offset_hours:
            return positions[0]
        if t_hours >= positions[-1].time_offset_hours:
            return positions[-1]

        for i in range(len(positions) - 1):
            p1 = positions[i]
            p2 = positions[i + 1]
            if p1.time_offset_hours <= t_hours <= p2.time_offset_hours:
                dt = p2.time_offset_hours - p1.time_offset_hours
                if dt <= 1e-6:
                    return p1
                fraction = (t_hours - p1.time_offset_hours) / dt
                interp_lat = p1.lat + fraction * (p2.lat - p1.lat)
                interp_lon = p1.lon + fraction * (p2.lon - p1.lon)
                return Waypoint(lat=interp_lat, lon=interp_lon, time_offset_hours=t_hours)

        return positions[-1]

    def calculate_iceberg_collision_risk(self,
                                         lat: float,
                                         lon: float,
                                         time_offset_hours: Optional[float] = None) -> float:
        """
        Calculates the combined spatial probability of iceberg collision at (lat, lon).
        Uses Gaussian probability density spread scaled by spatial uncertainty σ and model confidence:
        P_i(x,y) = confidence * exp(-d^2 / (2 * σ^2))

        If time_offset_hours is provided, evaluates iceberg position and uncertainty at that specific future time.
        Otherwise, evaluates the spatial risk envelope over all forecast positions.
        """
        if not self.iceberg_predictions:
            return 0.0

        non_collision_prob = 1.0  # Product of (1 - P_i) for independent risk combination

        for berg in self.iceberg_predictions:
            confidence = max(0.1, min(1.0, berg.confidence_score))

            if time_offset_hours is not None:
                # Time-aware evaluation: position & expanding uncertainty σ(t) = σ_0 + 0.05*t
                pos = self._interpolate_position_at_time(berg, time_offset_hours)
                sigma = max(0.5, berg.spatial_uncertainty_km + 0.05 * time_offset_hours)
                dist_km = haversine_distance_km(lat, lon, pos.lat, pos.lon)
                max_berg_risk = confidence * math.exp(-(dist_km ** 2) / (2.0 * (sigma ** 2)))
            else:
                # Spatial risk envelope across all forecast positions
                sigma = max(0.5, berg.spatial_uncertainty_km)
                all_positions = [berg.current_position] + berg.predicted_positions
                max_berg_risk = 0.0

                for pos in all_positions:
                    dist_km = haversine_distance_km(lat, lon, pos.lat, pos.lon)
                    risk_component = confidence * math.exp(-(dist_km ** 2) / (2.0 * (sigma ** 2)))
                    if risk_component > max_berg_risk:
                        max_berg_risk = risk_component

            non_collision_prob *= (1.0 - max_berg_risk)

        combined_iceberg_risk = 1.0 - non_collision_prob
        return min(1.0, max(0.0, combined_iceberg_risk))

    # A real observation is only used if it lies within this many degrees (planar)
    # of the query point. Beyond it the uniform default concentration applies —
    # the engine never extrapolates or interpolates sea ice past real cells.
    _ICE_NEIGHBOUR_RADIUS_DEG = 0.2

    def _ice_index(self) -> Dict[Tuple[int, int], List[Tuple[float, float, float]]]:
        """Lazy spatial hash of the observed cells, so lookups do not scan every cell."""
        cells = self.environmental_data.ice_concentration_map
        cached = getattr(self, "_ice_index_cache", None)
        if cached is None or cached[0] != len(cells):
            size = self._ICE_NEIGHBOUR_RADIUS_DEG
            index: Dict[Tuple[int, int], List[Tuple[float, float, float]]] = {}
            for (k_lat, k_lon), conc in cells.items():
                index.setdefault((math.floor(k_lat / size), math.floor(k_lon / size)), []).append((k_lat, k_lon, conc))
            cached = (len(cells), index)
            self._ice_index_cache = cached
        return cached[1]

    def sea_ice_observation_at(self, lat: float, lon: float) -> Optional[float]:
        """
        Real observed sea-ice concentration at, or within 0.2° of, (lat, lon);
        None when there is no real observation nearby (the caller then falls back
        to the default concentration). This is the single place that decides
        whether a value is observed or defaulted, so callers can report coverage
        truthfully.
        """
        if not self.environmental_data or not self.environmental_data.ice_concentration_map:
            return None

        # 1. Direct or rounded key lookup
        grid_key = (round(lat, 2), round(lon, 2))
        if grid_key in self.environmental_data.ice_concentration_map:
            return self.environmental_data.ice_concentration_map[grid_key]

        # 2. Nearest observed cell within the radius (same rule as before, via a spatial hash)
        size = self._ICE_NEIGHBOUR_RADIUS_DEG
        index = self._ice_index()
        cx, cy = math.floor(lat / size), math.floor(lon / size)
        best_dist_sq = size * size
        best_val = None
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for k_lat, k_lon, conc in index.get((cx + dx, cy + dy), ()):
                    dist_sq = (lat - k_lat) ** 2 + (lon - k_lon) ** 2
                    if dist_sq < best_dist_sq:
                        best_dist_sq = dist_sq
                        best_val = conc
        return best_val

    def get_sea_ice_concentration(self, lat: float, lon: float) -> float:
        """
        Sea-ice concentration fraction (0.0 to 1.0) at (lat, lon): the real observed
        value where one exists nearby, otherwise the uniform default concentration.
        """
        observed = self.sea_ice_observation_at(lat, lon)
        if observed is not None:
            return observed
        return self.environmental_data.default_ice_concentration if self.environmental_data else 0.05

    def calculate_total_risk(self,
                             lat: float,
                             lon: float,
                             time_offset_hours: Optional[float] = None) -> float:
        """
        Calculates the total navigation risk score R(lat, lon, t) in range [0.0, 1.0].
        Combines iceberg collision probability density and sea ice concentration risk.
        """
        r_berg = self.calculate_iceberg_collision_risk(lat, lon, time_offset_hours)
        r_ice = self.get_sea_ice_concentration(lat, lon)
        weather_factor = self.environmental_data.weather_risk_factor if self.environmental_data else 1.0

        # Independent probabilistic union: R_total = 1 - (1 - R_berg) * (1 - w_ice * R_ice)
        effective_ice_risk = min(1.0, self.sea_ice_risk_weight * r_ice)
        total_risk = 1.0 - (1.0 - r_berg) * (1.0 - effective_ice_risk)

        # Apply weather factor scaling
        total_risk = min(1.0, total_risk * weather_factor)
        return min(1.0, max(0.0, total_risk))

    def compute_risk_grid(self,
                          lat_min: float, lat_max: float,
                          lon_min: float, lon_max: float,
                          step_deg: float = 0.1) -> Dict[Tuple[float, float], float]:
        """
        Computes risk map dictionary mapping (lat, lon) grid points to total risk scores.
        """
        risk_map = {}
        curr_lat = lat_min
        while curr_lat <= lat_max + 1e-6:
            curr_lon = lon_min
            while curr_lon <= lon_max + 1e-6:
                lat_r = round(curr_lat, 4)
                lon_r = round(curr_lon, 4)
                risk_map[(lat_r, lon_r)] = self.calculate_total_risk(lat_r, lon_r)
                curr_lon += step_deg
            curr_lat += step_deg
        return risk_map
