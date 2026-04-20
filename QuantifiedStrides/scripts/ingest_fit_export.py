"""
Ingest Garmin .FIT files from a ZIP export (or directory) into workouts + workout_metrics.
Produces identical schema to the Garmin API pipeline. Safe to run multiple times — uses
ON CONFLICT (user_id, start_time) to skip duplicates without erroring.

Usage:
    python scripts/ingest_fit_export.py --zip /path/to/UploadedFiles.zip --user-id 2
    python scripts/ingest_fit_export.py --dir /path/to/fit_files/ --user-id 2
"""

import argparse
import asyncio
import io
import sys
import zipfile
from datetime import datetime, timedelta
from pathlib import Path

import fitparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db.engine import AsyncSessionLocal
from repos.workout_repo import WorkoutRepo

# FIT stores lat/long as semicircles; convert to decimal degrees
_SEMI_TO_DEG = 180.0 / (2 ** 31)

# FIT sport enum string → our sport column values (mirrors Garmin API typeKey strings)
_SPORT_MAP = {
    "running":               "running",
    "cycling":               "cycling",
    "mountain_biking":       "mountain_biking",
    "e_biking":              "cycling",
    "training":              "training",
    "fitness_equipment":     "training",
    "strength_training":     "strength_training",
    "generic":               "training",
    "yoga":                  "training",
    "alpine_skiing":         "alpine_skiing",
    "backcountry_skiing":    "alpine_skiing",
    "snowboarding":          "snowboarding",
    "cross_country_skiing":  "cross_country_skiing",
    "rock_climbing":         "rock_climbing",
    "mountaineering":        "hiking",
    "hiking":                "hiking",
    "swimming":              "swimming",
    "soccer":                "soccer",
    "tennis":                "tennis",
    "trail_running":         "trail_running",
}


def _sport(fit_sport) -> str:
    s = str(fit_sport).lower().replace(" ", "_") if fit_sport else "training"
    return _SPORT_MAP.get(s, s)


def _f(val) -> float | None:
    try:
        return float(val) if val is not None else None
    except (TypeError, ValueError):
        return None


def _i(val) -> int | None:
    try:
        return int(val) if val is not None else None
    except (TypeError, ValueError):
        return None


def _deg(val) -> float | None:
    return _f(val) * _SEMI_TO_DEG if val is not None else None


