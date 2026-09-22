import numpy as np
import pandas as pd

from sklearn.ensemble import RandomForestRegressor


# ==================================================
# 1. LOAD TRAINING DATA
# ==================================================

df = pd.read_csv(
    "iceberg_training_data_2020.csv"
)

df["timestamp"] = pd.to_datetime(
    df["timestamp"]
)

df = df.sort_values(
    ["iceberg_id", "timestamp"]
).reset_index(drop=True)


# ==================================================
# 2. SELECT ALL ICEBERGS IN CORRECTED WEDDELL DOMAIN
# ==================================================

df = df[
    (df["longitude"] >= -70) &
    (df["longitude"] <= -25) &
    (df["latitude"] >= -77.25) &
    (df["latitude"] <= -62)
].copy()


print("=" * 60)
print("BROADER WEDDELL-DOMAIN HYBRID PREDICTION MODEL")
print("=" * 60)

print(
    f"Total observations: {len(df)}"
)

print(
    f"Icebergs: {df['iceberg_id'].nunique()}"
)

print("\nIcebergs included:")

print(
    df.groupby("iceberg_id")
    .size()
    .sort_values(ascending=False)
)


# ==================================================
# 3. CREATE PREVIOUS POSITION
# ==================================================

df["prev_latitude"] = (
    df.groupby("iceberg_id")["latitude"]
    .shift(1)
)

df["prev_longitude"] = (
    df.groupby("iceberg_id")["longitude"]
    .shift(1)
)


# ==================================================
# 4. REMOVE INVALID FIRST OBSERVATIONS
# ==================================================

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


# ==================================================
# 5. REMOVE UNREALISTIC TIME GAPS
# ==================================================

df = df[
    (df["dt_hours"] > 0) &
    (df["dt_hours"] <= 48)
].copy()


# ==================================================
# 6. CHRONOLOGICAL TRAIN / TEST SPLIT
# ==================================================

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


print("\n" + "=" * 60)
print("CHRONOLOGICAL HOLDOUT")
print("=" * 60)

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

print(
    f"Training dates: "
    f"{train['timestamp'].min()} "
    f"to "
    f"{train['timestamp'].max()}"
)

print(
    f"Testing dates: "
    f"{test['timestamp'].min()} "
    f"to "
    f"{test['timestamp'].max()}"
)

print("\nTest observations by iceberg:")

print(
    test.groupby("iceberg_id")
    .size()
)


# ==================================================
# 7. CALIBRATE EAST-WEST PHYSICS MODEL
# ==================================================

X_u = np.column_stack([
    train["wind_u10"].values,
    np.ones(len(train))
])

coef_u = np.linalg.lstsq(
    X_u,
    train["observed_u"].values,
    rcond=None
)[0]


# ==================================================
# 8. CALIBRATE NORTH-SOUTH PHYSICS MODEL
# ==================================================

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


# ==================================================
# 9. PHYSICS PREDICTIONS
# ==================================================

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


# ==================================================
# 10. CREATE RESIDUAL TARGET
# ==================================================

train["residual_u"] = (
    train["observed_u"]
    - train["physics_u"]
)

train["residual_v"] = (
    train["observed_v"]
    - train["physics_v"]
)


# ==================================================
# 11. ML FEATURES
# ==================================================

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


# ==================================================
# 12. TRAIN RANDOM FOREST
# ==================================================

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


# ==================================================
# 13. PREDICT RESIDUAL
# ==================================================

predicted_residual = model.predict(
    X_test
)


# ==================================================
# 14. HYBRID VELOCITY
# ==================================================

test["hybrid_u"] = (
    test["physics_u"].values
    + predicted_residual[:, 0]
)

test["hybrid_v"] = (
    test["physics_v"].values
    + predicted_residual[:, 1]
)


# ==================================================
# 15. PHYSICS ERROR
# ==================================================

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


# ==================================================
# 16. HYBRID ERROR
# ==================================================

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


# ==================================================
# 17. MODEL METRICS
# ==================================================

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


# ==================================================
# 18. IMPROVEMENT CALCULATIONS
# ==================================================

mae_improvement = (
    (physics_mae - hybrid_mae)
    / physics_mae
) * 100

rmse_improvement = (
    (physics_rmse - hybrid_rmse)
    / physics_rmse
) * 100


# ==================================================
# 19. PRINT MODEL COMPARISON
# ==================================================

print("\n" + "=" * 60)
print("BROADER WEDDELL-DOMAIN MODEL COMPARISON")
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

print(
    f"\nMAE improvement: "
    f"{mae_improvement:.2f}%"
)

print(
    f"RMSE improvement: "
    f"{rmse_improvement:.2f}%"
)


# ==================================================
# 20. FEATURE IMPORTANCE
# ==================================================

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


# ==================================================
# 21. SAVE RESULTS
# ==================================================

test.to_csv(
    "hybrid_weddell_domain_test_results_2020.csv",
    index=False
)


print("\nSaved:")
print(
    "hybrid_weddell_domain_test_results_2020.csv"
)