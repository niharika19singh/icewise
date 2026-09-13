import numpy as np
import pandas as pd
import xarray as xr

from preprocess import load_all_icebergs
from features import calculate_movement


# --------------------------------------------------
# 1. LOAD ICEBERG DATA
# --------------------------------------------------

print("Loading iceberg tracks...")

df = load_all_icebergs("../../data/icebergs")
df = calculate_movement(df)


# --------------------------------------------------
# 2. KEEP VALID MOVEMENTS
# --------------------------------------------------

df = df.dropna(
    subset=[
        "delta_lat_km",
        "delta_lon_km",
        "dt_hours"
    ]
).copy()


# --------------------------------------------------
# 3. KEEP ONLY 2020 OBSERVATIONS
# --------------------------------------------------

df = df[
    (df["timestamp"] >= "2020-01-01") &
    (df["timestamp"] < "2021-01-01")
].copy()


print("2020 observations:", len(df))
print("Icebergs:", df["iceberg_id"].nunique())


# --------------------------------------------------
# 4. LIMIT DATASET FOR INITIAL TEST
# --------------------------------------------------
#
# Start with 50 icebergs.
# Once the matching works, we can expand it.
# --------------------------------------------------

icebergs = (
    df.groupby("iceberg_id")
    .size()
    .sort_values(ascending=False)
    .head(50)
    .index
)

df = df[
    df["iceberg_id"].isin(icebergs)
].copy()


print("Selected icebergs:", df["iceberg_id"].nunique())
print("Selected observations:", len(df))


# --------------------------------------------------
# 5. LOAD ERA5
# --------------------------------------------------

print("\nLoading ERA5...")

era5 = xr.open_dataset(
    "era5_antarctic_wind_2020.nc"
)

era5 = era5.rename(
    {"valid_time": "timestamp"}
)


# --------------------------------------------------
# 6. MATCH ERA5 WIND
# --------------------------------------------------

print("Matching ERA5 wind...")

matched = era5.sel(
    timestamp=xr.DataArray(
        df["timestamp"].values,
        dims="obs"
    ),
    latitude=xr.DataArray(
        df["latitude"].values,
        dims="obs"
    ),
    longitude=xr.DataArray(
        df["longitude"].values,
        dims="obs"
    ),
    method="nearest"
)


df["wind_u10"] = (
    matched["u10"].values
)

df["wind_v10"] = (
    matched["v10"].values
)


# --------------------------------------------------
# 7. CONVERT OBSERVED MOVEMENT TO VELOCITY
# --------------------------------------------------

df["observed_u"] = (
    df["delta_lon_km"] * 1000
) / (
    df["dt_hours"] * 3600
)

df["observed_v"] = (
    df["delta_lat_km"] * 1000
) / (
    df["dt_hours"] * 3600
)


# --------------------------------------------------
# 8. REMOVE INVALID MATCHES
# --------------------------------------------------

df = df.dropna(
    subset=[
        "wind_u10",
        "wind_v10",
        "observed_u",
        "observed_v"
    ]
).copy()


# --------------------------------------------------
# 9. SAVE TRAINING DATA
# --------------------------------------------------

output_columns = [
    "iceberg_id",
    "timestamp",
    "latitude",
    "longitude",
    "dt_hours",
    "wind_u10",
    "wind_v10",
    "observed_u",
    "observed_v"
]


df[output_columns].to_csv(
    "iceberg_training_data_2020.csv",
    index=False
)


# --------------------------------------------------
# 10. SUMMARY
# --------------------------------------------------

print("\n" + "=" * 55)
print("TRAINING DATASET READY")
print("=" * 55)

print(
    "Icebergs:",
    df["iceberg_id"].nunique()
)

print(
    "Observations:",
    len(df)
)

print(
    "Date range:",
    df["timestamp"].min(),
    "to",
    df["timestamp"].max()
)

print("\nSaved:")
print("iceberg_training_data_2020.csv")