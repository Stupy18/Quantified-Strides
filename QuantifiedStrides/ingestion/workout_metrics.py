from datetime import datetime

import garminconnect
from sqlalchemy.ext.asyncio import AsyncSession

from db.engine import AsyncSessionLocal
from ingestion.okgarmin_connection import get_garmin_client, reset_garmin_client
from repos.workout_repo import WorkoutRepo


# Maps Garmin metric descriptor keys to workout_metrics column names.
# directDoubleCadence is the full steps/min figure; directCadence is half-cadence.
# Keys that map to TWO columns (directSpeed → pace + speed_ms) are handled by
# build_column_map returning a list of (col_name, transform) per index.
GARMIN_KEY_TO_COLUMN = {
    "directHeartRate":              "heart_rate",
    "directSpeed":                  "pace",               # m/s → min/km; speed_ms added separately
    "directDoubleCadence":          "cadence",
    "directCadence":                "cadence",
    "directVerticalOscillation":    "vertical_oscillation",
    "directVerticalRatio":          "vertical_ratio",
    "directGroundContactTime":      "stance_time",
    "directPower":                  "power",
    "directLatitude":               "latitude",
    "directLongitude":              "longitude",
    "directAltitude":               "altitude",
    "directElevation":              "altitude",           # some devices use this key
    "directDistance":               "distance",
    # T1-E
    "directStrideLength":           "stride_length",      # cm, keep unit
    "directGradeAdjustedSpeed":     "grade_adjusted_pace",# m/s → min/km; grade_adjusted_speed_ms added separately
    "directBodyBattery":            "body_battery",       # dimensionless 0–100
    "directVerticalSpeed":          "vertical_speed",     # m/s, store as float
    # T4-A
    "directPerformanceCondition":   "performance_condition",  # -20 to +20
    # T4-B
    "directRespirationRate":        "respiration_rate",   # breaths/min
}


def speed_to_pace(speed_ms):
    """Convert m/s to min/km. Returns None for zero/null speed."""
    if not speed_ms:
        return None
    return (1000 / speed_ms) / 60


def build_column_map(descriptors):
    """
    Return a dict of {metricsIndex: [(col_name, transform_fn), ...]} from the
    activity's metricDescriptors list.

    When both directCadence and directDoubleCadence are present, only
    directDoubleCadence is mapped (it's the full steps/min value).

    directSpeed and directGradeAdjustedSpeed each produce TWO entries — the
    converted pace (min/km) and the raw speed_ms float.
    """
    has_double_cadence = any(d["key"] == "directDoubleCadence" for d in descriptors)

    col_map: dict[int, list[tuple]] = {}
    for d in descriptors:
        key = d["key"]
        idx = d["metricsIndex"]

        if key == "directCadence" and has_double_cadence:
            continue
        if key not in GARMIN_KEY_TO_COLUMN:
            continue

        col_name = GARMIN_KEY_TO_COLUMN[key]

        if col_name == "heart_rate":
            transform = lambda v: int(v) if v is not None else None
        elif col_name in ("pace", "grade_adjusted_pace"):
            transform = speed_to_pace
        elif col_name == "performance_condition":
            transform = lambda v: int(v) if v is not None else None
        else:
            transform = lambda v: float(v) if v is not None else None

        if idx not in col_map:
            col_map[idx] = []
        col_map[idx].append((col_name, transform))

        # Also store raw m/s alongside converted pace
        if key == "directSpeed":
            col_map[idx].append(("speed_ms", lambda v: float(v) if v is not None else None))
        elif key == "directGradeAdjustedSpeed":
            col_map[idx].append(("grade_adjusted_speed_ms", lambda v: float(v) if v is not None else None))

    return col_map


