from datetime import datetime

import requests

from config import OPENWEATHER_API_KEY
from db.session import AsyncSessionLocal
from repos.environment_repo import EnvironmentRepo
from sqlalchemy.ext.asyncio import AsyncSession


async def collect_environment_data(db: AsyncSession):
    repo = EnvironmentRepo(db)

    today = datetime.now().date()
    print(f"Collecting environmental data for: {today}")

    # Skip if environment data for today already exists
    if await repo.exists_for_date(today):
        print(f"Environment data for {today} already recorded. Skipping.")
        return

    # Link to today's workout if one exists — NULL on rest days
    row = await repo.get_workout_for_date(today, user_id=1)
    workout_id = row.workout_id if row else None
    workout_lat = row.start_latitude if row else None
    workout_lon = row.start_longitude if row else None
    workout_location_name = row.location if row else None

    if workout_id:
        print(f"Linking environment data to workout ID: {workout_id}")
    else:
        print("No workout today — recording environment data as standalone (rest day).")

    # Determine coordinates:
    # 1. Use workout GPS if available
    # 2. Fall back to IP geolocation
    if workout_lat and workout_lon:
        lat, lon = workout_lat, workout_lon
        print(f"Using workout GPS coordinates: {lat}, {lon}")
    else:
        try:
            geo = requests.get("https://ipinfo.io/json", timeout=5).json()
            lat, lon = map(float, geo["loc"].split(","))
            workout_location_name = geo.get("city", workout_location_name)
            print(f"Using IP geolocation: {workout_location_name} ({lat}, {lon})")
        except Exception as e:
            print(f"Warning: IP geolocation failed ({e}). Coordinates unavailable.")
            lat = lon = None

    if lat is None or lon is None:
        print("No coordinates available — cannot collect environment data.")
        return

    # Current weather
    weather_data = requests.get(
        f"https://api.openweathermap.org/data/2.5/weather"
        f"?lat={lat}&lon={lon}&units=metric&appid={OPENWEATHER_API_KEY}"
    ).json()

    # UV index
    uv_data = requests.get(
        f"https://api.openweathermap.org/data/2.5/onecall"
        f"?lat={lat}&lon={lon}&exclude=minutely,hourly,daily,alerts&appid={OPENWEATHER_API_KEY}"
    ).json()

    # Pollen (Open-Meteo Air Quality)
    try:
        pollen_data = requests.get(
            f"https://air-quality-api.open-meteo.com/v1/air-quality"
            f"?latitude={lat}&longitude={lon}"
            f"&current=grass_pollen,birch_pollen,ragweed_pollen",
            timeout=10,
        ).json().get("current", {})
        grass_pollen = pollen_data.get("grass_pollen")
        tree_pollen = pollen_data.get("birch_pollen")
        weed_pollen = pollen_data.get("ragweed_pollen")
    except Exception as e:
        print(f"Warning: Open-Meteo pollen unavailable ({e}). Storing NULL.")
        grass_pollen = tree_pollen = weed_pollen = None

    data = {
        "record_datetime": datetime.now(),
        "location": weather_data.get("name") or workout_location_name or "Unknown",
        "temperature": weather_data.get("main", {}).get("temp"),
        "wind_speed": weather_data.get("wind", {}).get("speed"),
        "wind_direction": weather_data.get("wind", {}).get("deg"),
        "humidity": weather_data.get("main", {}).get("humidity"),
        "precipitation": weather_data.get("rain", {}).get("1h", 0) if "rain" in weather_data else 0,
        "grass_pollen": grass_pollen,
        "tree_pollen": tree_pollen,
        "weed_pollen": weed_pollen,
        "uv_index": uv_data.get("current", {}).get("uvi", 0),
        "subjective_notes": "Daily environment check",
    }

    await repo.insert(workout_id, data)

    print(f"Environmental data for {data['location']} recorded successfully!")
    print(f"Temperature: {data['temperature']}°C, Wind: {data['wind_speed']} m/s at {data['wind_direction']}°")
    print(f"Humidity: {data['humidity']}%, Precipitation: {data['precipitation']} mm")
    print(f"Pollen — grass: {grass_pollen}, tree: {tree_pollen}, weed: {weed_pollen} grains/m³")
    print(f"UV Index: {data['uv_index']}")


if __name__ == "__main__":
    import asyncio

    async def main():
        async with AsyncSessionLocal() as db:
            await collect_environment_data(db)

    asyncio.run(main())