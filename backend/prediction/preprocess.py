import pandas as pd
from pathlib import Path


def load_all_icebergs(data_folder):
    data_folder = Path(data_folder)

    all_tracks = []
    skipped = 0

    for csv_file in data_folder.glob("*.csv"):
        iceberg_id = csv_file.stem.upper()

        try:
            df = pd.read_csv(csv_file)

            # Different iceberg files can have different columns.
            # Use NIC coordinates only when available.
            if "nic_1" not in df.columns or "nic_2" not in df.columns:
                skipped += 1
                continue

            df["timestamp"] = pd.to_datetime(
                df["date"].astype(str),
                format="%Y%j",
                errors="coerce"
            )

            df = df[
                df["timestamp"].notna() &
                (df["nic_1"] != 0) &
                (df["nic_2"] != 0)
            ].copy()

            if len(df) == 0:
                continue

            df = df.rename(columns={
                "nic_1": "latitude",
                "nic_2": "longitude"
            })

            df["iceberg_id"] = iceberg_id

            # Size columns are optional
            if "size_1" not in df.columns:
                df["size_1"] = None

            if "size_2" not in df.columns:
                df["size_2"] = None

            all_tracks.append(
                df[
                    [
                        "iceberg_id",
                        "timestamp",
                        "latitude",
                        "longitude",
                        "size_1",
                        "size_2"
                    ]
                ]
            )

        except Exception:
            skipped += 1

    if not all_tracks:
        raise ValueError("No valid iceberg CSV files found.")

    combined = pd.concat(all_tracks, ignore_index=True)

    combined = combined.sort_values(
        ["iceberg_id", "timestamp"]
    ).reset_index(drop=True)

    print(f"Loaded iceberg tracks: {combined['iceberg_id'].nunique()}")
    print(f"Skipped incompatible files: {skipped}")

    return combined


if __name__ == "__main__":
    print("Iceberg preprocessing module ready.")