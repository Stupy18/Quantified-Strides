"""
One-time backfill: pull all Garmin activities from 2026-01-01 to today
and insert any that aren't already in the DB.

Run once:  python3 backfill_workouts.py
"""

from datetime import datetime, timedelta

import garminconnect

from config import GARMIN_EMAIL, GARMIN_PASSWORD
from db.session import get_connection

_RUNNING_SPORTS = {"running", "trail_running"}

client = garminconnect.Garmin(GARMIN_EMAIL, GARMIN_PASSWORD)
client.login()

START_DATE = "2026-01-01"
END_DATE   = datetime.today().strftime("%Y-%m-%d")

print(f"Fetching activities from {START_DATE} to {END_DATE}...")
activities = client.get_activities_by_date(START_DATE, END_DATE)
print(f"Found {len(activities)} activities on Garmin.")

conn   = get_connection()
cursor = conn.cursor()

sql_insert = """
INSERT INTO workouts (
      user_id, sport, start_time, end_time, workout_type
    , calories_burned, avg_heart_rate, max_heart_rate
    , vo2max_estimate, lactate_threshold_bpm
    , distance_m, avg_cadence
    , location, start_latitude, start_longitude, workout_date
    , elevation_gain, elevation_loss
    , aerobic_training_effect, anaerobic_training_effect
    , total_steps, garmin_activity_id
    , primary_benefit, training_load_score
    , avg_respiration_rate, max_respiration_rate
)
VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
ON CONFLICT (user_id, start_time) DO NOTHING
RETURNING workout_id;
"""

inserted = 0
skipped  = 0

for activity in activities:
    start_time_str = activity.get("startTimeLocal")
    if not start_time_str:
        continue

    try:
        start_time_dt = datetime.strptime(start_time_str, "%Y-%m-%dT%H:%M:%S")
    except ValueError:
        start_time_dt = datetime.strptime(start_time_str, "%Y-%m-%d %H:%M:%S")

    workout_date     = start_time_dt.date()
    duration_seconds = activity.get("duration", 0.0)
    end_time_dt      = start_time_dt + timedelta(seconds=float(duration_seconds))
    sport            = activity.get("activityType", {}).get("typeKey", "Unknown")

    avg_cadence = (
        activity.get("averageRunningCadenceInStepsPerMinute")
        or activity.get("averageBikingCadenceInRevPerMinute")
    )

    cursor.execute(sql_insert, (
        1,
        sport,
        start_time_dt,
        end_time_dt,
        activity.get("activityName", "Unknown"),
        activity.get("calories", 0),
        activity.get("averageHR", 0),
        activity.get("maxHR", 0),
        activity.get("vO2MaxValue"),
        activity.get("lactateThresholdBpm"),
        activity.get("distance", 0.0),
        avg_cadence,
        activity.get("locationName", "Unknown"),
        activity.get("startLatitude"),
        activity.get("startLongitude"),
        workout_date,
        activity.get("elevationGain"),
        activity.get("elevationLoss"),
        activity.get("aerobicTrainingEffect"),
        activity.get("anaerobicTrainingEffect"),
        activity.get("steps"),
        activity.get("activityId"),
        activity.get("primaryBenefit"),
        activity.get("activityTrainingLoad"),
        activity.get("avgRespirationRate"),
        activity.get("maxRespirationRate"),
    ))

    result = cursor.fetchone()
    if not result:
        skipped += 1
        continue
    workout_id = result[0]

    # HR zones → satellite table
    zones = {}
    for i in range(1, 6):
        val = activity.get(f"hrTimeInZone_{i}")
        if val is not None:
            zones[i] = int(float(val))
    if zones:
        cursor.executemany(
            "INSERT INTO workout_hr_zones (workout_id, zone, seconds) VALUES (%s,%s,%s) "
            "ON CONFLICT (workout_id, zone) DO UPDATE SET seconds = EXCLUDED.seconds",
            [(workout_id, z, s) for z, s in zones.items()]
        )

    # Running biomechanics → satellite table
    if sport in _RUNNING_SPORTS:
        cursor.execute("""
            INSERT INTO workout_run_biomechanics (
                workout_id, avg_vertical_oscillation, avg_stance_time,
                avg_stride_length, avg_vertical_ratio,
                avg_running_cadence, max_running_cadence
            ) VALUES (%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (workout_id) DO UPDATE SET
                avg_vertical_oscillation = EXCLUDED.avg_vertical_oscillation,
                avg_stance_time          = EXCLUDED.avg_stance_time,
                avg_stride_length        = EXCLUDED.avg_stride_length,
                avg_vertical_ratio       = EXCLUDED.avg_vertical_ratio,
                avg_running_cadence      = EXCLUDED.avg_running_cadence,
                max_running_cadence      = EXCLUDED.max_running_cadence
        """, (
            workout_id,
            activity.get("avgVerticalOscillation"),
            activity.get("avgGroundContactTime"),
            activity.get("avgStrideLength"),
            activity.get("avgVerticalRatio"),
            activity.get("averageRunningCadenceInStepsPerMinute"),
            activity.get("maxRunningCadenceInStepsPerMinute"),
        ))

    # Power summary → satellite table
    power_data = {
        "normalized_power":      activity.get("normalizedPower"),
        "avg_power":             activity.get("avgPower"),
        "max_power":             activity.get("maxPower"),
        "training_stress_score": activity.get("trainingStressScore"),
    }
    if any(v is not None for v in power_data.values()):
        cursor.execute("""
            INSERT INTO workout_power_summary (
                workout_id, normalized_power, avg_power, max_power, training_stress_score
            ) VALUES (%s,%s,%s,%s,%s)
            ON CONFLICT (workout_id) DO UPDATE SET
                normalized_power      = EXCLUDED.normalized_power,
                avg_power             = EXCLUDED.avg_power,
                max_power             = EXCLUDED.max_power,
                training_stress_score = EXCLUDED.training_stress_score
        """, (
            workout_id,
            power_data["normalized_power"],
            power_data["avg_power"],
            power_data["max_power"],
            power_data["training_stress_score"],
        ))

    print(f"  [{workout_date}] {activity.get('activityName')} — ID {workout_id}")
    inserted += 1

conn.commit()
cursor.close()
conn.close()
print(f"\nDone. {inserted} inserted, {skipped} already existed.")
