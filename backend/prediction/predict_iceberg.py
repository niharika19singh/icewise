"""
ICEWISE Iceberg Trajectory Prediction — physics + ML hybrid.

Same model as before (Tanusha), refactored from a flat top-to-bottom script
into an importable, request-driven function so it can be called repeatedly
(e.g. from an API endpoint) without re-reading the CSV or retraining the
RandomForest on every call.

No modeling logic changed by this refactor:
  - physics calibration: linear regression of observed velocity on wind
    (unchanged coefficients/features)
  - ML residual model: RandomForestRegressor(n_estimators=200, max_depth=10,
    min_samples_leaf=10, random_state=42) on the same features
  - train/test split date (2020-10-01), dt_hours filter (0, 48], and the
    uncertainty_km heuristic are all byte-for-byte the same formulas as before
  - validation rules (lat/lon range, bbox ordering, horizon bounds, region
    size cap, coverage checks) are the same checks, same thresholds, same
    reasons — only returned as data instead of printed + SystemExit

This is historical replay, not live forecasting: every "prediction" is the
hybrid model's estimate for a date that has already happened, checked against
the same historical CSV used to train it.
"""

import functools
import os
from typing import Any, Dict, List, Optional, Sequence, Union

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor

CSV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "iceberg_training_data_2020.csv")
OUTPUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "iceberg_prediction_output.json")

FEATURES = ["wind_u10", "wind_v10", "prev_latitude", "prev_longitude", "dt_hours"]
SPLIT_TIME = pd.Timestamp("2020-10-01", tz="UTC")
MAX_HORIZON_HOURS = 72
MAX_REGION_LAT_SPAN = 15
MAX_REGION_LON_SPAN = 30


# ============================================================
# Data loading + training — run once, cached for the process
# ============================================================

def _load_training_frame(csv_path: str = CSV_PATH) -> pd.DataFrame:
    """Loads and cleans the historical iceberg/wind observations. Same steps as before."""
    df = pd.read_csv(csv_path)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df = df.sort_values(["iceberg_id", "timestamp"]).reset_index(drop=True)

    df["prev_latitude"] = df.groupby("iceberg_id")["latitude"].shift(1)
    df["prev_longitude"] = df.groupby("iceberg_id")["longitude"].shift(1)

    df = df.dropna(
        subset=["prev_latitude", "prev_longitude", "wind_u10", "wind_v10", "observed_u", "observed_v", "dt_hours"]
    ).copy()

    df = df[(df["dt_hours"] > 0) & (df["dt_hours"] <= 48)].copy()
    return df


def _train_hybrid_model(df: pd.DataFrame):
    """
    Calibrates the physics baseline and fits the RF residual model on the
    pre-2020-10-01 training split — identical to the original script.
    Returns (coef_u, coef_v, model).
    """
    train = df[df["timestamp"] < SPLIT_TIME].copy()

    X_u = np.column_stack([train["wind_u10"].values, np.ones(len(train))])
    coef_u = np.linalg.lstsq(X_u, train["observed_u"].values, rcond=None)[0]

    X_v = np.column_stack([train["wind_v10"].values, np.ones(len(train))])
    coef_v = np.linalg.lstsq(X_v, train["observed_v"].values, rcond=None)[0]

    train["physics_u"] = coef_u[0] * train["wind_u10"] + coef_u[1]
    train["physics_v"] = coef_v[0] * train["wind_v10"] + coef_v[1]
    train["residual_u"] = train["observed_u"] - train["physics_u"]
    train["residual_v"] = train["observed_v"] - train["physics_v"]

    model = RandomForestRegressor(n_estimators=200, max_depth=10, min_samples_leaf=10, random_state=42, n_jobs=-1)
    model.fit(train[FEATURES], train[["residual_u", "residual_v"]])

    return coef_u, coef_v, model


@functools.lru_cache(maxsize=1)
def _get_predictor(csv_path: str = CSV_PATH):
    """
    Loads the data and trains the hybrid model ONCE per process, then caches
    it for every subsequent call. The trained model does not depend on the
    request (region/start_time/horizon only select which already-observed
    icebergs to report on), so this is safe: identical result to retraining
    per request, just without paying the ~20s physics+RandomForest cost every
    time. Deliberately NOT persisted to disk (no joblib/pickle) — a live
    process only needs to pay this cost once, and an in-memory cache avoids
    the staleness/versioning questions a saved model file would raise for a
    prototype at this stage. Revisit if this ever needs to survive process
    restarts cheaply.
    """
    df = _load_training_frame(csv_path)
    coef_u, coef_v, model = _train_hybrid_model(df)
    return df, coef_u, coef_v, model


