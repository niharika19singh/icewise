import numpy as np
import pandas as pd

from sklearn.ensemble import RandomForestRegressor


# --------------------------------------------------
# 1. LOAD TRAINING DATA
# --------------------------------------------------

df = pd.read_csv(
    "iceberg_training_data_2020.csv"
)

df["timestamp"] = pd.to_datetime(
    df["timestamp"]
)

df = df.sort_values(
    ["iceberg_id", "timestamp"]
).reset_index(drop=True)


# --------------------------------------------------
# 2. CREATE PREVIOUS POSITION
# --------------------------------------------------

df["prev_latitude"] = (
    df.groupby("iceberg_id")["latitude"]
    .shift(1)
)

df["prev_longitude"] = (
    df.groupby("iceberg_id")["longitude"]
    .shift(1)
)


# --------------------------------------------------
# 3. REMOVE INVALID FIRST OBSERVATIONS
# --------------------------------------------------

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


# --------------------------------------------------
# 4. REMOVE UNREALISTIC TIME GAPS
# --------------------------------------------------

df = df[
    (df["dt_hours"] > 0) &
    (df["dt_hours"] <= 48)
].copy()


# --------------------------------------------------
# 5. CALIBRATE PHYSICS MODEL
# --------------------------------------------------
#
# We estimate the relationship between wind and
# observed iceberg velocity using the TRAINING
# PERIOD ONLY.
#
# This prevents test-period information leaking
# into the model.
# --------------------------------------------------

split_time = pd.Timestamp(
    "2020-10-01"
)


train_mask = (
    df["timestamp"] < split_time
)

test_mask = (
    df["timestamp"] >= split_time
)


train = df[train_mask].copy()

test = df[test_mask].copy()


print("=" * 60)
print("ICEBERG HYBRID PREDICTION MODEL")
print("=" * 60)

print(
    f"Total observations : {len(df)}"
)

print(
    f"Training observations: {len(train)}"
)

print(
    f"Testing observations : {len(test)}"
)

print(
    f"Training icebergs: "
    f"{train['iceberg_id'].nunique()}"
)

print(
    f"Testing icebergs: "
    f"{test['iceberg_id'].nunique()}"
)


# --------------------------------------------------
# 6. CALIBRATE EAST-WEST PHYSICS
# --------------------------------------------------

X_u = np.column_stack([
    train["wind_u10"].values,
    np.ones(len(train))
])

coef_u = np.linalg.lstsq(
    X_u,
    train["observed_u"].values,
    rcond=None
)[0]


# --------------------------------------------------
# 7. CALIBRATE NORTH-SOUTH PHYSICS
# --------------------------------------------------

X_v = np.column_stack([
    train["wind_v10"].values,
    np.ones(len(train))
])

coef_v = np.linalg.lstsq(
    X_v,
    train["observed_v"].values,
    rcond=None
)[0]


print("\n" + "=" * 60)
print("CALIBRATED PHYSICS MODEL")
print("=" * 60)

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
# 8. PHYSICS PREDICTIONS
# --------------------------------------------------

train["physics_u"] = (
    coef_u[0] * train["wind_u10"]
    + coef_u[1]
)

train["physics_v"] = (
    coef_v[0] * train["wind_v10"]
    + coef_v[1]
)


test["physics_u"] = (
    coef_u[0] * test["wind_u10"]
    + coef_u[1]
)

test["physics_v"] = (
    coef_v[0] * test["wind_v10"]
    + coef_v[1]
)


# --------------------------------------------------
# 9. CREATE RESIDUAL TARGET
# --------------------------------------------------

train["residual_u"] = (
    train["observed_u"] -
    train["physics_u"]
)

train["residual_v"] = (
    train["observed_v"] -
    train["physics_v"]
)


# --------------------------------------------------
# 10. ML FEATURES
# --------------------------------------------------

features = [
    "wind_u10",
    "wind_v10",
    "prev_latitude",
    "prev_longitude",
    "dt_hours"
]


X_train = train[features]

X_test = test[features]


y_train = train[
    [
        "residual_u",
        "residual_v"
    ]
]


# --------------------------------------------------
# 11. TRAIN RANDOM FOREST
# --------------------------------------------------

print("\nTraining Random Forest...")


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


# --------------------------------------------------
# 12. PREDICT RESIDUAL
# --------------------------------------------------

predicted_residual = model.predict(
    X_test
)


# --------------------------------------------------
# 13. HYBRID VELOCITY
# --------------------------------------------------

test["hybrid_u"] = (
    test["physics_u"].values
    + predicted_residual[:, 0]
)

test["hybrid_v"] = (
    test["physics_v"].values
    + predicted_residual[:, 1]
)


# --------------------------------------------------
# 14. PHYSICS ERROR
# --------------------------------------------------

test["physics_error"] = np.sqrt(
    (
        test["observed_u"]
        - test["physics_u"]
    ) ** 2
    +
    (
        test["observed_v"]
        - test["physics_v"]
    ) ** 2
)


# --------------------------------------------------
# 15. HYBRID ERROR
# --------------------------------------------------

test["hybrid_error"] = np.sqrt(
    (
        test["observed_u"]
        - test["hybrid_u"]
    ) ** 2
    +
    (
        test["observed_v"]
        - test["hybrid_v"]
    ) ** 2
)


# --------------------------------------------------
# 16. MODEL METRICS
# --------------------------------------------------

physics_mae = (
    test["physics_error"].mean()
)

hybrid_mae = (
    test["hybrid_error"].mean()
)


physics_rmse = np.sqrt(
    np.mean(
        test["physics_error"] ** 2
    )
)

hybrid_rmse = np.sqrt(
    np.mean(
        test["hybrid_error"] ** 2
    )
)


# --------------------------------------------------
# 17. PRINT RESULTS
# --------------------------------------------------

print("\n" + "=" * 60)
print("MODEL COMPARISON")
print("=" * 60)

print(
    f"\nPhysics MAE : "
    f"{physics_mae:.6f} m/s"
)

print(
    f"Hybrid MAE  : "
    f"{hybrid_mae:.6f} m/s"
)

print(
    f"\nPhysics RMSE: "
    f"{physics_rmse:.6f} m/s"
)

print(
    f"Hybrid RMSE : "
    f"{hybrid_rmse:.6f} m/s"
)


if physics_mae > 0:

    improvement = (
        (physics_mae - hybrid_mae)
        / physics_mae
    ) * 100

    print(
        f"\nHybrid improvement: "
        f"{improvement:.2f}%"
    )


# --------------------------------------------------
# 18. FEATURE IMPORTANCE
# --------------------------------------------------

importance = pd.DataFrame({
    "feature": features,
    "importance": model.feature_importances_
})

importance = importance.sort_values(
    "importance",
    ascending=False
)


print("\n" + "=" * 60)
print("FEATURE IMPORTANCE")
print("=" * 60)

print(
    importance.to_string(
        index=False
    )
)


# --------------------------------------------------
# 19. SAVE RESULTS
# --------------------------------------------------

test.to_csv(
    "hybrid_test_results_2020.csv",
    index=False
)


print("\nSaved:")
print("hybrid_test_results_2020.csv")