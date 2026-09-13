from preprocess import load_all_icebergs
from features import calculate_movement

df = load_all_icebergs("../../data/icebergs")

df = calculate_movement(df)

print("\nICEBERGS:", df["iceberg_id"].nunique())
print("OBSERVATIONS:", len(df))

print("\nMOVEMENT SAMPLE:")
print(
    df[
        [
            "iceberg_id",
            "timestamp",
            "latitude",
            "longitude",
            "dt_hours",
            "distance_km",
            "speed_kmh"
        ]
    ].dropna().head(10)
)

print("\nSPEED STATISTICS:")
print(df["speed_kmh"].describe())