def reset_predictor_cache() -> None:
    """Test/dev helper: forces the next call to retrain from scratch."""
    _get_predictor.cache_clear()


# ============================================================
# Request-driven prediction
# ============================================================

def _invalid(reason: str) -> Dict[str, Any]:
    return {"status": "INVALID_REQUEST", "reason": reason}


def _no_coverage(reason: str, **extra: Any) -> Dict[str, Any]:
    return {"status": "NO_COVERAGE", "reason": reason, **extra}


def predict_icebergs(
    region: Dict[str, float],
    start_time: str,
    horizon_hours: Sequence[Union[int, float]],
    csv_path: str = CSV_PATH,
) -> Dict[str, Any]:
    """
    Request-driven hybrid iceberg trajectory prediction.

    :param region: {"min_lat", "max_lat", "min_lon", "max_lon"} in degrees.
    :param start_time: ISO 8601 timestamp string; must exactly match a
        recorded observation timestamp in the historical dataset (this is
        historical replay, not a live forecast from an arbitrary date).
    :param horizon_hours: forecast horizons in hours, e.g. [24, 48, 72].
    :return: {"status": "OK", "mission": {...}, "icebergs": [...], "model":
        "physics_ml_hybrid", "prediction_mode": "historical_replay"}, or
        {"status": "INVALID_REQUEST", "reason": ...} for malformed input, or
        {"status": "NO_COVERAGE", "reason": ..., ...} for a well-formed
        request with no data at that region/time. Never raises for a bad
        request — only for a genuinely unexpected internal failure.

    Validation rules, thresholds and reasons are unchanged from the original
    script; only the raise-SystemExit-and-print control flow became returns.
    """
    try:
        min_lat = float(region["min_lat"])
        max_lat = float(region["max_lat"])
        min_lon = float(region["min_lon"])
        max_lon = float(region["max_lon"])
    except (KeyError, TypeError, ValueError):
        return _invalid("region must include numeric min_lat, max_lat, min_lon, max_lon.")

    try:
        start_ts = pd.Timestamp(start_time, tz="UTC")
    except (TypeError, ValueError):
        return _invalid("start_time must be a valid ISO 8601 timestamp.")

    if not horizon_hours:
        return _invalid("No prediction horizon provided.")

    # Latitude validation
    if not (-90 <= min_lat <= 90 and -90 <= max_lat <= 90):
        return _invalid("Latitude must be between -90 and 90 degrees.")

    # Longitude validation
    if not (-180 <= min_lon <= 180 and -180 <= max_lon <= 180):
        return _invalid("Longitude must be between -180 and 180 degrees.")

    # Bounding-box validation
    if min_lat >= max_lat:
        return _invalid("min_lat must be smaller than max_lat.")
    if min_lon >= max_lon:
        return _invalid("min_lon must be smaller than max_lon.")

    # Horizon validation
    if any(not isinstance(h, (int, float)) or h <= 0 for h in horizon_hours):
        return _invalid("Prediction horizons must be positive numbers.")

    # Prevent absurdly large prediction requests
    if max(horizon_hours) > MAX_HORIZON_HOURS:
        return _invalid(f"Maximum supported prediction horizon is {MAX_HORIZON_HOURS} hours.")

    # Prevent absurdly large geographical requests
    if (max_lat - min_lat) > MAX_REGION_LAT_SPAN or (max_lon - min_lon) > MAX_REGION_LON_SPAN:
        return _invalid("Requested region is too large for the current prototype.")

    region_out = {"min_lat": min_lat, "max_lat": max_lat, "min_lon": min_lon, "max_lon": max_lon}

    df, coef_u, coef_v, model = _get_predictor(csv_path)

    # Data coverage check
    global_start = df["timestamp"].min()
    global_end = df["timestamp"].max()
    if start_ts < global_start or start_ts > global_end:
        return _no_coverage(
            "Requested date is outside supported data coverage.",
            requested_start=start_ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
            supported_start=global_start.strftime("%Y-%m-%dT%H:%M:%SZ"),
            supported_end=global_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        )

    # Find icebergs in the requested region at the requested (exact) timestamp
    regional_data = df[
        (df["latitude"] >= min_lat)
        & (df["latitude"] <= max_lat)
        & (df["longitude"] >= min_lon)
        & (df["longitude"] <= max_lon)
        & (df["timestamp"] == start_ts)
    ]
    if len(regional_data) == 0:
        return _no_coverage(
            "No iceberg observations are available inside the requested region at the requested time.",
            region=region_out,
            requested_start=start_ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
        )

    iceberg_ids = regional_data["iceberg_id"].drop_duplicates().tolist()

    results: List[Dict[str, Any]] = []
    for iceberg_id in iceberg_ids:
        iceberg_data = df[df["iceberg_id"] == iceberg_id]
        scenario = iceberg_data[iceberg_data["timestamp"] == start_ts]
        if len(scenario) == 0:
            continue

        current = scenario.iloc[0]
        current_lat = float(current["latitude"])
        current_lon = float(current["longitude"])
        previous_lat, previous_lon = current_lat, current_lon
        lat, lon = current_lat, current_lon

        predictions: List[Dict[str, Any]] = []
        future_data = iceberg_data[iceberg_data["timestamp"] > start_ts].sort_values("timestamp")

        for hours_ahead in horizon_hours:
            target_time = start_ts + pd.Timedelta(hours=hours_ahead)
            available = future_data[future_data["timestamp"] <= target_time]
            if len(available) == 0:
                continue
            forcing = available.iloc[-1]
            dt_hours = float((target_time - start_ts) / pd.Timedelta(hours=1))

            physics_u = coef_u[0] * forcing["wind_u10"] + coef_u[1]
            physics_v = coef_v[0] * forcing["wind_v10"] + coef_v[1]

            ml_input = pd.DataFrame(
                [{"wind_u10": forcing["wind_u10"], "wind_v10": forcing["wind_v10"],
                  "prev_latitude": previous_lat, "prev_longitude": previous_lon, "dt_hours": dt_hours}]
            )
            residual = model.predict(ml_input)[0]
            hybrid_u = physics_u + residual[0]
            hybrid_v = physics_v + residual[1]

            east_km = hybrid_u * dt_hours * 3.6
            north_km = hybrid_v * dt_hours * 3.6
            delta_lat = north_km / 111.0
            delta_lon = east_km / (111.0 * np.cos(np.radians(lat)))
            lat = lat + delta_lat
            lon = lon + delta_lon

            # Prototype uncertainty: NOT a calibrated confidence interval —
            # a heuristic positional-uncertainty radius that grows with
            # horizon and estimated speed. Treat it as that, nothing more.
            uncertainty_km = 2.0 + 0.05 * hours_ahead + 0.5 * np.sqrt(hybrid_u**2 + hybrid_v**2) * hours_ahead

            predictions.append(
                {
                    "timestamp": target_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "latitude": round(lat, 6),
                    "longitude": round(lon, 6),
                    "forecast_hours": hours_ahead,
                    "uncertainty_km": round(float(uncertainty_km), 2),
                }
            )
            previous_lat, previous_lon = lat, lon

        if predictions:
            results.append(
                {
                    "iceberg_id": iceberg_id,
                    "current_state": {
                        "timestamp": start_ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
                        "latitude": round(current_lat, 6),
                        "longitude": round(current_lon, 6),
                    },
                    "predictions": predictions,
                    "model": "physics_ml_hybrid",
                }
            )

    if not results:
        return _no_coverage(
            "Icebergs were found in the region, but sufficient future forcing data was unavailable for prediction."
        )

    return {
        "status": "OK",
        "mission": {"region": region_out, "start_time": start_ts.strftime("%Y-%m-%dT%H:%M:%SZ"), "horizon_hours": list(horizon_hours)},
        "icebergs": results,
        "model": "physics_ml_hybrid",
        "prediction_mode": "historical_replay",
    }


# ============================================================
# Standalone demo (original East Antarctica scenario, unchanged)
# ============================================================

if __name__ == "__main__":
    import json

    # Original demo mission — change here to try a different one manually.
    # (Not used by predict_icebergs() callers, who pass their own request.)
    demo_request = {
        "region": {"min_lat": -66.0, "max_lat": -64.0, "min_lon": 100.0, "max_lon": 115.0},
        "start_time": "2020-07-20T00:00:00Z",
        "horizon_hours": [24, 48, 72],
    }

    output = predict_icebergs(**demo_request)

    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    print("\n" + "=" * 60)
    print("ICEBERG MISSION PREDICTION")
    print("=" * 60)
    print(json.dumps(output, indent=2))
    print("\nSaved:")
    print(OUTPUT_PATH)
