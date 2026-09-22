import json
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor


# ============================================================
# 1. LOAD DATA
# ============================================================

df = pd.read_csv("iceberg_training_data_2020.csv")

df["timestamp"] = pd.to_datetime(
    df["timestamp"],
    utc=True
)

df = df.sort_values(
    ["iceberg_id", "timestamp"]
).reset_index(drop=True)


# ============================================================
# 2. CREATE PREVIOUS-POSITION FEATURES
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
# 3. TRAINING DATA
# ============================================================

split_time = pd.Timestamp(
    "2020-10-01",
    tz="UTC"
)

train = df[
    df["timestamp"] < split_time
].copy()


# ============================================================
# 4. PHYSICS BASELINE
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


train["physics_u"] = (
    coef_u[0] * train["wind_u10"]
    + coef_u[1]
)

train["physics_v"] = (
    coef_v[0] * train["wind_v10"]
    + coef_v[1]
)


# ============================================================
# 5. RESIDUAL MODEL
# ============================================================

train["residual_u"] = (
    train["observed_u"]
    - train["physics_u"]
)

train["residual_v"] = (
    train["observed_v"]
    - train["physics_v"]
)

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


# ============================================================
# 6. MISSION REQUEST
# ============================================================

# Change these values for a different mission.
#
# The region defines the area in which we want to
# find relevant historical icebergs.

request = {
    "region": {
        "min_lat": -66.0,
        "max_lat": -64.0,
        "min_lon": 100.0,
        "max_lon": 115.0
    },

    "start_time": "2020-07-20T00:00:00Z",

    "horizon_hours": [
        24,
        48,
        72
    ]
}


# ============================================================
# 7. VALIDATE REQUEST
# ============================================================

region = request["region"]

min_lat = float(region["min_lat"])
max_lat = float(region["max_lat"])
min_lon = float(region["min_lon"])
max_lon = float(region["max_lon"])

start_time = pd.Timestamp(
    request["start_time"],
    tz="UTC"
)

horizon_hours = request["horizon_hours"]


# Latitude validation
if not (-90 <= min_lat <= 90 and -90 <= max_lat <= 90):
    output = {
        "status": "INVALID_REQUEST",
        "reason": "Latitude must be between -90 and 90 degrees."
    }

    print(json.dumps(output, indent=2))
    raise SystemExit


# Longitude validation
if not (-180 <= min_lon <= 180 and -180 <= max_lon <= 180):
    output = {
        "status": "INVALID_REQUEST",
        "reason": "Longitude must be between -180 and 180 degrees."
    }

    print(json.dumps(output, indent=2))
    raise SystemExit


# Bounding-box validation
if min_lat >= max_lat:
    output = {
        "status": "INVALID_REQUEST",
        "reason": "min_lat must be smaller than max_lat."
    }

    print(json.dumps(output, indent=2))
    raise SystemExit


if min_lon >= max_lon:
    output = {
        "status": "INVALID_REQUEST",
        "reason": "min_lon must be smaller than max_lon."
    }

    print(json.dumps(output, indent=2))
    raise SystemExit


# Horizon validation
if not horizon_hours:
    output = {
        "status": "INVALID_REQUEST",
        "reason": "No prediction horizon provided."
    }

    print(json.dumps(output, indent=2))
    raise SystemExit


if any(
    not isinstance(h, (int, float)) or h <= 0
    for h in horizon_hours
):
    output = {
        "status": "INVALID_REQUEST",
        "reason": "Prediction horizons must be positive numbers."
    }

    print(json.dumps(output, indent=2))
    raise SystemExit


# Prevent absurdly large prediction requests
if max(horizon_hours) > 72:
    output = {
        "status": "INVALID_REQUEST",
        "reason": "Maximum supported prediction horizon is 72 hours."
    }

    print(json.dumps(output, indent=2))
    raise SystemExit


# Prevent absurdly large geographical requests
if (
    (max_lat - min_lat) > 15
    or
    (max_lon - min_lon) > 30
):
    output = {
        "status": "INVALID_REQUEST",
        "reason": "Requested region is too large for the current prototype."
    }

    print(json.dumps(output, indent=2))
    raise SystemExit


# ============================================================
# 8. CHECK GLOBAL DATA COVERAGE
# ============================================================

global_start = df["timestamp"].min()
global_end = df["timestamp"].max()

if (
    start_time < global_start
    or
    start_time > global_end
):

    output = {
        "status": "NO_COVERAGE",
        "reason": "Requested date is outside supported data coverage.",
        "requested_start": start_time.strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        ),
        "supported_start": global_start.strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        ),
        "supported_end": global_end.strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
    }

    print(json.dumps(output, indent=2))
    raise SystemExit


# ============================================================
# 9. FIND ICEBERGS IN MISSION REGION
# ============================================================

