"""
Voyage Route Metrics Calculator for ICEWISE Navigation Decision Support System.
Evaluates physical distance, ETA, fuel burn, and risk statistics along calculated routes.
"""

from typing import List, Tuple
from icewise.interfaces import Waypoint, VesselProfile, RouteMetrics
from icewise.risk_engine import haversine_distance_nm, ProbabilisticRiskEngine


def calculate_route_metrics(path: List[Tuple[float, float]],
                            vessel: VesselProfile,
                            risk_engine: ProbabilisticRiskEngine) -> Tuple[RouteMetrics, List[Waypoint]]:
    """
    Computes distance, transit time, fuel consumption, and risk statistics for a path of (lat, lon) coordinates.
    Returns RouteMetrics and list of Waypoint objects with assigned cumulative ETA timestamps.
    """
    if not path:
        raise ValueError("Cannot calculate metrics for empty path")

    total_distance_nm = 0.0
    waypoints: List[Waypoint] = []

    # Initialize start waypoint at t = 0.0 hrs
    start_wp = Waypoint(lat=path[0][0], lon=path[0][1], time_offset_hours=0.0)
    waypoints.append(start_wp)

    cumulative_time_hrs = 0.0

    for i in range(1, len(path)):
        lat1, lon1 = path[i - 1]
        lat2, lon2 = path[i]
        dist_step_nm = haversine_distance_nm(lat1, lon1, lat2, lon2)
        total_distance_nm += dist_step_nm

        # Time step (hours) = distance (NM) / speed (knots)
        time_step_hrs = dist_step_nm / vessel.cruise_speed_knots if vessel.cruise_speed_knots > 0 else 0.0
        cumulative_time_hrs += time_step_hrs

        wp = Waypoint(lat=lat2, lon=lon2, time_offset_hours=round(cumulative_time_hrs, 2))
        waypoints.append(wp)

    total_distance_km = total_distance_nm * 1.852

    # Estimated transit time, fuel burn (tons), and estimated fuel cost
    estimated_time_hours = cumulative_time_hrs
    transit_days = estimated_time_hours / 24.0
    estimated_fuel_tons = transit_days * vessel.fuel_consumption_rate_tons_per_day
    # Benchmark MGO (Marine Gas Oil) price ~$850 / Metric Ton
    estimated_fuel_cost_usd = estimated_fuel_tons * 850.0

    # Risk statistics along path
    path_risks = [risk_engine.calculate_total_risk(lat, lon) for lat, lon in path]
    mean_risk = sum(path_risks) / len(path_risks) if path_risks else 0.0
    max_risk = max(path_risks) if path_risks else 0.0
    safety_index = max(0.0, min(100.0, 100.0 * (1.0 - mean_risk)))

    metrics = RouteMetrics(
        total_distance_nm=total_distance_nm,
        total_distance_km=total_distance_km,
        estimated_time_hours=estimated_time_hours,
        estimated_fuel_tons=estimated_fuel_tons,
        estimated_fuel_cost_usd=estimated_fuel_cost_usd,
        mean_risk_score=mean_risk,
        max_risk_score=max_risk,
        safety_index=safety_index,
        waypoint_count=len(waypoints),
    )

    return metrics, waypoints
