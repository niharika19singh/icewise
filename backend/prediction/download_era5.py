import cdsapi

client = cdsapi.Client()

client.retrieve(
    "reanalysis-era5-single-levels",
    {
        "product_type": "reanalysis",

        "variable": [
            "10m_u_component_of_wind",
            "10m_v_component_of_wind",
        ],

        "year": "2020",

        "month": [
            "06",
            "07",
            "08",
        ],

        "day": [
            "01", "02", "03", "04", "05",
            "06", "07", "08", "09", "10",
            "11", "12", "13", "14", "15",
            "16", "17", "18", "19", "20",
            "21", "22", "23", "24", "25",
            "26", "27", "28", "29", "30",
            "31",
        ],

        "time": [
            "00:00",
            "06:00",
            "12:00",
            "18:00",
        ],

        "data_format": "netcdf",
        "download_format": "unarchived",

        # Weddell Sea
        # North, West, South, East
        "area": [
            -62.0,
            -70.0,
            -77.25,
            -25.0,
        ],
    },

    "era5_weddell_wind_2020.nc",
)

print("Weddell ERA5 wind download complete.")