import pandas as pd
import numpy as np


def calculate_movement(df):
    df = df.copy()

    df = df.sort_values(
        ["iceberg_id", "timestamp"]
    ).reset_index(drop=True)

    df["prev_latitude"] = (
        df.groupby("iceberg_id")["latitude"].shift(1)
    )

    df["prev_longitude"] = (
        df.groupby("iceberg_id")["longitude"].shift(1)
    )

    df["prev_timestamp"] = (
        df.groupby("iceberg_id")["timestamp"].shift(1)
    )

    df["dt_hours"] = (
        df["timestamp"] - df["prev_timestamp"]
    ).dt.total_seconds() / 3600

    # Keep only reasonably close observations
    df.loc[
        (df["dt_hours"] <= 0) |
        (df["dt_hours"] > 48),
        ["dt_hours"]
    ] = np.nan

    lat_km = (
        df["latitude"] - df["prev_latitude"]
    ) * 111.0

    lon_km = (
        (df["longitude"] - df["prev_longitude"])
        * 111.0
        * np.cos(np.radians(df["latitude"]))
    )

    df["delta_lat_km"] = lat_km
    df["delta_lon_km"] = lon_km

    df["distance_km"] = np.sqrt(
        df["delta_lat_km"] ** 2 +
        df["delta_lon_km"] ** 2
    )

    df["speed_kmh"] = (
        df["distance_km"] / df["dt_hours"]
    )

    # Conservative physical sanity filter
    df.loc[
        df["speed_kmh"] > 5,
        ["distance_km", "speed_kmh",
         "delta_lat_km", "delta_lon_km"]
    ] = np.nan

    return df