def _pace(speed_ms) -> float | None:
    """m/s → min/km."""
    if not speed_ms:
        return None
    try:
        return (1000.0 / float(speed_ms)) / 60.0
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def _strip_tz(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


def _session_get(session, *field_names):
    """Try multiple field name variants, return first non-None value."""
    for name in field_names:
        try:
            v = session.get_value(name)
            if v is not None:
                return v
        except Exception:
            pass
    return None


def parse_fit(data: bytes) -> dict | None:
    """
    Parse raw .FIT bytes into a dict with 'workout' and 'metrics' keys.
    Returns None for non-activity files (health monitoring, sleep, etc.).
    """
    try:
        fit = fitparse.FitFile(io.BytesIO(data))
    except Exception:
        return None

    sessions = list(fit.get_messages("session"))
    records = list(fit.get_messages("record"))

    if not sessions or not records:
        return None

    s = sessions[0]

    def sg(*names):
        return _session_get(s, *names)

    start_time = _strip_tz(sg("start_time"))
    if start_time is None:
        return None

    elapsed = sg("total_elapsed_time")
    end_time = start_time + timedelta(seconds=float(elapsed)) if elapsed else start_time

    # First GPS fix for start lat/lon
    start_lat = start_lon = None
    for rec in records:
        lat = _deg(rec.get_value("position_lat"))
        lon = _deg(rec.get_value("position_long"))
        if lat is not None and lon is not None:
            start_lat, start_lon = lat, lon
            break

    # avg/max cadence: prefer running-specific fields, fall back to generic
    avg_cad = sg("avg_running_cadence", "avg_cadence")
    max_cad = sg("max_running_cadence", "max_cadence")

    workout = {
        "sport":                     _sport(sg("sport")),
        "start_time":                start_time,
        "end_time":                  end_time,
        "workout_type":              _sport(sg("sport")),
        "workout_date":              start_time.date(),
        "calories_burned":           _i(sg("total_calories")),
        "avg_heart_rate":            _i(sg("avg_heart_rate")),
        "max_heart_rate":            _i(sg("max_heart_rate")),
        "vo2max_estimate":           None,  # not stored in FIT session
        "lactate_threshold_bpm":     None,
        "zone_1": None, "zone_2": None, "zone_3": None, "zone_4": None, "zone_5": None,
        "training_volume":           _f(sg("total_distance")),
        "avg_vertical_oscillation":  _f(sg("avg_vertical_oscillation")),
        "avg_ground_contact_time":   _f(sg("avg_stance_time")),
        "avg_stride_length":         _f(sg("avg_step_length")),
        "avg_vertical_ratio":        _f(sg("avg_vertical_ratio")),
        "avg_running_cadence":       _f(avg_cad),
        "max_running_cadence":       _f(max_cad),
        "location":                  None,
        "start_latitude":            start_lat,
        "start_longitude":           start_lon,
        "elevation_gain":            _f(sg("total_ascent")),
        "elevation_loss":            _f(sg("total_descent")),
        "aerobic_training_effect":   _f(sg("total_training_effect")),
        "anaerobic_training_effect": _f(sg("total_anaerobic_training_effect")),
        "training_stress_score":     _f(sg("training_stress_score")),
        "normalized_power":          _f(sg("normalized_power")),
        "avg_power":                 _f(sg("avg_power")),
        "max_power":                 _f(sg("max_power")),
        "total_steps":               _i(sg("total_strides")),
    }

    # Per-second metrics
    metrics = []
    prev_alt = None
    prev_dist = None

    for rec in records:
        def rv(f):
            try:
                return rec.get_value(f)
            except Exception:
                return None

        ts = _strip_tz(rv("timestamp"))
        if ts is None:
            continue

        lat = _deg(rv("position_lat"))
        lon = _deg(rv("position_long"))
        alt = _f(rv("enhanced_altitude") or rv("altitude"))
        dist = _f(rv("distance"))
        speed = _f(rv("enhanced_speed") or rv("speed"))
        pace = _pace(speed)

        # Double cadence (total steps/min); FIT cadence = per-leg steps/min
        raw_cad = rv("cadence")
        frac_cad = _f(rv("fractional_cadence"))
        cadence = None
        if raw_cad is not None:
            c = float(raw_cad) + (frac_cad or 0.0)
            cadence = c * 2

        # Vertical oscillation: FIT stores in mm, schema expects cm
        vo = _f(rv("vertical_oscillation"))
        if vo is not None:
            vo = vo / 10.0

        # Gradient from altitude + distance deltas
        gradient_pct = None
        if alt is not None and prev_alt is not None:
            d_alt = alt - prev_alt
            d_dist = None
            if dist is not None and prev_dist is not None:
                d_dist = dist - prev_dist
            elif pace is not None and pace > 0:
                d_dist = (1000.0 / (pace * 60.0)) * 1.0
            if d_dist is not None and d_dist > 0.5:
                gradient_pct = round(d_alt / d_dist * 100, 2)

        if alt is not None:
            prev_alt = alt
        if dist is not None:
            prev_dist = dist

        # Tuple order must match WorkoutRepo.insert_metrics_batch exactly:
        # (workout_id, metric_timestamp, heart_rate, pace, cadence,
        #  vertical_oscillation, vertical_ratio, ground_contact_time,
        #  power, latitude, longitude, altitude, distance, gradient_pct)
        metrics.append((
            None,                            # workout_id — filled in after upsert
            ts,
            _i(rv("heart_rate")),
            pace,
            cadence,
            vo,
            _f(rv("vertical_ratio")),
            _f(rv("stance_time")),           # ms → ground_contact_time
            _f(rv("power")),
            lat,
            lon,
            alt,
            dist,
            gradient_pct,
        ))

    return {"workout": workout, "metrics": metrics}


async def _process_files(file_iter, user_id: int, label: str):
    files = list(file_iter)
    total = len(files)
    print(f"Found {total} .FIT files in {label}")

    inserted = skipped_health = errors = 0

    async with AsyncSessionLocal() as db:
        repo = WorkoutRepo(db)

        for i, (fname, data) in enumerate(files):
            if i % 100 == 0 and i > 0:
                print(f"  {i}/{total} processed — {inserted} activities so far...")

            try:
                parsed = parse_fit(data)

                if parsed is None:
                    skipped_health += 1
                    continue

                workout_id = await repo.upsert_workout(user_id, parsed["workout"])

                if parsed["metrics"] and not await repo.metrics_exist(workout_id):
                    rows = [(workout_id, *row[1:]) for row in parsed["metrics"]]
                    await repo.insert_metrics_batch(rows)

                inserted += 1

            except Exception as e:
                print(f"  ERROR [{fname}]: {e}")
                errors += 1

        await db.commit()

    print(f"\nComplete.")
    print(f"  Activities inserted/updated : {inserted}")
    print(f"  Non-activity files skipped  : {skipped_health}")
    print(f"  Errors                      : {errors}")


async def ingest_zip(zip_path: str, user_id: int):
    with zipfile.ZipFile(zip_path) as zf:
        fit_names = [f for f in zf.namelist() if f.lower().endswith(".fit")]

        def iter_files():
            for fname in fit_names:
                yield fname, zf.read(fname)

        await _process_files(iter_files(), user_id, zip_path)


async def ingest_dir(dir_path: str, user_id: int):
    paths = list(Path(dir_path).rglob("*.fit")) + list(Path(dir_path).rglob("*.FIT"))

    def iter_files():
        for p in paths:
            yield p.name, p.read_bytes()

    await _process_files(iter_files(), user_id, dir_path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Ingest Garmin .FIT export into QuantifiedStrides DB"
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--zip", help="Path to ZIP file containing .FIT files")
    source.add_argument("--dir", help="Path to directory containing .FIT files")
    parser.add_argument("--user-id", type=int, required=True,
                        help="user_id to assign all ingested workouts to")
    args = parser.parse_args()

    if args.zip:
        asyncio.run(ingest_zip(args.zip, args.user_id))
    else:
        asyncio.run(ingest_dir(args.dir, args.user_id))
