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
# Start with the 50 longest tracks.
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
# 5. LOAD ERA5 DATASETS
# --------------------------------------------------

print("\nLoading ERA5 datasets...")

# General Antarctic ERA5 dataset
era5_general = xr.open_dataset(
    "era5_antarctic_wind_2020.nc"
).rename(
    {"valid_time": "timestamp"}
)

# Correct Weddell Sea ERA5 dataset
# Covers negative longitudes from -70 to -25
era5_weddell = xr.open_dataset(
    "era5_weddell_wind_2020.nc"
).rename(
    {"valid_time": "timestamp"}
)


# --------------------------------------------------
# 6. MATCH ERA5 WIND
# --------------------------------------------------

print("Matching ERA5 wind...")

# Create empty columns first
df["wind_u10"] = np.nan
df["wind_v10"] = np.nan


# --------------------------------------------------
# 6A. IDENTIFY NEGATIVE-LONGITUDE OBSERVATIONS
# --------------------------------------------------
#
# Weddell observations use negative longitudes.
# These must use the corrected Weddell ERA5 dataset.
# --------------------------------------------------

weddell_mask = df["longitude"] < 0

# All other observations use the general ERA5 dataset
general_mask = ~weddell_mask


print(
    "Negative-longitude observations:",
    int(weddell_mask.sum())
)

print(
    "General ERA5 observations:",
    int(general_mask.sum())
)


# --------------------------------------------------
# 6B. MATCH WEDDELL OBSERVATIONS
# --------------------------------------------------

if weddell_mask.any():

    matched_weddell = era5_weddell.sel(
        timestamp=xr.DataArray(
            df.loc[weddell_mask, "timestamp"].values,
            dims="obs"
        ),
        latitude=xr.DataArray(
            df.loc[weddell_mask, "latitude"].values,
            dims="obs"
        ),
        longitude=xr.DataArray(
            df.loc[weddell_mask, "longitude"].values,
            dims="obs"
        ),
        method="nearest"
    )

    df.loc[weddell_mask, "wind_u10"] = (
        matched_weddell["u10"].values
    )

    df.loc[weddell_mask, "wind_v10"] = (
        matched_weddell["v10"].values
    )


# --------------------------------------------------
# 6C. MATCH OTHER OBSERVATIONS
# --------------------------------------------------

if general_mask.any():

    matched_general = era5_general.sel(
        timestamp=xr.DataArray(
            df.loc[general_mask, "timestamp"].values,
            dims="obs"
        ),
        latitude=xr.DataArray(
            df.loc[general_mask, "latitude"].values,
            dims="obs"
        ),
        longitude=xr.DataArray(
            df.loc[general_mask, "longitude"].values,
            dims="obs"
        ),
        method="nearest"
    )

    df.loc[general_mask, "wind_u10"] = (
        matched_general["u10"].values
    )

    df.loc[general_mask, "wind_v10"] = (
        matched_general["v10"].values
    )


# --------------------------------------------------
# 6D. VERIFY WIND MATCHING
# --------------------------------------------------

print("\nWind matching verification:")

print(
    "Negative-longitude observations:",
    int((df["longitude"] < 0).sum())
)

print(
    "Negative-longitude observations with wind:",
    int(
        df.loc[
            df["longitude"] < 0,
            ["wind_u10", "wind_v10"]
        ].dropna().shape[0]
    )
)

print(
    "All observations with wind:",
    int(
        df[
            ["wind_u10", "wind_v10"]
        ].dropna().shape[0]
    )
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