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
  // Present once Niharika's routing engine computes a comparison against the
  // unconstrained shortest-path baseline (icewise/metrics.py ->
  // calculate_route_comparison). Absent — not zero — until then.
  relative_fuel_consumption_pct?: number;
  fuel_change_pct?: number;
  risk_reduction_pct?: number;
};

// Mirrors the real `comparison` object attached to NavigationRouteResult.to_dict()
// when the routing engine computes a route against its own baseline
// (backend/routing/icewise/metrics.py -> calculate_route_comparison).
export type RouteComparison = {
  baseline_route_id: string;
  baseline_distance_nm: number;
  baseline_estimated_time_hours: number;
  baseline_estimated_fuel_tons: number;
  baseline_mean_risk_score: number;
  route_distance_nm: number;
  route_estimated_time_hours: number;
  route_estimated_fuel_tons: number;
  route_mean_risk_score: number;
  relative_fuel_consumption_pct: number;
  fuel_change_pct: number;
  risk_reduction_pct: number;
  assumption: string;
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

// Mirrors one entry of the real, additive `route_options` array returned by
// POST /api/route (backend/routing/main.py -> _build_route_options). Each is
// a full, independently-computed NavigationEngine.compute_route() result at
// a different real risk_tolerance_factor — same A*/Dijkstra search, same
// risk engine, same cost function; only that one vessel parameter differs.
export type RouteOption = {
  route_id: string;
  label: string;
  risk_tolerance_factor: number;
  waypoints: RouteWaypoint[];
  metrics: RouteMetrics;
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
  comparison?: RouteComparison;
  // Only present on the initial POST /api/route response, not on
  // /api/route/recalculate.
  route_options?: RouteOption[];
};

// The map's real, currently-available layers — deliberately excludes any
// layer ICEWISE has no real data for yet (risk zones, alternative routes).
// See LayerControls.tsx.
export type LayerId = "icebergs" | "trajectories" | "initialRoute" | "adaptiveRoute" | "seaIce";
export type LayerVisibility = Record<LayerId, boolean>;

// Mirrors GET /api/sea-ice/geojson (backend/routing/icewise/sea_ice_api.py) —
// a real NSIDC NOAA Sea Ice Index v4.0 grid, historical (2020-01-02), not a
// live feed. Coordinates are [lon, lat] as GeoJSON requires.
export type SeaIceFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    ice_concentration: number;
    timestamp: string;
    source: string;
  };
};

export type SeaIceGeoJSON = {
  type: "FeatureCollection";
  metadata: {
    source: string;
    dataset_id: string;
    timestamp: string;
    region: string;
    grid_resolution_km: number;
    cell_count: number;
  };
  features: SeaIceFeature[];
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
