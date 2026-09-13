import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor


# ============================================================
# 1. LOAD DATA
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
# 3. TRAIN PHYSICS + ML MODEL
# ============================================================

split_time = pd.Timestamp("2020-10-01")

train = df[
    df["timestamp"] < split_time
].copy()


# Physics calibration

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


train["physics_u"] = (
    coef_u[0] * train["wind_u10"]
    + coef_u[1]
)

train["physics_v"] = (
    coef_v[0] * train["wind_v10"]
    + coef_v[1]
)


# Residuals

train["residual_u"] = (
    train["observed_u"]
    - train["physics_u"]
)

train["residual_v"] = (
    train["observed_v"]
    - train["physics_v"]
)


# ML features

features = [
    "wind_u10",
    "wind_v10",
    "prev_latitude",
    "prev_longitude",
    "dt_hours"
]

model = RandomForestRegressor(
    n_estimators=200,
    max_depth=10,
    min_samples_leaf=10,
    random_state=42,
    n_jobs=-1
)

model.fit(
    train[features],
    train[
        [
            "residual_u",
            "residual_v"
        ]
    ]
)


print("=" * 65)
print("MULTI-ICEBERG PREDICTION DATASET GENERATOR")
print("=" * 65)

print(
    "Model trained on:",
    len(train),
    "observations"
)


# ============================================================
# 4. SELECT ICEBERGS
# ============================================================

# Use up to 50 real icebergs.
iceberg_counts = (
    df.groupby("iceberg_id")
    .size()
    .sort_values(ascending=False)
)

selected_icebergs = (
    iceberg_counts
    .head(50)
    .index
    .tolist()
)

print(
    "Selected icebergs:",
    len(selected_icebergs)
)


# ============================================================
# 5. GENERATE PREDICTIONS
# ============================================================

prediction_rows = []

prediction_hours = [24, 48, 72]


for iceberg_id in selected_icebergs:

    iceberg = df[
        df["iceberg_id"] == iceberg_id
    ].sort_values("timestamp").reset_index(drop=True)

    # We need enough future data for a historical replay.
    # Use starting points before October so future observations
    # remain inside our 2020 dataset.

    possible_starts = iceberg[
        iceberg["timestamp"] < pd.Timestamp("2020-09-28")
    ]

    if len(possible_starts) == 0:
        continue

    # Pick up to 5 starting scenarios per iceberg.
    if len(possible_starts) > 5:
        start_indices = np.linspace(
            0,
            len(possible_starts) - 1,
            5,
            dtype=int
        )

        start_rows = possible_starts.iloc[
            start_indices
        ]

    else:
        start_rows = possible_starts


    for _, start in start_rows.iterrows():

        current_time = start["timestamp"]

        current_lat = float(start["latitude"])
        current_lon = float(start["longitude"])

        previous_lat = current_lat
        previous_lon = current_lon

        # Future historical forcing for replay
        future = iceberg[
            iceberg["timestamp"] > current_time
        ].copy()

        if len(future) == 0:
            continue


        for hours_ahead in prediction_hours:

            target_time = (
                current_time
                + pd.Timedelta(hours=hours_ahead)
            )

            available = future[
                future["timestamp"] <= target_time
            ]

            if len(available) == 0:
                continue

            forcing = available.iloc[-1]

            dt_hours = float(
                (
                    target_time - current_time
                ) / pd.Timedelta(hours=1)
            )


            # ------------------------------------------------
            # Physics prediction
            # ------------------------------------------------

            physics_u = (
                coef_u[0]
                * forcing["wind_u10"]
                + coef_u[1]
            )

            physics_v = (
                coef_v[0]
                * forcing["wind_v10"]
                + coef_v[1]
            )


            # ------------------------------------------------
            # ML residual correction
            # ------------------------------------------------

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


            # ------------------------------------------------
            # Convert velocity → displacement
            # ------------------------------------------------

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
                        np.radians(current_lat)
                    )
                )
            )


            predicted_lat = (
                current_lat + delta_lat
            )

            predicted_lon = (
                current_lon + delta_lon
            )


            # ------------------------------------------------
            # Prototype uncertainty
            # ------------------------------------------------

            uncertainty_km = (
                2.0
                + 0.05 * hours_ahead
                + 0.5
                * np.sqrt(
                    hybrid_u ** 2
                    + hybrid_v ** 2
                )
                * hours_ahead
            )


            prediction_rows.append({
                "iceberg_id": iceberg_id,

                "current_timestamp":
                    current_time.strftime(
                        "%Y-%m-%dT%H:%M:%SZ"
                    ),

                "current_latitude":
                    round(current_lat, 6),

                "current_longitude":
                    round(current_lon, 6),

                "prediction_timestamp":
                    target_time.strftime(
                        "%Y-%m-%dT%H:%M:%SZ"
                    ),

                "forecast_hours":
                    hours_ahead,

                "predicted_latitude":
                    round(
                        float(predicted_lat),
                        6
                    ),

                "predicted_longitude":
                    round(
                        float(predicted_lon),
                        6
                    ),

                "uncertainty_km":
                    round(
                        float(uncertainty_km),
                        2
                    ),

                "model":
                    "physics_ml_hybrid"
            })


# ============================================================
# 6. CREATE DATAFRAME
# ============================================================

output = pd.DataFrame(
    prediction_rows
)


# ============================================================
# 7. SAVE CSV
# ============================================================

output.to_csv(
    "iceberg_prediction_dataset.csv",
    index=False
)


# ============================================================
# 8. SUMMARY
# ============================================================

print("\n" + "=" * 65)
print("PREDICTION DATASET READY")
print("=" * 65)

print(
    "Rows:",
    len(output)
)

print(
    "Icebergs:",
    output["iceberg_id"].nunique()
)

print(
    "Prediction horizons:",
    sorted(
        output["forecast_hours"].unique()
    )
)

print("\nSaved:")
print("iceberg_prediction_dataset.csv")

print("\nFirst 10 rows:")
print(
    output.head(10).to_string(
        index=False
    )
)