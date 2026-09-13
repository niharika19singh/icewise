import numpy as np


def physics_prediction(
    latitude,
    longitude,
    ocean_u,
    ocean_v,
    wind_u,
    wind_v,
    dt_hours,
    ocean_weight=0.8,
    wind_weight=0.2
):
    """
    Estimate iceberg movement using ocean current + wind.

    ocean_u, ocean_v : ocean current components (m/s)
    wind_u, wind_v   : wind components (m/s)
    """

    # Effective iceberg velocity
    velocity_u = (
        ocean_weight * ocean_u +
        wind_weight * wind_u
    )

    velocity_v = (
        ocean_weight * ocean_v +
        wind_weight * wind_v
    )

    # Convert m/s → km
    dt_seconds = dt_hours * 3600

    displacement_east_km = (
        velocity_u * dt_seconds / 1000
    )

    displacement_north_km = (
        velocity_v * dt_seconds / 1000
    )

    # Convert km → degrees
    delta_lat = displacement_north_km / 111.0

    delta_lon = (
        displacement_east_km /
        (111.0 * np.cos(np.radians(latitude)))
    )

    predicted_latitude = latitude + delta_lat
    predicted_longitude = longitude + delta_lon

    return predicted_latitude, predicted_longitude