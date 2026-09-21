"""
Voyage Route Metrics Calculator for ICEWISE Navigation Decision Support System.
Evaluates physical distance, ETA, fuel burn, and risk statistics along calculated routes.
"""

from typing import List, Tuple, Dict, Any, Optional
from icewise.interfaces import Waypoint, VesselProfile, RouteMetrics, NavigationRouteResult
from icewise.risk_engine import haversine_distance_nm, ProbabilisticRiskEngine


def calculate_route_metrics(path: List[Tuple[float, float]],
                            vessel: VesselProfile,
                            risk_engine: ProbabilisticRiskEngine) -> Tuple[RouteMetrics, List[Waypoint]]:
    """
    Computes distance, transit time, fuel consumption, and risk statistics for a path
    of (lat, lon) coordinates.

    Risk is evaluated **temporally**: each waypoint's risk score uses its cumulative
    ETA (time_offset_hours) as the time offset, so the risk engine interpolates the
    iceberg to its predicted position at the moment the vessel actually arrives at that
    cell — not the t=0 snapshot.

    Returns RouteMetrics and list of Waypoint objects with assigned cumulative ETA.
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

    # Temporal risk statistics: evaluate each waypoint at its arrival time.
    # This uses the risk engine's time-aware iceberg interpolation so that
    # risk reflects where icebergs will actually be when the vessel arrives —
    # not where they are right now.
    path_risks = [
        risk_engine.calculate_total_risk(wp.lat, wp.lon, time_offset_hours=wp.time_offset_hours)
        for wp in waypoints
    ]
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


def calculate_route_comparison(
    route: NavigationRouteResult,
    baseline_route: NavigationRouteResult
) -> Dict[str, Any]:
    """
    Calculates fuel consumption and risk reduction comparison metrics between a target route
    and a baseline route (e.g. shortest / direct path).

    Prototype Assumption:
    - Fuel consumption is strictly proportional to route transit distance at constant vessel cruising speed.
    - Fuel burn is NOT inferred from risk score.

    Calculates:
    - total distance (NM / km)
    - risk score (mean & max)
    - estimated travel time (hours)
    - relative fuel consumption (%)
    - fuel increase/decrease (%) vs baseline route
    - risk reduction (%) vs baseline route
    """
    route_dist = route.metrics.total_distance_nm
    base_dist = baseline_route.metrics.total_distance_nm

    route_fuel = route.metrics.estimated_fuel_tons
    base_fuel = baseline_route.metrics.estimated_fuel_tons

    route_time = route.metrics.estimated_time_hours
    base_time = baseline_route.metrics.estimated_time_hours

    route_risk = route.metrics.mean_risk_score
    base_risk = baseline_route.metrics.mean_risk_score

    # Relative fuel consumption (% of baseline)
    if base_fuel > 0:
        rel_fuel_pct = (route_fuel / base_fuel) * 100.0
    elif base_dist > 0:
        rel_fuel_pct = (route_dist / base_dist) * 100.0
    else:
        rel_fuel_pct = 100.0

    fuel_change_pct = rel_fuel_pct - 100.0

    # Risk reduction (% relative to baseline risk)
    if base_risk > 1e-6:
        risk_reduction_pct = ((base_risk - route_risk) / base_risk) * 100.0
    else:
        risk_reduction_pct = 0.0

    rel_fuel_pct = round(rel_fuel_pct, 2)
    fuel_change_pct = round(fuel_change_pct, 2)
    risk_reduction_pct = round(risk_reduction_pct, 2)

    # Attach comparison metrics directly to target route metrics DTO
    route.metrics.relative_fuel_consumption_pct = rel_fuel_pct
    route.metrics.fuel_change_pct = fuel_change_pct
    route.metrics.risk_reduction_pct = risk_reduction_pct

    # Attach baseline metrics for reference if baseline is self
    if baseline_route.route_id == route.route_id:
        baseline_route.metrics.relative_fuel_consumption_pct = 100.0
        baseline_route.metrics.fuel_change_pct = 0.0
        baseline_route.metrics.risk_reduction_pct = 0.0

    comparison_dict = {
        "baseline_route_id": baseline_route.route_id,
        "baseline_distance_nm": round(base_dist, 2),
        "baseline_estimated_time_hours": round(base_time, 2),
        "baseline_estimated_fuel_tons": round(base_fuel, 2),
        "baseline_mean_risk_score": round(base_risk, 4),
        "route_distance_nm": round(route_dist, 2),
        "route_estimated_time_hours": round(route_time, 2),
        "route_estimated_fuel_tons": round(route_fuel, 2),
        "route_mean_risk_score": round(route_risk, 4),
        "relative_fuel_consumption_pct": rel_fuel_pct,
        "fuel_change_pct": fuel_change_pct,
        "risk_reduction_pct": risk_reduction_pct,
        "assumption": "Fuel consumption calculated proportional to route transit distance at constant vessel speed.",
    }

    route.comparison = comparison_dict
    return comparison_dict
