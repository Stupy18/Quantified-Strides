from datetime import datetime, timedelta

import garminconnect
from sqlalchemy.ext.asyncio import AsyncSession

from db.engine import AsyncSessionLocal
from ingestion.okgarmin_connection import get_garmin_client, reset_garmin_client
from repos.workout_repo import WorkoutRepo

_RUNNING_SPORTS = {"running", "trail_running"}
_POWER_SPORTS   = {"cycling", "mountain_biking", "indoor_cycling", "road_cycling"}


async def _compute_post_sync_signals(db: AsyncSession, user_id: int) -> None:
    """
    Compute and store per-workout signals after ingestion completes:
    TRIMP, hr_stability_last_10min, terrain_type, fatigue_index.
    Errors are logged but do not propagate — ingestion already succeeded.
    """
    from intelligence.training_load import compute_trimp
    from intelligence.analytics.biomechanics import (
        compute_hr_stability, classify_terrain, compute_fatigue_index,
    )
    from repos.sleep_repo import SleepRepo
    from repos.workout_metrics_repo import WorkoutMetricsRepo
    from repos.recommendation_repo import RecommendationRepo

    workout_repo = WorkoutRepo(db)
    sleep_repo = SleepRepo(db)
    metrics_repo = WorkoutMetricsRepo(db)
    rec_repo = RecommendationRepo(db)

    from datetime import date, timedelta as td
    today = date.today()
    since = today - td(days=7)

    # Load user profile for TRIMP parameters
    from repos.user_repo import UserRepo
    user_repo = UserRepo(db)
    profile = await user_repo.get_profile_signals(user_id)
    max_hr = float(profile.max_hr) if profile and profile.max_hr else None
    sex = (profile.sex if profile and profile.sex else "prefer_not_to_say")

    resting_hr = await sleep_repo.get_resting_hr(user_id, today)
    if resting_hr is None:
        resting_hr = 50.0  # fallback when no sleep data yet

    # Process workouts that need TRIMP written
    workouts_needing_trimp = await workout_repo.get_recent_workout_for_trimp(user_id, since)
    for w in workouts_needing_trimp:
        try:
            if w.avg_heart_rate and w.duration_min and max_hr:
                trimp = compute_trimp(
                    float(w.duration_min),
                    float(w.avg_heart_rate),
                    resting_hr,
                    max_hr,
                    sex,
                )
                await workout_repo.upsert_trimp(w.workout_id, trimp)
        except Exception as e:
            print(f"TRIMP compute error for workout {w.workout_id}: {e}")

    # Process running workouts for hr_stability, terrain, fatigue_index
    running_workouts = await workout_repo.get_running_workouts_for_signal_compute(user_id, since)
    for w in running_workouts:
        try:
            hr_series = await metrics_repo.get_final_10min_hr(w.workout_id)
            stability = compute_hr_stability(hr_series)
            await workout_repo.upsert_hr_stability(w.workout_id, stability)
        except Exception as e:
            print(f"HR stability error for workout {w.workout_id}: {e}")

        try:
            gradient_series = await metrics_repo.get_gradient_series(w.workout_id)
            terrain = classify_terrain(gradient_series)
            await workout_repo.upsert_terrain_type(w.workout_id, terrain)
        except Exception as e:
            print(f"Terrain classify error for workout {w.workout_id}: {e}")

        try:
            terrain_type = w.terrain_type
            if terrain_type:
                baseline = await rec_repo.get_biomechanics_baseline(user_id, terrain_type)
                if baseline:
                    bio_summary = await metrics_repo.get_biomechanics_summary(w.workout_id)
                    if bio_summary and bio_summary.n_rows > 0:
                        fi = compute_fatigue_index(
                            float(bio_summary.avg_cadence) if bio_summary.avg_cadence else None,
                            float(bio_summary.avg_gct) if bio_summary.avg_gct else None,
                            float(bio_summary.avg_vr) if bio_summary.avg_vr else None,
                            baseline,
                        )
                        await workout_repo.upsert_fatigue_index(w.workout_id, fi)
        except Exception as e:
            print(f"Fatigue index error for workout {w.workout_id}: {e}")


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
