# ICEWISE Module Integration Guide

**Module Lead:** Niharika (Technical Risk Assessment & Route Optimization Lead)  
**Target Roles:**
- **Tanusha (Iceberg Trajectory Prediction Lead)**: Input schema specification
- **Saiesha (UI & System Integration Lead)**: Output schema & consumption specification

---

## 1. Input Schema (Tanusha $\longrightarrow$ Risk/Routing Engine)

Tanusha's ML module provides predicted iceberg positions, forecast trajectories, spatial uncertainty, and confidence scores as a JSON array of objects.

### JSON Input Format: `List[IcebergPrediction]`

```json
[
  {
    "iceberg_id": "ICE-2026-001",
    "current_position": {
      "lat": -76.2,
      "lon": 165.8,
      "time_offset_hours": 0.0
    },
    "predicted_positions": [
      { "lat": -76.20, "lon": 165.80, "time_offset_hours": 0.0 },
      { "lat": -76.25, "lon": 165.85, "time_offset_hours": 6.0 },
      { "lat": -76.30, "lon": 165.90, "time_offset_hours": 12.0 },
      { "lat": -76.40, "lon": 166.00, "time_offset_hours": 24.0 }
    ],
    "spatial_uncertainty_km": 4.5,
    "confidence_score": 0.92,
    "drift_velocity_knots": 1.2,
    "drift_bearing_deg": 155.0,
    "size_category": "Large (45-75m height)"
  }
]
```

#### Field Specifications:
- `iceberg_id` (*str*, required): Unique tracking identifier.
- `current_position` (*Waypoint dict*, required): `{"lat": float, "lon": float, "time_offset_hours": 0.0}`.
- `predicted_positions` (*List[Waypoint dict]*, required): List of future forecasted points `(lat, lon, time_offset_hours)`.
- `spatial_uncertainty_km` (*float*, required): Standard deviation $\sigma$ in km representing 2D Gaussian uncertainty spread.
- `confidence_score` (*float*, required): Model prediction confidence between `0.0` and `1.0`.
- `drift_velocity_knots` (*float*, optional): Drift speed in knots.
- `drift_bearing_deg` (*float*, optional): Drift direction in degrees (0-360°).
- `size_category` (*str*, optional): Iceberg size classification string.

---

## 2. Output Schema (Routing Engine $\longrightarrow$ Saiesha's Integration/UI)

The routing module produces a complete, JSON-serializable dictionary object containing recommended waypoints, route coordinates, voyage metrics, and recalculation status.

### JSON Output Format: `NavigationRouteResult`

```json
{
  "route_id": "ROUTE-6B0A35CC",
  "vessel_id": "VESSEL-R/V-NATHANIEL-PALMER",
  "algorithm_used": "A*",
  "recalculated": false,
  "waypoints": [
    { "lat": -75.02, "lon": 165.00, "time_offset_hours": 0.0 },
    { "lat": -75.10, "lon": 165.08, "time_offset_hours": 0.43 },
    { "lat": -77.50, "lon": 166.52, "time_offset_hours": 13.33 }
  ],
  "metrics": {
    "total_distance_nm": 153.32,
    "total_distance_km": 283.94,
    "estimated_time_hours": 13.33,
    "estimated_fuel_tons": 7.78,
    "estimated_fuel_cost_usd": 6610.35,
    "mean_risk_score": 0.0707,
    "max_risk_score": 0.2000,
    "safety_index": 92.9,
    "waypoint_count": 34
  },
  "notes": [
    "Algorithm used: A*",
    "Grid resolution: 0.08° (~8.9 km)",
    "Icebergs evaluated: 3",
    "Prototype Assumptions: Constant vessel cruising speed; linear fuel burn model; 2D Gaussian drift uncertainty."
  ]
}
```

#### Key Output Metrics:
- `waypoints`: Complete list of recommended route node coordinates with assigned cumulative ETA timestamps.
- `metrics.total_distance_nm` & `total_distance_km`: Great Circle route length.
- `metrics.estimated_time_hours`: Total transit ETA based on vessel cruising speed.
- `metrics.estimated_fuel_tons` & `estimated_fuel_cost_usd`: Estimated fuel burn and benchmark cost in USD.
- `metrics.mean_risk_score` & `max_risk_score`: Probabilistic risk encountered along the route.
- `metrics.safety_index`: Safety score normalized between 0 and 100.
- `recalculated`: `true` if this route is a dynamic update triggered by fresh prediction inputs.

---

## 3. Minimal Code Example

```python
import json
from icewise.pipeline import run_navigation_pipeline_from_dict

# 1. Tanusha's ML output payload
predictions_list = [
  {
    "iceberg_id": "ICE-2026-001",
    "current_position": {"lat": -76.2, "lon": 165.8},
    "predicted_positions": [{"lat": -76.2, "lon": 165.8}],
    "spatial_uncertainty_km": 4.5,
    "confidence_score": 0.92
  }
]

# 2. Vessel profile payload
vessel_dict = {
  "vessel_id": "VESSEL-PALMER",
  "start_point": {"lat": -75.0, "lon": 165.0},
  "destination": {"lat": -77.5, "lon": 166.5},
  "cruise_speed_knots": 11.5,
  "fuel_consumption_rate_tons_per_day": 14.0
}

# 3. Execute pipeline & get JSON output dict
route_json_dict = run_navigation_pipeline_from_dict(
    vessel_dict=vessel_dict,
    iceberg_predictions_dicts=predictions_list,
    algorithm="A*"
)

# Convert to JSON string for REST response
json_payload = json.dumps(route_json_dict)
```
