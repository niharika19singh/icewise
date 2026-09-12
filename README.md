# ICEWISE - Antarctic Sea-Ice, Iceberg Trajectory & Navigation Decision Support (SIH 2026 - SIH26059)

## Technical Risk Assessment & Route Optimization Module

**Module Lead:** Niharika (Risk + Dijkstra/Route Optimization Lead)  
**Branch:** `feature/niharika-routing`

---

## Overview

This module provides the core risk assessment and pathfinding engine for ICEWISE. It consumes predicted iceberg trajectories and spatial uncertainties from Tanusha's ML prediction module, evaluates a continuous spatial probabilistic risk field (combining Gaussian iceberg spread and sea-ice concentration), constructs an 8-connected geospatial grid graph, and calculates optimal, risk-aware navigation routes using **A*** and **Dijkstra** search.

### Core Pipeline Flow
$$\text{Tanusha's ML Predictions} \longrightarrow \text{Probabilistic Risk Engine} \longrightarrow \text{Geospatial Grid Graph} \longrightarrow \text{A* / Dijkstra Optimizer} \longrightarrow \text{Voyage Metrics & JSON DTO}$$

---

## Directory Structure

```
icewise/
├── README.md                   # Technical documentation
├── requirements.txt            # Package dependencies
├── run_demo.py                 # Runnable end-to-end prototype demo script
├── icewise/
│   ├── __init__.py
│   ├── interfaces.py           # Dataclass & JSON DTO models for ML predictions, vessel, & metrics
│   ├── sample_data.py          # Realistic Ross Sea sample prediction data for parallel development
│   ├── risk_engine.py          # Probabilistic iceberg collision risk & sea-ice concentration engine
│   ├── grid_graph.py           # Geospatial 8-neighbor grid graph & land mask builder
│   ├── routing_engine.py       # A* and Dijkstra route pathfinders with risk cost function
│   ├── metrics.py              # Distance (NM/km), ETA (hours), fuel (tons), and risk statistics
│   └── pipeline.py             # NavigationEngine orchestrator & dynamic recalculation API
└── tests/
    ├── test_interfaces.py      # DTO serialization & schema tests
    ├── test_risk_engine.py     # Probabilistic Gaussian decay & distance attenuation tests
    ├── test_grid_graph.py      # Grid connectivity & land masking tests
    ├── test_routing_engine.py  # A* vs Dijkstra equivalency & risk avoidance tests
    └── test_pipeline.py       # End-to-end navigation & recalculation tests
```

---

## Quick Start & Usage

### 1. Running the Prototype Demo
```bash
python3 run_demo.py
```

### 2. Running Unit & Integration Tests
```bash
python3 -m pytest tests/
```

### 3. API Integration for Saiesha (UI Lead)
```python
from icewise import NavigationEngine, VesselProfile, Waypoint
from icewise.sample_data import get_sample_iceberg_predictions, get_sample_vessel_profile

# 1. Initialize vessel profile & predictions
vessel = get_sample_vessel_profile()
iceberg_preds = get_sample_iceberg_predictions()

# 2. Instantiate engine
engine = NavigationEngine(vessel=vessel, iceberg_predictions=iceberg_preds)

# 3. Compute optimal route
result = engine.compute_route(algorithm="A*")
print(result.to_dict())

# 4. Dynamic recalculation when fresh predictions arrive from Tanusha's module
updated_result = engine.update_predictions_and_recalculate(new_iceberg_predictions=new_preds)
```

---

## Cost Function & Risk Formulation

### Multi-Objective Path Cost
The edge cost between adjacent graph nodes $u$ and $v$ is given by:
$$\text{Cost}(u \to v) = d(u, v) \times \left(1 + \alpha \cdot R_{\text{total}}(v)\right)$$
- $d(u, v)$: Great Circle Haversine distance in Nautical Miles.
- $\alpha$: Vessel risk tolerance factor (e.g. 2.5). Higher $\alpha$ forces paths to steer clear of iceberg uncertainty fields.
- $R_{\text{total}}(v)$: Combined probabilistic risk score $\in [0.0, 1.0]$. Nodes exceeding `vessel.max_risk_threshold` (e.g. 0.65) or land boundaries are treated as impassable ($\text{Cost} = \infty$).

---

## Assumptions & Approximations

1. **Vessel Speeds**: Assumes constant cruising speed (e.g. 11.5 knots).
2. **Fuel Consumption**: Modeled linearly based on transit days and daily fuel burn rate (e.g. 14.0 tons/day).
3. **Spatial Uncertainty**: Represented as a 2D Gaussian probability density around predicted iceberg locations scaled by standard deviation $\sigma$ (in km) and model confidence score.
