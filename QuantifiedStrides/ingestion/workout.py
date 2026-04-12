from datetime import datetime, timedelta

import garminconnect
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import GARMIN_EMAIL, GARMIN_PASSWORD
from db.session import AsyncSessionLocal
from ingestion.okgarmin_connection import get_garmin_client, reset_garmin_client
from repos.workout_repo import WorkoutRepo


async def collect_workout_data(db: AsyncSession, user_id: int):
    try:
        # 1) Connect to Garmin
        try:
            client = get_garmin_client()
            activities = client.get_activities(0, 1)
        except garminconnect.GarminConnectAuthenticationError: #Restarts the Garmin client if connection fails
            client = reset_garmin_client()
            activities = client.get_activities(0, 1)


        repo = WorkoutRepo(db)

        for activity in activities:
            sport = activity.get("activityType", {}).get("typeKey", "Unknown")
            workout_type = activity.get("activityName", "Unknown")

            start_time_str = activity.get("startTimeLocal", None)
            if start_time_str:
                try:
                    start_time_dt = datetime.strptime(start_time_str, "%Y-%m-%dT%H:%M:%S")
                except ValueError:
                    start_time_dt = datetime.strptime(start_time_str, "%Y-%m-%d %H:%M:%S")

            # Skip if already recorded
            if await repo.get_by_start_time(user_id, start_time_dt):
                print(f"Workout at {start_time_dt} already recorded. Skipping.")
                continue

            workout_date = start_time_dt.date()
            duration_seconds = activity.get("duration", 0.0)
            end_time_dt = start_time_dt + timedelta(seconds=float(duration_seconds))

            data = {
                "sport":                      sport,
                "start_time":                 start_time_dt,
                "end_time":                   end_time_dt,
                "workout_type":               workout_type,
                "workout_date":               workout_date,
                "calories_burned":            activity.get("calories", 0),
                "avg_heart_rate":             activity.get("averageHR", 0),
                "max_heart_rate":             activity.get("maxHR", 0),
                "vo2max_estimate":            activity.get("vO2MaxValue"),
                "lactate_threshold_bpm":      activity.get("lactateThresholdBpm"),
                "zone_1":                     activity.get("hrTimeInZone_1", 0.0),
                "zone_2":                     activity.get("hrTimeInZone_2", 0.0),
                "zone_3":                     activity.get("hrTimeInZone_3", 0.0),
                "zone_4":                     activity.get("hrTimeInZone_4", 0.0),
                "zone_5":                     activity.get("hrTimeInZone_5", 0.0),
                "training_volume":            activity.get("distance", 0.0),
                "avg_vertical_oscillation":   activity.get("avgVerticalOscillation"),
                "avg_ground_contact_time":    activity.get("avgGroundContactTime"),
                "avg_stride_length":          activity.get("avgStrideLength"),
                "avg_vertical_ratio":         activity.get("avgVerticalRatio"),
                "avg_running_cadence":        activity.get("averageRunningCadenceInStepsPerMinute"),
                "max_running_cadence":        activity.get("maxRunningCadenceInStepsPerMinute"),
                "location":                   activity.get("locationName", "Unknown"),
                "start_latitude":             activity.get("startLatitude"),
                "start_longitude":            activity.get("startLongitude"),
                "elevation_gain":             activity.get("elevationGain"),
                "elevation_loss":             activity.get("elevationLoss"),
                "aerobic_training_effect":    activity.get("aerobicTrainingEffect"),
                "anaerobic_training_effect":  activity.get("anaerobicTrainingEffect"),
                "training_stress_score":      activity.get("trainingStressScore"),
                "normalized_power":           activity.get("normalizedPower"),
                "avg_power":                  activity.get("avgPower"),
                "max_power":                  activity.get("maxPower"),
                "total_steps":                activity.get("steps"),
            }

            workout_id = await repo.upsert_workout(user_id, data)
            print(f"Workout saved with ID: {workout_id} for date: {workout_date}")

        print("All activities inserted successfully!")
        return True

    except Exception as e:
        print(f"Error collecting workout data: {e}")
        return False


if __name__ == "__main__":
    import asyncio

    async def main():
        async with AsyncSessionLocal() as db:
            await collect_workout_data(db, user_id=1)

    asyncio.run(main())