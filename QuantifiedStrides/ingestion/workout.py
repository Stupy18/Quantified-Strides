from datetime import datetime, timedelta

import garminconnect
from sqlalchemy.ext.asyncio import AsyncSession

from db.engine import AsyncSessionLocal
from ingestion.okgarmin_connection import get_garmin_client, reset_garmin_client
from repos.workout_repo import WorkoutRepo

_RUNNING_SPORTS = {"running", "trail_running"}
_POWER_SPORTS   = {"cycling", "mountain_biking", "indoor_cycling", "road_cycling"}


async def collect_workout_data(db: AsyncSession, user_id: int, client: garminconnect.Garmin):
    try:
        try:
            activities = client.get_activities(0, 1)
        except garminconnect.GarminConnectAuthenticationError:  # token expired mid-session
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
                "sport":                     sport,
                "start_time":                start_time_dt,
                "end_time":                  end_time_dt,
                "workout_type":              workout_type,
                "workout_date":              workout_date,
                "calories_burned":           activity.get("calories", 0),
                "avg_heart_rate":            activity.get("averageHR", 0),
                "max_heart_rate":            activity.get("maxHR", 0),
                "vo2max_estimate":           activity.get("vO2MaxValue"),
                "lactate_threshold_bpm":     activity.get("lactateThresholdBpm"),
                "distance_m":                activity.get("distance", 0.0),
                "avg_cadence":               activity.get("averageRunningCadenceInStepsPerMinute")
                                             or activity.get("averageBikingCadenceInRevPerMinute"),
                "location":                  activity.get("locationName", "Unknown"),
                "start_latitude":            activity.get("startLatitude"),
                "start_longitude":           activity.get("startLongitude"),
                "elevation_gain":            activity.get("elevationGain"),
                "elevation_loss":            activity.get("elevationLoss"),
                "aerobic_training_effect":   activity.get("aerobicTrainingEffect"),
                "anaerobic_training_effect": activity.get("anaerobicTrainingEffect"),
                "total_steps":               activity.get("steps"),
                # T2-A: canonical Garmin key
                "garmin_activity_id":        activity.get("activityId"),
                # T2-G: training adaptation label + load score
                "primary_benefit":           activity.get("primaryBenefit"),
                "training_load_score":       activity.get("activityTrainingLoad"),
                # T4-C: respiration summary
                "avg_respiration_rate":      activity.get("avgRespirationRate"),
                "max_respiration_rate":      activity.get("maxRespirationRate"),
            }

            workout_id = await repo.upsert_workout(user_id, data)
            print(f"Workout saved with ID: {workout_id} for date: {workout_date}")

            # HR zones — all sports
            zones = {}
            for i in range(1, 6):
                val = activity.get(f"hrTimeInZone_{i}")
                if val is not None:
                    zones[i] = int(float(val))
            await repo.upsert_hr_zones(workout_id, zones)

            # Running biomechanics — T3-A
            if sport in _RUNNING_SPORTS:
                bio = {
                    "avg_vertical_oscillation": activity.get("avgVerticalOscillation"),
                    "avg_stance_time":           activity.get("avgGroundContactTime"),
                    "avg_stride_length":        activity.get("avgStrideLength"),
                    "avg_vertical_ratio":       activity.get("avgVerticalRatio"),
                    "avg_running_cadence":      activity.get("averageRunningCadenceInStepsPerMinute"),
                    "max_running_cadence":      activity.get("maxRunningCadenceInStepsPerMinute"),
                }
                await repo.upsert_run_biomechanics(workout_id, bio)

            # Power summary — T3-B
            power = {
                "normalized_power":      activity.get("normalizedPower"),
                "avg_power":             activity.get("avgPower"),
                "max_power":             activity.get("maxPower"),
                "training_stress_score": activity.get("trainingStressScore"),
            }
            await repo.upsert_power_summary(workout_id, power)

        print("All activities inserted successfully!")
        return True

    except Exception as e:
        print(f"Error collecting workout data: {e}")
        return False


if __name__ == "__main__":
    import asyncio

    async def main():
        async with AsyncSessionLocal() as db:
            await collect_workout_data(db, user_id=1, client=get_garmin_client())

    asyncio.run(main())
