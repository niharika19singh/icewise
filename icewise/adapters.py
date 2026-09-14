"""
Adapter and Schema Normalization Layer for ICEWISE Navigation Decision Support System.
Translates Tanusha's iceberg trajectory prediction JSON outputs into Niharika's
risk engine domain objects.
"""

from datetime import datetime
import json
import math
import os
from typing import List, Dict, Any, Optional, Union
from icewise.interfaces import Waypoint, IcebergPrediction, IcebergSizeCategory, EnvironmentalData


def parse_iso_or_numeric_time(val: Any, base_time: Optional[datetime] = None) -> float:
    """
    Converts an ISO 8601 string, timestamp float, or numeric offset into time_offset_hours.
    If base_time is provided and val is an ISO timestamp string, calculates difference in hours.
    """
    if val is None:
        return 0.0

    if isinstance(val, (int, float)):
        return float(val)

    if isinstance(val, str):
        try:
            return float(val)
        except ValueError:
            pass

        try:
            dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
            if base_time:
                delta_seconds = (dt - base_time).total_seconds()
                return round(delta_seconds / 3600.0, 2)
            return 0.0
        except Exception:
            return 0.0

    return 0.0


def normalize_longitude(lon: float) -> float:
    """Normalizes longitude into standard [-180.0, +180.0] degrees range."""
    lon = float(lon)
    while lon > 180.0:
        lon -= 360.0
    while lon < -180.0:
        lon += 360.0
    return round(lon, 6)


def normalize_latitude(lat: float) -> float:
    """Clamps latitude to [-90.0, +90.0] degrees range."""
    return round(max(-90.0, min(90.0, float(lat))), 6)


