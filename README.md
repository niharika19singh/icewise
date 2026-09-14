# ICEWISE - Antarctic Sea-Ice, Iceberg Trajectory & Navigation Decision Support (SIH 2026 - SIH26059)

ICEWISE is an integrated AI-powered navigation decision support system for Antarctic maritime operations, featuring real sea-ice concentration tracking, iceberg trajectory prediction, time-aware probabilistic risk modeling, and interactive route optimization.

---

## System Architecture

```
                               ┌──────────────────────────────────────────┐
                               │       Saeesha's Next.js Frontend        │
                               │  Interactive MapLibre GL, Command Center  │
                               │        & Analytics Dashboards            │
                               └────────────────────┬─────────────────────┘
                                                    │ REST API
                                                    ▼
                               ┌──────────────────────────────────────────┐
                               │      Niharika's FastAPI Routing API      │
                               │   Probabilistic Risk Engine & Grid Graph │
                               │     (A* & Dijkstra Route Optimizers)     │
                               └──────────┬────────────────────┬──────────┘
                                          │                    │
                                          ▼                    ▼
                        ┌───────────────────────────┐ ┌───────────────────────────┐
                        │   Tanushka's ML Model     │ │ Real NSIDC Sea-Ice Data   │
                        │  Physics + ML Residuals   │ │  Daily Antarctic Grid     │
                        │   Iceberg Predictions     │ │  Concentration Layer      │
                        └───────────────────────────┘ └───────────────────────────┘
```

---

## Core Features

- **Iceberg Trajectory & Uncertainty Prediction**: Physics-calibrated baseline model + ML residual drift model with spatial uncertainty circles.
- **Probabilistic Risk Engine**: Gaussian probability density risk field calculated across vessel travel corridors.
- **Risk-Aware Route Optimization**: A* and Dijkstra pathfinders with dynamic detour generation and route comparison (Distance, ETA, Fuel Burn %, Risk Reduction %).
- **Real Antarctic Sea-Ice Layer**: Direct ingestion of daily NSIDC Antarctic sea-ice concentration rasters (25 km EPSG:3412 reprojected to EPSG:4326).
- **Interactive Command Center UI**: Next.js 15, React 19, MapLibre GL visualization with real-time route toggling and adaptive re-routing controls.

---

## Getting Started

### 1. Prerequisites
- Node.js 18+ (for frontend)
- Python 3.10+ (for backend)

### 2. Backend Setup & Server Execution
```bash
# Install Python dependencies
pip install -r backend/routing/requirements.txt

# Run FastAPI backend server (default port 8000)
uvicorn backend.routing.main:app --host 0.0.0.0 --port 8000
```

### 3. Frontend Setup & Execution
```bash
# Install Node dependencies
npm install

# Run Next.js development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## API Endpoints

- `POST /api/route`: Compute optimal navigation route and alternatives based on iceberg prediction dataset.
- `POST /api/route/recalculate`: Dynamic adaptive re-routing triggered by updated iceberg observations.
- `GET /api/sea-ice/concentration`: Real NSIDC sea-ice concentration grid data.
- `GET /api/sea-ice/geojson`: GeoJSON FeatureCollection for sea-ice map rendering.
- `GET /api/analytics/c18b-validation`: C18B model prediction performance metrics.

---

## Prototype Assumptions

1. **Vessel Speeds**: Assumes constant cruising speed (e.g. 11.5–12.0 knots).
2. **Fuel Consumption**: Modeled linearly based on transit distance and daily fuel burn rate (e.g. 14.0–15.0 tons/day). Fuel consumption is never inferred from risk score.
3. **Spatial Uncertainty**: Represented as a 2D Gaussian probability density around predicted iceberg locations scaled by standard deviation $\sigma$ (in km) and confidence score.