regional_data = df[
    (df["latitude"] >= min_lat) &
    (df["latitude"] <= max_lat) &
    (df["longitude"] >= min_lon) &
    (df["longitude"] <= max_lon) &
    (df["timestamp"] == start_time)
].copy()


if len(regional_data) == 0:

    output = {
        "status": "NO_COVERAGE",
        "reason": (
            "No iceberg observations are available "
            "inside the requested region at the requested time."
        ),
        "region": region,
        "requested_start": start_time.strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
    }

    print(json.dumps(output, indent=2))
    raise SystemExit


iceberg_ids = (
    regional_data["iceberg_id"]
    .drop_duplicates()
    .tolist()
)


# ============================================================
# 10. GENERATE PREDICTIONS
# ============================================================

results = []


for iceberg_id in iceberg_ids:

    iceberg_data = df[
        df["iceberg_id"] == iceberg_id
    ].copy()

    scenario = iceberg_data[
        iceberg_data["timestamp"] == start_time
    ].copy()

    if len(scenario) == 0:
        continue

    current = scenario.iloc[0]

    current_lat = float(
        current["latitude"]
    )

    current_lon = float(
        current["longitude"]
    )

    previous_lat = current_lat
    previous_lon = current_lon

    lat = current_lat
    lon = current_lon

    predictions = []

    future_data = iceberg_data[
        iceberg_data["timestamp"] > start_time
    ].copy()

    future_data = future_data.sort_values(
        "timestamp"
    )


    # --------------------------------------------------------
    # Predict requested horizons
    # --------------------------------------------------------

    for hours_ahead in horizon_hours:

        target_time = (
            start_time
            + pd.Timedelta(
                hours=hours_ahead
            )
        )

        available = future_data[
            future_data["timestamp"] <= target_time
        ]

        if len(available) == 0:
            continue

        forcing = available.iloc[-1]

        dt_hours = float(
            (
                target_time
                - start_time
            )
            / pd.Timedelta(hours=1)
        )


        # ----------------------------------------------------
        # Physics
        # ----------------------------------------------------

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


        # ----------------------------------------------------
        # ML residual correction
        # ----------------------------------------------------

        ml_input = pd.DataFrame([{

            "wind_u10":
                forcing["wind_u10"],

            "wind_v10":
                forcing["wind_v10"],

            "prev_latitude":
                previous_lat,

            "prev_longitude":
                previous_lon,

            "dt_hours":
                dt_hours
        }])


        residual = model.predict(
            ml_input
        )[0]


        hybrid_u = (
            physics_u
            + residual[0]
        )

        hybrid_v = (
            physics_v
            + residual[1]
        )


        # ----------------------------------------------------
        # Convert velocity → displacement
        # ----------------------------------------------------

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
            north_km
            / 111.0
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


        # ----------------------------------------------------
        # Uncertainty
        # ----------------------------------------------------

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


        predictions.append({

            "timestamp":
                target_time.strftime(
                    "%Y-%m-%dT%H:%M:%SZ"
                ),

            "latitude":
                round(
                    lat,
                    6
                ),

            "longitude":
                round(
                    lon,
                    6
                ),

            "forecast_hours":
                hours_ahead,

            "uncertainty_km":
                round(
                    float(
                        uncertainty_km
                    ),
                    2
                )
        })


        previous_lat = lat
        previous_lon = lon


    # --------------------------------------------------------
    # Only include iceberg if we generated predictions
    # --------------------------------------------------------

    if predictions:

        results.append({

            "iceberg_id":
                iceberg_id,

            "current_state": {

                "timestamp":
                    start_time.strftime(
                        "%Y-%m-%dT%H:%M:%SZ"
                    ),

                "latitude":
                    round(
                        current_lat,
                        6
                    ),

                "longitude":
                    round(
                        current_lon,
                        6
                    )
            },

            "predictions":
                predictions,

            "model":
                "physics_ml_hybrid"

        })


# ============================================================
# 11. FINAL RESULT
# ============================================================

if len(results) == 0:

    output = {
        "status": "NO_COVERAGE",
        "reason": (
            "Icebergs were found in the region, "
            "but sufficient future forcing data "
            "was unavailable for prediction."
        )
    }

else:

    output = {

        "status": "OK",

        "mission": {

            "region": region,

            "start_time":
                start_time.strftime(
                    "%Y-%m-%dT%H:%M:%SZ"
                ),

            "horizon_hours":
                horizon_hours
        },

        "icebergs":
            results,

        "model":
            "physics_ml_hybrid",

        "prediction_mode":
            "historical_replay"
    }


# ============================================================
# 12. SAVE OUTPUT
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
print("ICEBERG MISSION PREDICTION")
print("=" * 60)

print(
    json.dumps(
        output,
        indent=2
    )
)

print("\nSaved:")
print("iceberg_prediction_output.json")