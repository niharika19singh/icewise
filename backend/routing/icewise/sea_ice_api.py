"""
FastAPI router for Real NSIDC Sea-Ice Concentration Data.
Exposes sea-ice grid points in standard JSON and GeoJSON formats.
Mounted into the existing ICEWISE Routing API (backend/routing/main.py) —
not a standalone app, so it shares that server's host/port/CORS config.
"""

import os
import json
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "nsidc_sea_ice_20200102.json")


def _get_raw_data() -> Dict[str, Any]:
    if not os.path.exists(DATA_PATH):
        raise HTTPException(status_code=404, detail="Sea ice dataset file not found.")
    with open(DATA_PATH, "r") as f:
        return json.load(f)


@router.get("/api/sea-ice/concentration")
def get_sea_ice_concentration(
    min_lat: Optional[float] = Query(None, description="Optional minimum latitude filter"),
    max_lat: Optional[float] = Query(None, description="Optional maximum latitude filter"),
    min_lon: Optional[float] = Query(None, description="Optional minimum longitude filter"),
    max_lon: Optional[float] = Query(None, description="Optional maximum longitude filter"),
) -> Dict[str, Any]:
    """
    Returns real NSIDC sea-ice concentration grid data.
    Optional spatial bounding box filters can be applied via query parameters.
    """
    payload = _get_raw_data()
    data_cells = payload.get("data", [])

    if any(param is not None for param in [min_lat, max_lat, min_lon, max_lon]):
        filtered = []
        for cell in data_cells:
            lat = cell["latitude"]
            lon = cell["longitude"]
            if min_lat is not None and lat < min_lat:
                continue
            if max_lat is not None and lat > max_lat:
                continue
            if min_lon is not None and lon < min_lon:
                continue
            if max_lon is not None and lon > max_lon:
                continue
            filtered.append(cell)

        response = dict(payload)
        response["cell_count"] = len(filtered)
        response["data"] = filtered
        return response

    return payload


@router.get("/api/sea-ice/geojson")
def get_sea_ice_geojson(
    min_lat: Optional[float] = Query(None, description="Optional minimum latitude filter"),
    max_lat: Optional[float] = Query(None, description="Optional maximum latitude filter"),
    min_lon: Optional[float] = Query(None, description="Optional minimum longitude filter"),
    max_lon: Optional[float] = Query(None, description="Optional maximum longitude filter"),
) -> Dict[str, Any]:
    """
    Returns real NSIDC sea-ice concentration grid data in GeoJSON FeatureCollection format.
    """
    payload = _get_raw_data()
    data_cells = payload.get("data", [])
    features = []

    for cell in data_cells:
        lat = cell["latitude"]
        lon = cell["longitude"]
        if min_lat is not None and lat < min_lat:
            continue
        if max_lat is not None and lat > max_lat:
            continue
        if min_lon is not None and lon < min_lon:
            continue
        if max_lon is not None and lon > max_lon:
            continue

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [lon, lat]
            },
            "properties": {
                "ice_concentration": cell["ice_concentration"],
                "timestamp": payload.get("timestamp"),
                "source": payload.get("source")
            }
        })

    return {
        "type": "FeatureCollection",
        "metadata": {
            "source": payload.get("source"),
            "dataset_id": payload.get("dataset_id"),
            "timestamp": payload.get("timestamp"),
            "region": payload.get("region"),
            "grid_resolution_km": payload.get("grid_resolution_km"),
            "cell_count": len(features)
        },
        "features": features
    }
