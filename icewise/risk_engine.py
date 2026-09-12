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

    def calculate_iceberg_collision_risk(self, lat: float, lon: float) -> float:
        """
        Calculates the combined spatial probability of iceberg collision at (lat, lon).
        Uses a Gaussian probability density spread scaled by spatial uncertainty σ and model confidence:
        P_i(x,y) = confidence * exp(-d^2 / (2 * σ^2))
        Evaluates risk across both current and predicted future iceberg trajectory points.
        """
        if not self.iceberg_predictions:
            return 0.0

        non_collision_prob = 1.0  # Product of (1 - P_i) for independent risk combination

        for berg in self.iceberg_predictions:
            sigma = max(0.5, berg.spatial_uncertainty_km)  # Minimum 0.5 km radius buffer
            confidence = max(0.1, min(1.0, berg.confidence_score))

            # Evaluate distance to current and all forecast positions
            all_positions = [berg.current_position] + berg.predicted_positions
            max_berg_risk = 0.0

            for pos in all_positions:
                dist_km = haversine_distance_km(lat, lon, pos.lat, pos.lon)
                # Gaussian decay based on uncertainty sigma
                risk_component = confidence * math.exp(-(dist_km ** 2) / (2.0 * (sigma ** 2)))
                if risk_component > max_berg_risk:
                    max_berg_risk = risk_component

            # Combine risk using independent union formula: 1 - (1 - P1)(1 - P2)...
            non_collision_prob *= (1.0 - max_berg_risk)

        combined_iceberg_risk = 1.0 - non_collision_prob
        return min(1.0, max(0.0, combined_iceberg_risk))

    def get_sea_ice_concentration(self, lat: float, lon: float) -> float:
        """
        Retrieves or interpolates sea-ice concentration fraction (0.0 to 1.0) at (lat, lon).
        """
        if not self.environmental_data or not self.environmental_data.ice_concentration_map:
            return self.environmental_data.default_ice_concentration if self.environmental_data else 0.05

        # Nearest neighbor lookup on grid
        grid_key = (round(lat, 2), round(lon, 2))
        if grid_key in self.environmental_data.ice_concentration_map:
            return self.environmental_data.ice_concentration_map[grid_key]

        # Fallback to default
        return self.environmental_data.default_ice_concentration

    def calculate_total_risk(self, lat: float, lon: float) -> float:
        """
        Calculates the total navigation risk score R(lat, lon) in range [0.0, 1.0].
        Combines iceberg collision probability density and sea ice concentration risk.
        """
        r_berg = self.calculate_iceberg_collision_risk(lat, lon)
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
