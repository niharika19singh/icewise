import xarray as xr
import pandas as pd

from preprocess import load_all_icebergs
from features import calculate_movement


# --------------------------------------------------
# 1. Load C18B trajectory
# --------------------------------------------------

df = load_all_icebergs("../../data/icebergs")
df = calculate_movement(df)

df = df[
    (df["iceberg_id"] == "C18B") &
    (df["timestamp"] >= "2020-06-24") &
    (df["timestamp"] <= "2020-08-06")
].copy()

# ERA5 uses timestamps, so make sure ours are datetime
df["timestamp"] = pd.to_datetime(df["timestamp"])


# --------------------------------------------------
# 2. Load ERA5 wind
# --------------------------------------------------

era5 = xr.open_dataset("era5_c18b_wind.nc")

# Rename ERA5 time coordinate to something easier
era5 = era5.rename({"valid_time": "timestamp"})


# --------------------------------------------------
# 3. Match each iceberg observation to nearest
#    ERA5 time + nearest spatial grid point
# --------------------------------------------------

matched = era5.sel(
    timestamp=xr.DataArray(df["timestamp"].values, dims="obs"),
    latitude=xr.DataArray(df["latitude"].values, dims="obs"),
    longitude=xr.DataArray(df["longitude"].values, dims="obs"),
    method="nearest"
)

df["wind_u10"] = matched["u10"].values
df["wind_v10"] = matched["v10"].values


# --------------------------------------------------
# 4. Save matched dataset
# --------------------------------------------------

df.to_csv("c18b_with_wind.csv", index=False)

print("ERA5 matching complete.")
print("Rows:", len(df))
print("\nMatched sample:")
print(
    df[
        [
            "timestamp",
            "latitude",
            "longitude",
            "wind_u10",
            "wind_v10"
        ]
    ].head(10).to_string(index=False)
)

print("\nWind statistics:")
print(df[["wind_u10", "wind_v10"]].describe())