class IcebergPredictionAdapter:
    """
    Normalizes various JSON prediction schema formats from Tanusha's ML module
    into standard IcebergPrediction DTOs.
    """

    @staticmethod
    def from_tanusha_json(data: Dict[str, Any]) -> IcebergPrediction:
        """
        Parses a single iceberg prediction dictionary from Tanusha's ML module.
        Handles:
        - Parallel coordinate arrays (`predicted_latitudes`, `predicted_longitudes`, `predicted_future_timestamps`)
        - Nested trajectory objects (`predicted_trajectory`, `predicted_positions`)
        - ISO 8601 timestamps and relative offset hours
        - Flexible uncertainty names (`uncertainty_error_radius_km`, `error_radius_km`, `spatial_uncertainty_km`)
        - Optional ML metadata (`environmental_inputs_used`, `model_baseline_info`, `evaluation_metrics`)
        """
        iceberg_id = str(data.get("iceberg_id", "ICE-UNKNOWN"))

        # 1. Base timestamp
        raw_current_time = data.get("current_timestamp")
        base_dt = None
        if isinstance(raw_current_time, str):
            try:
                base_dt = datetime.fromisoformat(raw_current_time.replace("Z", "+00:00"))
            except Exception:
                base_dt = None

        # 2. Current position
        current_lat = None
        current_lon = None

        if "current_position" in data and isinstance(data["current_position"], dict):
            pos_dict = data["current_position"]
            current_lat = pos_dict.get("lat", pos_dict.get("latitude"))
            current_lon = pos_dict.get("lon", pos_dict.get("longitude"))
        else:
            current_lat = data.get("current_latitude", data.get("current_lat"))
            current_lon = data.get("current_longitude", data.get("current_lon"))

        if current_lat is None or current_lon is None:
            if "predicted_latitudes" in data and len(data["predicted_latitudes"]) > 0:
                current_lat = data["predicted_latitudes"][0]
                current_lon = data["predicted_longitudes"][0]
            else:
                raise ValueError(f"Iceberg '{iceberg_id}' prediction payload is missing valid current position coordinates.")

        current_lat = normalize_latitude(current_lat)
        current_lon = normalize_longitude(current_lon)
        curr_waypoint = Waypoint(lat=current_lat, lon=current_lon, time_offset_hours=0.0)

        # 3. Predicted future trajectory positions
        predicted_waypoints: List[Waypoint] = []

        # Case A: Parallel arrays (predicted_latitudes, predicted_longitudes, predicted_future_timestamps)
        if "predicted_latitudes" in data and "predicted_longitudes" in data:
            lats = data["predicted_latitudes"]
            lons = data["predicted_longitudes"]
            timestamps = data.get("predicted_future_timestamps", [])

            for i in range(len(lats)):
                p_lat = normalize_latitude(lats[i])
                p_lon = normalize_longitude(lons[i])

                if i < len(timestamps):
                    t_offset = parse_iso_or_numeric_time(timestamps[i], base_time=base_dt)
                else:
                    t_offset = i * 6.0

                predicted_waypoints.append(Waypoint(lat=p_lat, lon=p_lon, time_offset_hours=t_offset))

        # Case B: Trajectory list of position objects (predicted_trajectory or predicted_positions)
        elif "predicted_trajectory" in data or "predicted_positions" in data:
            traj_list = data.get("predicted_trajectory", data.get("predicted_positions", []))
            for idx, pt in enumerate(traj_list):
                if isinstance(pt, dict):
                    p_lat = normalize_latitude(pt.get("lat", pt.get("latitude", 0.0)))
                    p_lon = normalize_longitude(pt.get("lon", pt.get("longitude", 0.0)))

                    raw_t = pt.get("timestamp", pt.get("time_offset_hours"))
                    t_offset = parse_iso_or_numeric_time(raw_t, base_time=base_dt)
                    if t_offset == 0.0 and idx > 0 and not isinstance(raw_t, (int, float)):
                        t_offset = idx * 6.0

                    predicted_waypoints.append(Waypoint(lat=p_lat, lon=p_lon, time_offset_hours=t_offset))

        # Case C: Single-row CSV dict format (predicted_latitude, predicted_longitude, forecast_hours)
        elif "predicted_latitude" in data and "predicted_longitude" in data:
            p_lat = normalize_latitude(data["predicted_latitude"])
            p_lon = normalize_longitude(data["predicted_longitude"])
            raw_t = data.get("forecast_hours", data.get("prediction_timestamp"))
            t_offset = parse_iso_or_numeric_time(raw_t, base_time=base_dt)
            predicted_waypoints.append(Waypoint(lat=p_lat, lon=p_lon, time_offset_hours=t_offset))

        # Fallback: single point if no trajectory points provided
        if not predicted_waypoints:
            predicted_waypoints = [curr_waypoint]

        # 4. Uncertainty / Error Radius extraction
        uncertainty_km = (
            data.get("uncertainty_error_radius_km") or
            data.get("error_radius_km") or
            data.get("spatial_uncertainty_km") or
            data.get("uncertainty_km") or
            data.get("error_radius") or
            2.5
        )
        uncertainty_km = max(0.5, float(uncertainty_km))

        # 5. Model confidence score extraction
        confidence = data.get("confidence_score", data.get("confidence"))
        if confidence is None:
            eval_metrics = data.get("evaluation_metrics", {})
            if "rmse_km" in eval_metrics:
                rmse = float(eval_metrics["rmse_km"])
                confidence = max(0.1, min(1.0, 1.0 - (rmse / 20.0)))
            else:
                confidence = 0.90
        else:
            confidence = max(0.1, min(1.0, float(confidence)))

        # 6. Drift parameters & size classification
        drift_speed = float(data.get("drift_velocity_knots", data.get("drift_speed_knots", 0.0)))
        drift_bearing = float(data.get("drift_bearing_deg", data.get("drift_direction_deg", 0.0)))

        size_cat_raw = data.get("size_category", "Medium (15-45m height)")
        size_cat = IcebergSizeCategory.MEDIUM
        if isinstance(size_cat_raw, str):
            for cat in IcebergSizeCategory:
                if cat.value == size_cat_raw or cat.name == size_cat_raw:
                    size_cat = cat
                    break

        return IcebergPrediction(
            iceberg_id=iceberg_id,
            current_position=curr_waypoint,
            predicted_positions=predicted_waypoints,
            spatial_uncertainty_km=uncertainty_km,
            confidence_score=confidence,
            drift_velocity_knots=drift_speed,
            drift_bearing_deg=drift_bearing,
            size_category=size_cat,
        )

    @classmethod
    def from_tanusha_json_list(cls, payload_list: List[Dict[str, Any]]) -> List[IcebergPrediction]:
        """Parses a list of prediction JSON objects from Tanusha's ML module."""
        return [cls.from_tanusha_json(item) for item in payload_list]

    @classmethod
    def from_tanusha_csv_rows(
        cls, rows: List[Dict[str, Any]], target_timestamp: Optional[str] = None
    ) -> List[IcebergPrediction]:
        """
        Parses a list of row dictionaries matching Tanusha's CSV structure:
        `iceberg_id, current_timestamp, current_latitude, current_longitude, prediction_timestamp, forecast_hours, predicted_latitude, predicted_longitude, uncertainty_km, model`

        Groups rows by (iceberg_id, current_timestamp) to form multi-timestep trajectory predictions.
        If target_timestamp is specified, filters rows matching that current_timestamp.
        If target_timestamp is None, uses the latest current_timestamp per iceberg_id.
        """
        if not rows:
            return []

        # Filter rows by target_timestamp if specified
        if target_timestamp:
            filtered_rows = [
                r for r in rows if str(r.get("current_timestamp", "")).strip() == target_timestamp.strip()
            ]
        else:
            # Group by iceberg_id and find the latest current_timestamp per iceberg
            latest_ts_per_iceberg: Dict[str, str] = {}
            for r in rows:
                iid = str(r.get("iceberg_id", ""))
                ts = str(r.get("current_timestamp", ""))
                if iid not in latest_ts_per_iceberg or ts > latest_ts_per_iceberg[iid]:
                    latest_ts_per_iceberg[iid] = ts

            filtered_rows = [
                r for r in rows if str(r.get("current_timestamp", "")) == latest_ts_per_iceberg.get(str(r.get("iceberg_id", "")))
            ]

        # Group by (iceberg_id, current_timestamp)
        groups: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
        for r in filtered_rows:
            iid = str(r.get("iceberg_id", "ICE-UNKNOWN"))
            cts = str(r.get("current_timestamp", ""))
            groups.setdefault((iid, cts), []).append(r)

        predictions: List[IcebergPrediction] = []
        for (iid, cts), group_rows in groups.items():
            if not group_rows:
                continue

            # Sort group_rows by forecast_hours
            group_rows.sort(key=lambda x: float(x.get("forecast_hours", 0.0)))

            first_row = group_rows[0]
            curr_lat = normalize_latitude(first_row.get("current_latitude", first_row.get("predicted_latitude", 0.0)))
            curr_lon = normalize_longitude(first_row.get("current_longitude", first_row.get("predicted_longitude", 0.0)))
            curr_waypoint = Waypoint(lat=curr_lat, lon=curr_lon, time_offset_hours=0.0)

            predicted_waypoints: List[Waypoint] = []
            uncertainties: List[float] = []

            base_dt = None
            if cts:
                try:
                    base_dt = datetime.fromisoformat(cts.replace("Z", "+00:00"))
                except Exception:
                    base_dt = None

            for r in group_rows:
                p_lat = normalize_latitude(r.get("predicted_latitude", 0.0))
                p_lon = normalize_longitude(r.get("predicted_longitude", 0.0))

                raw_fhours = r.get("forecast_hours")
                if raw_fhours is not None:
                    t_offset = float(raw_fhours)
                else:
                    raw_pt = r.get("prediction_timestamp")
                    t_offset = parse_iso_or_numeric_time(raw_pt, base_time=base_dt)

                predicted_waypoints.append(Waypoint(lat=p_lat, lon=p_lon, time_offset_hours=t_offset))

                unc = float(r.get("uncertainty_km", 2.5))
                uncertainties.append(unc)

            spatial_unc = max(uncertainties) if uncertainties else 2.5
            spatial_unc = max(0.5, float(spatial_unc))

            predictions.append(
                IcebergPrediction(
                    iceberg_id=iid,
                    current_position=curr_waypoint,
                    predicted_positions=predicted_waypoints,
                    spatial_uncertainty_km=spatial_unc,
                    confidence_score=0.90,
                    drift_velocity_knots=0.0,
                    drift_bearing_deg=0.0,
                    size_category=IcebergSizeCategory.MEDIUM,
                )
            )

        return predictions

    @classmethod
    def from_tanusha_csv_file(
        cls, csv_path: str, target_timestamp: Optional[str] = None
    ) -> List[IcebergPrediction]:
        """Reads Tanusha's CSV dataset file and returns standard IcebergPrediction DTOs."""
        import csv
        with open(csv_path, mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = [dict(r) for r in reader]
        return cls.from_tanusha_csv_rows(rows, target_timestamp=target_timestamp)


def load_nsidc_sea_ice_data(json_path: Optional[str] = None) -> EnvironmentalData:
    """
    Loads real NSIDC daily sea-ice concentration data from JSON file into EnvironmentalData layer.
    """
    if json_path is None:
        json_path = os.path.join(os.path.dirname(__file__), "data", "nsidc_sea_ice_20200102.json")

    if not os.path.exists(json_path):
        return EnvironmentalData(default_ice_concentration=0.05)

    with open(json_path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    ice_map = {}
    for item in payload.get("data", []):
        lat = round(float(item["latitude"]), 2)
        lon = round(float(item["longitude"]), 2)
        conc = float(item["ice_concentration"])
        ice_map[(lat, lon)] = conc

    return EnvironmentalData(
        ice_concentration_map=ice_map,
        default_ice_concentration=0.05,
        weather_risk_factor=1.0,
    )


