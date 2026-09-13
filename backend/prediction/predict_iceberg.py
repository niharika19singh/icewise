import json
import numpy as np
import pandas as pd

from sklearn.ensemble import RandomForestRegressor


# ============================================================
# 1. LOAD TRAINING DATA
# ============================================================

df = pd.read_csv("iceberg_training_data_2020.csv")

df["timestamp"] = pd.to_datetime(df["timestamp"])

df = df.sort_values(
    ["iceberg_id", "timestamp"]
).reset_index(drop=True)


# ============================================================
# 2. CREATE PREVIOUS POSITION FEATURES
# ============================================================

df["prev_latitude"] = (
    df.groupby("iceberg_id")["latitude"].shift(1)
)

df["prev_longitude"] = (
    df.groupby("iceberg_id")["longitude"].shift(1)
)


df = df.dropna(
    subset=[
        "prev_latitude",
        "prev_longitude",
        "wind_u10",
        "wind_v10",
        "observed_u",
        "observed_v",
        "dt_hours"
    ]
).copy()


df = df[
    (df["dt_hours"] > 0) &
    (df["dt_hours"] <= 48)
].copy()


# ============================================================
# 3. TRAIN / TEST SPLIT
# ============================================================

split_time = pd.Timestamp("2020-10-01")

train = df[
    df["timestamp"] < split_time
].copy()


# ============================================================
# 4. CALIBRATE PHYSICS BASELINE
# ============================================================

X_u = np.column_stack([
    train["wind_u10"].values,
    np.ones(len(train))
])

coef_u = np.linalg.lstsq(
    X_u,
    train["observed_u"].values,
    rcond=None
)[0]


X_v = np.column_stack([
    train["wind_v10"].values,
    np.ones(len(train))
])

coef_v = np.linalg.lstsq(
    X_v,
    train["observed_v"].values,
    rcond=None
)[0]


# ============================================================
# 5. CALCULATE PHYSICS VELOCITY
# ============================================================

train["physics_u"] = (
    coef_u[0] * train["wind_u10"]
    + coef_u[1]
)

train["physics_v"] = (
    coef_v[0] * train["wind_v10"]
    + coef_v[1]
)


# ============================================================
# 6. RESIDUAL TARGET
# ============================================================

train["residual_u"] = (
    train["observed_u"]
    - train["physics_u"]
)

train["residual_v"] = (
    train["observed_v"]
    - train["physics_v"]
)


# ============================================================
# 7. TRAIN ML RESIDUAL MODEL
# ============================================================

features = [
    "wind_u10",
    "wind_v10",
    "prev_latitude",
    "prev_longitude",
    "dt_hours"
]

X_train = train[features]

y_train = train[
    [
        "residual_u",
        "residual_v"
    ]
]


model = RandomForestRegressor(
    n_estimators=200,
    max_depth=10,
    min_samples_leaf=10,
    random_state=42,
    n_jobs=-1
)

model.fit(
    X_train,
    y_train
)


# ============================================================
# 8. SELECT REAL HISTORICAL ICEBERG SCENARIO
# ============================================================

iceberg_id = "C18B"

scenario_start = pd.Timestamp(
    "2020-07-20"
)

scenario = df[
    (df["iceberg_id"] == iceberg_id) &
    (df["timestamp"] == scenario_start)
].copy()


if len(scenario) == 0:
    raise ValueError(
        "Selected scenario timestamp was not found."
    )


current = scenario.iloc[0]


# ============================================================
# 9. CURRENT STATE
# ============================================================

current_timestamp = current["timestamp"]

current_lat = float(
    current["latitude"]
)

current_lon = float(
    current["longitude"]
)


# ============================================================
# 10. GENERATE FUTURE TRAJECTORY
# ============================================================

prediction_hours = [
    24,
    48,
    72
]


predictions = []

lat = current_lat
lon = current_lon

previous_lat = current_lat
previous_lon = current_lon


# Historical wind data for future replay
future_data = df[
    (df["iceberg_id"] == iceberg_id) &
    (df["timestamp"] > current_timestamp)
].copy()

future_data = future_data.sort_values(
    "timestamp"
)


for hours_ahead in prediction_hours:

    target_time = (
        current_timestamp
        + pd.Timedelta(hours=hours_ahead)
    )

    available = future_data[
        future_data["timestamp"] <= target_time
    ]

    if len(available) == 0:
        break

    forcing = available.iloc[-1]

    dt_hours = float(
        (target_time - current_timestamp)
        / pd.Timedelta(hours=1)
    )

    # --------------------------------------------------------
    # Physics prediction
    # --------------------------------------------------------

    physics_u = (
        coef_u[0] * forcing["wind_u10"]
        + coef_u[1]
    )

    physics_v = (
        coef_v[0] * forcing["wind_v10"]
        + coef_v[1]
    )

    # --------------------------------------------------------
    # ML residual correction
    # --------------------------------------------------------

    ml_input = pd.DataFrame([{
        "wind_u10": forcing["wind_u10"],
        "wind_v10": forcing["wind_v10"],
        "prev_latitude": previous_lat,
        "prev_longitude": previous_lon,
        "dt_hours": dt_hours
    }])

    residual = model.predict(
        ml_input
    )[0]

    hybrid_u = (
        physics_u + residual[0]
    )

    hybrid_v = (
        physics_v + residual[1]
    )

    # --------------------------------------------------------
    # Convert velocity → displacement
    # --------------------------------------------------------

    east_km = (
        hybrid_u
        * dt_hours
        * 3.6
    )

    north_km = (
        hybrid_v
        * dt_hours
        * 3.6
    )

    delta_lat = (
        north_km / 111.0
    )

    delta_lon = (
        east_km
        /
        (
            111.0
            * np.cos(
                np.radians(lat)
            )
        )
    )

    lat = lat + delta_lat
    lon = lon + delta_lon

    # --------------------------------------------------------
    # Simple uncertainty estimate
    # --------------------------------------------------------

    uncertainty_km = (
        2.0
        + 0.05 * hours_ahead
        + 0.5 * np.sqrt(
            hybrid_u ** 2
            + hybrid_v ** 2
        ) * hours_ahead
    )

    predictions.append({
        "timestamp": target_time.strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        ),
        "latitude": round(lat, 6),
        "longitude": round(lon, 6),
        "uncertainty_km": round(
            float(uncertainty_km),
            2
        )
    })

    previous_lat = lat
    previous_lon = lon


# ============================================================
# 11. CREATE NIHARIKA JSON
# ============================================================

output = {
    "icebergs": [
        {
            "iceberg_id": iceberg_id,

            "current_state": {
                "timestamp": current_timestamp.strftime(
                    "%Y-%m-%dT%H:%M:%SZ"
                ),
                "latitude": round(
                    current_lat,
                    6
                ),
                "longitude": round(
                    current_lon,
                    6
                )
            },

            "predictions": predictions,

            "model": "physics_ml_hybrid"
        }
    ]
}


# ============================================================
# 12. SAVE JSON
# ============================================================

with open(
    "iceberg_prediction_output.json",
    "w"
) as f:

    json.dump(
        output,
        f,
        indent=2
    )


# ============================================================
# 13. DISPLAY OUTPUT
# ============================================================

print("\n" + "=" * 60)
print("ICEBERG PREDICTION OUTPUT")
print("=" * 60)

print(
    json.dumps(
        output,
        indent=2
    )
)

print("\nSaved:")
print("iceberg_prediction_output.json")