async def collect_workout_metrics(db: AsyncSession, user_id: int, client: garminconnect.Garmin) -> bool:
    try:
        repo = WorkoutRepo(db)
        try:
            activities = client.get_activities(0, 1)
        except garminconnect.GarminConnectAuthenticationError:  # token expired mid-session
            client = reset_garmin_client()
            activities = client.get_activities(0, 1)

        if not activities:
            print("No activities found on Garmin Connect.")
            return False

        activity = activities[0]
        activity_id = activity["activityId"]
        activity_name = activity.get("activityName", "Unknown")
        start_time_str = activity.get("startTimeLocal", "")

        print(f"Activity: {activity_name} (ID: {activity_id})")

        try:
            start_time_dt = datetime.strptime(start_time_str, "%Y-%m-%dT%H:%M:%S")
        except ValueError:
            start_time_dt = datetime.strptime(start_time_str, "%Y-%m-%d %H:%M:%S")

        workout_date = start_time_dt.date()

        row = await repo.get_by_start_time(user_id, start_time_dt)
        if not row:
            row = await repo.get_by_date(user_id, workout_date)
        if not row:
            print(f"No matching workout in DB for {workout_date}. Run workout.py first.")
            return False

        workout_id = row.workout_id
        print(f"Matched workout_id: {workout_id}")

        if await repo.metrics_exist(workout_id):
            print(f"workout_metrics already populated for workout_id {workout_id}. Skipping.")
            return True

        print("Downloading activity details...")
        details = client.get_activity_details(activity_id, maxchart=2000)

        descriptors = details.get("metricDescriptors", [])
        data_points  = details.get("activityDetailMetrics", [])

        if not descriptors or not data_points:
            print("No time-series data in activity details.")
            return False

        timestamp_index = next(
            (d["metricsIndex"] for d in descriptors if d["key"] == "directTimestamp"),
            None,
        )
        if timestamp_index is None:
            print("No directTimestamp found in metricDescriptors.")
            return False

        col_map = build_column_map(descriptors)
        mapped_cols = sorted({col for cols in col_map.values() for col, _ in cols})
        print(f"Mapped columns: {mapped_cols}")

        rows = []
        prev_altitude = None
        prev_distance = None

        for point in data_points:
            metrics = point.get("metrics", [])

            if timestamp_index >= len(metrics) or metrics[timestamp_index] is None:
                continue

            metric_timestamp = datetime.fromtimestamp(metrics[timestamp_index] / 1000)

            values = {
                "heart_rate": None, "pace": None, "cadence": None,
                "vertical_oscillation": None, "vertical_ratio": None,
                "stance_time": None, "power": None,
                "latitude": None, "longitude": None,
                "altitude": None, "distance": None,
                "stride_length": None, "grade_adjusted_pace": None,
                "body_battery": None, "vertical_speed": None,
                "speed_ms": None, "grade_adjusted_speed_ms": None,
                "performance_condition": None, "respiration_rate": None,
            }

            for idx, col_list in col_map.items():
                if idx < len(metrics) and metrics[idx] is not None:
                    for col_name, transform in col_list:
                        values[col_name] = transform(metrics[idx])

            # Compute gradient_pct = Δaltitude / Δhorizontal_distance × 100
            gradient_pct = None
            alt  = values["altitude"]
            dist = values["distance"]
            pace = values["pace"]

            if alt is not None and prev_altitude is not None:
                d_alt  = alt - prev_altitude
                d_dist = None
                if dist is not None and prev_distance is not None:
                    d_dist = dist - prev_distance
                elif pace is not None and pace > 0:
                    speed_ms_val = 1000.0 / (pace * 60.0)
                    d_dist = speed_ms_val * 1.0   # 1-second intervals
                if d_dist is not None and d_dist > 0.5:
                    gradient_pct = round(d_alt / d_dist * 100, 2)

            if alt  is not None: prev_altitude = alt
            if dist is not None: prev_distance = dist

            rows.append((
                workout_id,
                metric_timestamp,
                values["heart_rate"],
                values["pace"],
                values["cadence"],
                values["vertical_oscillation"],
                values["vertical_ratio"],
                values["stance_time"],
                values["power"],
                values["latitude"],
                values["longitude"],
                values["altitude"],
                values["distance"],
                gradient_pct,
                values["stride_length"],
                values["grade_adjusted_pace"],
                values["body_battery"],
                values["vertical_speed"],
                values["speed_ms"],
                values["grade_adjusted_speed_ms"],
                values["performance_condition"],
                values["respiration_rate"],
            ))

        count = await repo.insert_metrics_batch(rows)
        await db.commit()
        print(f"Inserted {count} metric records for workout_id {workout_id}.")
        return True

    except Exception as e:
        print(f"Error collecting workout metrics: {e}")
        return False


if __name__ == "__main__":
    import asyncio

    async def main():
        async with AsyncSessionLocal() as db:
            await collect_workout_metrics(db, user_id=1, client=get_garmin_client())

    asyncio.run(main())
