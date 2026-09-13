import numpy as np
import pandas as pd

from preprocess import load_all_icebergs
from features import calculate_movement


# --------------------------------------------------
# 1. LOAD ICEBERG TRAJECTORY DATA
# --------------------------------------------------

df = load_all_icebergs("../../data/icebergs")
df = calculate_movement(df)


# --------------------------------------------------
# 2. SELECT C18B SCENARIO
# --------------------------------------------------

df = df[
    (df["iceberg_id"] == "C18B") &
    (df["timestamp"] >= "2020-06-24") &
    (df["timestamp"] <= "2020-08-06")
].copy()


# --------------------------------------------------
# 3. LOAD ERA5 WIND DATA
# --------------------------------------------------

wind = pd.read_csv("c18b_with_wind.csv")

wind["timestamp"] = pd.to_datetime(wind["timestamp"])
df["timestamp"] = pd.to_datetime(df["timestamp"])


# Keep only required ERA5 columns
wind = wind[
    [
        "timestamp",
        "wind_u10",
        "wind_v10"
    ]
]


# --------------------------------------------------
# 4. MATCH WIND WITH ICEBERG OBSERVATIONS
# --------------------------------------------------

df = df.merge(
    wind,
    on="timestamp",
    how="left"
)


# --------------------------------------------------
# 5. REMOVE INVALID OBSERVATIONS
# --------------------------------------------------

df = df.dropna(
    subset=[
        "delta_lat_km",
        "delta_lon_km",
        "dt_hours",
        "wind_u10",
        "wind_v10"
    ]
).copy()


# --------------------------------------------------
# 6. CONVERT OBSERVED MOVEMENT TO VELOCITY
# --------------------------------------------------
#
# delta_lat_km / delta_lon_km
#       ↓
# displacement in metres
#       ↓
# divide by time
#       ↓
# velocity in m/s
#
# observed_u = east-west velocity
# observed_v = north-south velocity
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


print("Usable observations:", len(df))


print("\nObserved velocity:")
print(
    df[
        [
            "timestamp",
            "observed_u",
            "observed_v",
            "wind_u10",
            "wind_v10"
        ]
    ].head(10).to_string(index=False)
)


# --------------------------------------------------
# 7. CALIBRATE PHYSICS MODEL
# --------------------------------------------------
#
# We learn:
#
# East velocity =
#     alpha_u × wind_u + intercept
#
# North velocity =
#     alpha_v × wind_v + intercept
#
# Instead of assuming the coefficients,
# we estimate them from historical observations.
# --------------------------------------------------


# East-west component
X_u = np.column_stack([
    df["wind_u10"].values,
    np.ones(len(df))
])

coef_u = np.linalg.lstsq(
    X_u,
    df["observed_u"].values,
    rcond=None
)[0]


# North-south component
X_v = np.column_stack([
    df["wind_v10"].values,
    np.ones(len(df))
])

coef_v = np.linalg.lstsq(
    X_v,
    df["observed_v"].values,
    rcond=None
)[0]


# --------------------------------------------------
# 8. DISPLAY CALIBRATED MODEL
# --------------------------------------------------

print("\n" + "=" * 50)
print("CALIBRATED PHYSICS MODEL")
print("=" * 50)

print(
    f"East velocity = "
    f"{coef_u[0]:.6f} × wind_u + "
    f"{coef_u[1]:.6f}"
)

print(
    f"North velocity = "
    f"{coef_v[0]:.6f} × wind_v + "
    f"{coef_v[1]:.6f}"
)


# --------------------------------------------------
# 9. PHYSICS PREDICTION
# --------------------------------------------------

df["predicted_u"] = (
    coef_u[0] * df["wind_u10"]
    + coef_u[1]
)

df["predicted_v"] = (
    coef_v[0] * df["wind_v10"]
    + coef_v[1]
)


# --------------------------------------------------
# 10. CALCULATE PHYSICS ERROR
# --------------------------------------------------

df["error_u"] = (
    df["observed_u"] -
    df["predicted_u"]
)

df["error_v"] = (
    df["observed_v"] -
    df["predicted_v"]
)


df["physics_error_speed"] = np.sqrt(
    df["error_u"] ** 2 +
    df["error_v"] ** 2
)


# --------------------------------------------------
# 11. PRINT ERROR STATISTICS
# --------------------------------------------------

print("\n" + "=" * 50)
print("PHYSICS MODEL ERROR")
print("=" * 50)

print(
    f"Mean velocity error: "
    f"{df['physics_error_speed'].mean():.6f} m/s"
)

print(
    f"Median velocity error: "
    f"{df['physics_error_speed'].median():.6f} m/s"
)

print(
    f"90th percentile error: "
    f"{df['physics_error_speed'].quantile(0.90):.6f} m/s"
)


# --------------------------------------------------
# 12. SAVE CALIBRATED DATA
# --------------------------------------------------

df.to_csv(
    "c18b_physics_calibrated.csv",
    index=False
)


print("\nSaved:")
print("c18b_physics_calibrated.csv")