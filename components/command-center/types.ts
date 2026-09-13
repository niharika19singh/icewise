// Mirrors the real JSON shape returned by the ICEWISE routing API
// (backend/routing/main.py -> NavigationRouteResult.to_dict() + icebergs).

export type RouteWaypoint = {
  lat: number;
  lon: number;
  time_offset_hours: number;
};

export type RouteMetrics = {
  total_distance_nm: number;
  total_distance_km: number;
  estimated_time_hours: number;
  estimated_fuel_tons: number;
  estimated_fuel_cost_usd: number;
  mean_risk_score: number;
  max_risk_score: number;
  safety_index: number;
  waypoint_count: number;
};

export type IcebergPrediction = {
  iceberg_id: string;
  current_position: RouteWaypoint;
  predicted_positions: RouteWaypoint[];
  spatial_uncertainty_km: number;
  confidence_score: number;
  drift_velocity_knots: number;
  drift_bearing_deg: number;
  size_category: string;
};

export type RouteResponse = {
  route_id: string;
  vessel_id: string;
  waypoints: RouteWaypoint[];
  metrics: RouteMetrics;
  algorithm_used: string;
  recalculated: boolean;
  notes: string[];
  icebergs: IcebergPrediction[];
};

// Mirrors GET /api/analytics/c18b-validation — a real day-over-day model
// validation computed from Tanusha's c18b_hybrid_results.csv. Only the
// forecast horizon actually present in that file is reported.
export type C18BValidation = {
  iceberg_id: string;
  sample_count: number;
  forecast_horizon_hours: number;
  mean_physics_error_ms: number;
  mean_hybrid_error_ms: number;
  mean_physics_error_km: number;
  mean_hybrid_error_km: number;
  other_horizons_available: boolean;
};
