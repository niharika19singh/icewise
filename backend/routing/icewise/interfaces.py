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

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "IcebergPrediction":
        curr_pos = Waypoint.from_dict(data["current_position"]) if isinstance(data["current_position"], dict) else data["current_position"]
        pred_positions = [Waypoint.from_dict(p) if isinstance(p, dict) else p for p in data.get("predicted_positions", [])]
        size_cat = data.get("size_category", IcebergSizeCategory.MEDIUM)
        if isinstance(size_cat, str):
            try:
                size_cat = IcebergSizeCategory(size_cat)
            except ValueError:
                # Match partial string if needed
                matched = False
                for cat in IcebergSizeCategory:
                    if cat.value == size_cat or cat.name == size_cat:
                        size_cat = cat
                        matched = True
                        break
                if not matched:
                    size_cat = IcebergSizeCategory.MEDIUM

        return cls(
            iceberg_id=data["iceberg_id"],
            current_position=curr_pos,
            predicted_positions=pred_positions,
            spatial_uncertainty_km=float(data["spatial_uncertainty_km"]),
            confidence_score=float(data["confidence_score"]),
            drift_velocity_knots=float(data.get("drift_velocity_knots", 0.0)),
            drift_bearing_deg=float(data.get("drift_bearing_deg", 0.0)),
            size_category=size_cat,
        )


@dataclass
class EnvironmentalData:
    """Environmental condition layers (Sea Ice Concentration, Bathymetry, Weather)."""
    # Map of (lat, lon) -> ice concentration fraction (0.0 = open water, 1.0 = 100% ice)
    ice_concentration_map: Dict[Tuple[float, float], float] = field(default_factory=dict)
    default_ice_concentration: float = 0.05
    weather_risk_factor: float = 1.0  # 1.0 = normal/calm sea state, >1.0 = storm/poor visibility penalty

    def to_dict(self) -> Dict[str, Any]:
        return {
            "ice_concentration_map": {f"{k[0]},{k[1]}": v for k, v in self.ice_concentration_map.items()},
            "default_ice_concentration": self.default_ice_concentration,
            "weather_risk_factor": self.weather_risk_factor,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "EnvironmentalData":
        ice_map = {}
        raw_map = data.get("ice_concentration_map", {})
        for k, v in raw_map.items():
            if isinstance(k, str):
                parts = [float(p) for p in k.strip("()[] ").split(",")]
                key_tuple = (parts[0], parts[1])
            else:
                key_tuple = (float(k[0]), float(k[1]))
            ice_map[key_tuple] = float(v)

        return cls(
            ice_concentration_map=ice_map,
            default_ice_concentration=float(data.get("default_ice_concentration", 0.05)),
            weather_risk_factor=float(data.get("weather_risk_factor", 1.0)),
        )


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

    def to_dict(self) -> Dict[str, Any]:
        return {
            "vessel_id": self.vessel_id,
            "vessel_name": self.vessel_name,
            "start_point": self.start_point.to_dict(),
            "destination": self.destination.to_dict(),
            "cruise_speed_knots": self.cruise_speed_knots,
            "fuel_consumption_rate_tons_per_day": self.fuel_consumption_rate_tons_per_day,
            "risk_tolerance_factor": self.risk_tolerance_factor,
            "max_risk_threshold": self.max_risk_threshold,
            "ice_class": self.ice_class,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "VesselProfile":
        start_pt = Waypoint.from_dict(data["start_point"]) if isinstance(data["start_point"], dict) else data["start_point"]
        dest_pt = Waypoint.from_dict(data["destination"]) if isinstance(data["destination"], dict) else data["destination"]

        return cls(
            vessel_id=data["vessel_id"],
            vessel_name=data.get("vessel_name", data["vessel_id"]),
            start_point=start_pt,
            destination=dest_pt,
            cruise_speed_knots=float(data.get("cruise_speed_knots", 12.0)),
            fuel_consumption_rate_tons_per_day=float(data.get("fuel_consumption_rate_tons_per_day", 15.0)),
            risk_tolerance_factor=float(data.get("risk_tolerance_factor", 2.5)),
            max_risk_threshold=float(data.get("max_risk_threshold", 0.70)),
            ice_class=data.get("ice_class", "POLAR_CLASS_6"),
        )


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
