"""
Interfaces and Data Transfer Objects (DTOs) for ICEWISE Navigation Decision Support System.
Defines the standard contract between Tanusha's Prediction Module, Niharika's Risk & Routing Module,
and Saiesha's UI/Integration Module.
"""

from dataclasses import dataclass, field
from typing import List, Tuple, Dict, Any, Optional
from enum import Enum


class IcebergSizeCategory(str, Enum):
    GROWLER = "Growler (< 1m height)"
    BERGY_BIT = "Bergy Bit (1-5m height)"
    SMALL = "Small (5-15m height)"
    MEDIUM = "Medium (15-45m height)"
    LARGE = "Large (45-75m height)"
    VERY_LARGE = "Very Large (> 75m height)"


@dataclass
class Waypoint:
    """Geospatial coordinate point (latitude, longitude) with optional timestamp offset."""
    lat: float
    lon: float
    time_offset_hours: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "lat": self.lat,
            "lon": self.lon,
            "time_offset_hours": self.time_offset_hours,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Waypoint":
        return cls(
            lat=data["lat"],
            lon=data["lon"],
            time_offset_hours=data.get("time_offset_hours", 0.0),
        )


@dataclass
class IcebergPrediction:
    """
    Standard interface output from Tanusha's Iceberg Trajectory Prediction Module.
    Represents an iceberg's current position, predicted trajectory, spatial uncertainty,
    and confidence.
    """
    iceberg_id: str
    current_position: Waypoint
    predicted_positions: List[Waypoint]  # Future positions over forecast horizon (+6h, +12h, +24h, etc.)
    spatial_uncertainty_km: float  # Standard deviation σ in km representing spatial Gaussian uncertainty spread
    confidence_score: float  # Prediction confidence score between 0.0 and 1.0
    drift_velocity_knots: float = 0.0
    drift_bearing_deg: float = 0.0
    size_category: IcebergSizeCategory = IcebergSizeCategory.MEDIUM

    def to_dict(self) -> Dict[str, Any]:
        return {
            "iceberg_id": self.iceberg_id,
            "current_position": self.current_position.to_dict(),
            "predicted_positions": [p.to_dict() for p in self.predicted_positions],
            "spatial_uncertainty_km": self.spatial_uncertainty_km,
            "confidence_score": self.confidence_score,
            "drift_velocity_knots": self.drift_velocity_knots,
            "drift_bearing_deg": self.drift_bearing_deg,
            "size_category": self.size_category.value if isinstance(self.size_category, Enum) else self.size_category,
        }


@dataclass
class EnvironmentalData:
    """Environmental condition layers (Sea Ice Concentration, Bathymetry, Weather)."""
    # Map of (lat, lon) -> ice concentration fraction (0.0 = open water, 1.0 = 100% ice)
    ice_concentration_map: Dict[Tuple[float, float], float] = field(default_factory=dict)
    default_ice_concentration: float = 0.05
    weather_risk_factor: float = 1.0  # 1.0 = normal/calm sea state, >1.0 = storm/poor visibility penalty


@dataclass
class VesselProfile:
    """Vessel configuration parameters for route optimization."""
    vessel_id: str
    vessel_name: str
    start_point: Waypoint
    destination: Waypoint
    cruise_speed_knots: float = 12.0  # Cruising speed in knots (nautical miles per hour)
    fuel_consumption_rate_tons_per_day: float = 15.0  # Fuel burn in metric tons per 24 hours
    risk_tolerance_factor: float = 2.5  # Weight factor α for risk in path cost function (higher = safer)
    max_risk_threshold: float = 0.70  # Hard risk limit (0.0 to 1.0); cells above this are impassable
    ice_class: str = "POLAR_CLASS_6"  # Polar Class designation


@dataclass
class RouteMetrics:
    """Output metrics for calculated navigation routes."""
    total_distance_nm: float
    total_distance_km: float
    estimated_time_hours: float
    estimated_fuel_tons: float
    estimated_fuel_cost_usd: float  # Benchmark fuel cost estimate in USD
    mean_risk_score: float
    max_risk_score: float
    safety_index: float  # Normalized score 0-100 (higher is safer)
    waypoint_count: int

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_distance_nm": round(self.total_distance_nm, 2),
            "total_distance_km": round(self.total_distance_km, 2),
            "estimated_time_hours": round(self.estimated_time_hours, 2),
            "estimated_fuel_tons": round(self.estimated_fuel_tons, 2),
            "estimated_fuel_cost_usd": round(self.estimated_fuel_cost_usd, 2),
            "mean_risk_score": round(self.mean_risk_score, 4),
            "max_risk_score": round(self.max_risk_score, 4),
            "safety_index": round(self.safety_index, 1),
            "waypoint_count": self.waypoint_count,
        }


@dataclass
class NavigationRouteResult:
    """Complete output object returned by the Route Engine for UI/Integration consumption."""
    route_id: str
    vessel_id: str
    waypoints: List[Waypoint]
    metrics: RouteMetrics
    algorithm_used: str  # "A*" or "Dijkstra"
    recalculated: bool = False
    notes: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "route_id": self.route_id,
            "vessel_id": self.vessel_id,
            "waypoints": [w.to_dict() for w in self.waypoints],
            "metrics": self.metrics.to_dict(),
            "algorithm_used": self.algorithm_used,
            "recalculated": self.recalculated,
            "notes": self.notes,
        }
