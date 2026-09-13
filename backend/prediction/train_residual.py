import numpy as np
import pandas as pd

from sklearn.ensemble import RandomForestRegressor


# --------------------------------------------------
# 1. LOAD CALIBRATED PHYSICS DATA
# --------------------------------------------------

df = pd.read_csv("c18b_physics_calibrated.csv")

df["timestamp"] = pd.to_datetime(df["timestamp"])

df = df.sort_values("timestamp").reset_index(drop=True)


# --------------------------------------------------
# 2. CREATE RESIDUAL TARGET
# --------------------------------------------------
#
# Residual = observed velocity - physics velocity
#
# The ML model learns what the physics model
# fails to explain.
# --------------------------------------------------

df["residual_u"] = (
    df["observed_u"] -
    df["predicted_u"]
)

df["residual_v"] = (
    df["observed_v"] -
    df["predicted_v"]
)


# --------------------------------------------------
# 3. CREATE PAST-STATE FEATURES
# --------------------------------------------------
#
# IMPORTANT:
# We must only use information available BEFORE
# the movement we are trying to predict.
#
# Therefore:
#
# prev_latitude
# prev_longitude
#
# are used instead of the current/future position.
# --------------------------------------------------

df["prev_latitude"] = (
    df["latitude"].shift(1)
)

df["prev_longitude"] = (
    df["longitude"].shift(1)
)


# --------------------------------------------------
# 4. SELECT ML FEATURES
# --------------------------------------------------

features = [
    "wind_u10",
    "wind_v10",
    "prev_latitude",
    "prev_longitude",
    "dt_hours"
]


# Remove rows where previous state is unavailable
df = df.dropna(
    subset=features + [
        "residual_u",
        "residual_v"
    ]
).copy()


X = df[features]

y = df[
    [
        "residual_u",
        "residual_v"
    ]
]


# --------------------------------------------------
# 5. CHRONOLOGICAL TRAIN / TEST SPLIT
# --------------------------------------------------
#
# Earlier observations -> training
# Later observations  -> testing
#
# We do NOT randomly shuffle the data because
# this is a time-series prediction problem.
# --------------------------------------------------

split_index = int(len(df) * 0.70)

X_train = X.iloc[:split_index]
X_test = X.iloc[split_index:]

y_train = y.iloc[:split_index]
y_test = y.iloc[split_index:]


print("=" * 55)
print("RESIDUAL ML MODEL")
print("=" * 55)

print(f"Total observations : {len(df)}")
print(f"Training           : {len(X_train)}")
print(f"Testing            : {len(X_test)}")


# --------------------------------------------------
# 6. TRAIN RANDOM FOREST
# --------------------------------------------------

model = RandomForestRegressor(
    n_estimators=200,
    max_depth=5,
    min_samples_leaf=2,
    random_state=42
)


model.fit(
    X_train,
    y_train
)


# --------------------------------------------------
# 7. PREDICT RESIDUALS
# --------------------------------------------------

predicted_residual = model.predict(X_test)


predicted_residual_u = (
    predicted_residual[:, 0]
)

predicted_residual_v = (
    predicted_residual[:, 1]
)


# --------------------------------------------------
# 8. HYBRID VELOCITY
# --------------------------------------------------
#
# Hybrid prediction =
#
# Physics prediction
# +
# ML residual correction
# --------------------------------------------------

physics_u = (
    df["predicted_u"]
    .iloc[split_index:]
    .values
)

physics_v = (
    df["predicted_v"]
    .iloc[split_index:]
    .values
)


hybrid_u = (
    physics_u +
    predicted_residual_u
)

hybrid_v = (
    physics_v +
    predicted_residual_v
)


# --------------------------------------------------
# 9. ACTUAL VELOCITY
# --------------------------------------------------

actual_u = (
    df["observed_u"]
    .iloc[split_index:]
    .values
)

actual_v = (
    df["observed_v"]
    .iloc[split_index:]
    .values
)


# --------------------------------------------------
# 10. CALCULATE VELOCITY ERRORS
# --------------------------------------------------

physics_error = np.sqrt(
    (actual_u - physics_u) ** 2 +
    (actual_v - physics_v) ** 2
)


hybrid_error = np.sqrt(
    (actual_u - hybrid_u) ** 2 +
    (actual_v - hybrid_v) ** 2
)


# --------------------------------------------------
# 11. CALCULATE METRICS
# --------------------------------------------------

physics_mae = np.mean(
    physics_error
)

hybrid_mae = np.mean(
    hybrid_error
)


physics_rmse = np.sqrt(
    np.mean(
        physics_error ** 2
    )
)

hybrid_rmse = np.sqrt(
    np.mean(
        hybrid_error ** 2
    )
)


# --------------------------------------------------
# 12. PRINT MODEL COMPARISON
# --------------------------------------------------

print("\n" + "=" * 55)
print("MODEL COMPARISON")
print("=" * 55)

print(
    f"\nPhysics MAE  : "
    f"{physics_mae:.6f} m/s"
)

print(
    f"Hybrid MAE   : "
    f"{hybrid_mae:.6f} m/s"
)

print(
    f"\nPhysics RMSE : "
    f"{physics_rmse:.6f} m/s"
)

print(
    f"Hybrid RMSE  : "
    f"{hybrid_rmse:.6f} m/s"
)


# --------------------------------------------------
# 13. CALCULATE IMPROVEMENT
# --------------------------------------------------

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
# 14. FEATURE IMPORTANCE
# --------------------------------------------------

importance = pd.DataFrame({
    "feature": features,
    "importance": model.feature_importances_
})

importance = importance.sort_values(
    "importance",
    ascending=False
)


print("\n" + "=" * 55)
print("FEATURE IMPORTANCE")
print("=" * 55)

print(
    importance.to_string(
        index=False
    )
)


# --------------------------------------------------
# 15. SAVE TEST RESULTS
# --------------------------------------------------

results = df.iloc[
    split_index:
].copy()


results["hybrid_u"] = hybrid_u

results["hybrid_v"] = hybrid_v

results["physics_error"] = physics_error

results["hybrid_error"] = hybrid_error


results.to_csv(
    "c18b_hybrid_results.csv",
    index=False
)


print("\nSaved:")
print("c18b_hybrid_results.csv")