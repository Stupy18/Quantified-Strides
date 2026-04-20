"""
analytics/biomechanics.py

Biomechanics analytics computed from workout_metrics time-series.

1. Fatigue Signature
   Compare first 20% vs last 20% of a run:
   - Cadence drift    (steps/min — drops when tired)
   - GCT drift        (ms — rises when tired, heavier footstrike)
   - HR drift         (bpm — rises even at same pace)
   - Pace drift       (min/km — slowing down)
   - VO drift         (cm — oscillation increases with fatigue)

2. Cadence-Speed Relationship
   At each speed band, what is the average cadence?
   Good runners maintain cadence and adjust stride length.
   Overstriding shows as cadence dropping sharply with pace.

3. Per-Workout Biomechanics Summary
   Single-row summary per workout: avg/std of each biomechanics metric.

4. Longitudinal Biomechanics Trends
   Rolling stats over time to see if GCT, cadence, VO are improving.
"""

from __future__ import annotations

from typing import Optional

from repos.workout_metrics_repo import WorkoutMetricsRepo
from repos.workout_repo import WorkoutRepo


# ---------------------------------------------------------------------------
# Single-workout: fatigue signature
# ---------------------------------------------------------------------------

async def get_fatigue_signature(
    workout_id: int,
    metrics_repo: WorkoutMetricsRepo,
    window_pct: float = 0.20,
) -> Optional[dict]:
    """
    Compare biomechanics in the first `window_pct` vs last `window_pct` of a run.

    window_pct: fraction of the run to use as early/late window (default 20%).

    Returns dict with per-metric drift values, or None if insufficient data.
    Positive drift means the metric increased (e.g. GCT got worse).
    For cadence, negative drift = cadence dropped (bad).
    """
    rows = await metrics_repo.get_fatigue_series(workout_id)

    n = len(rows)
    if n < 50:
        return None

    win = max(10, int(n * window_pct))
    early = rows[:win]
    late  = rows[n - win:]

    def safe_avg(data, idx):
        vals = [r[idx] for r in data if r[idx] is not None]
        return sum(vals) / len(vals) if vals else None

    def drift(early_avg, late_avg):
        if early_avg is None or late_avg is None or early_avg == 0:
            return None
        return round(late_avg - early_avg, 3)

    def drift_pct(early_avg, late_avg):
        if early_avg is None or late_avg is None or early_avg == 0:
            return None
        return round((late_avg - early_avg) / early_avg * 100, 2)

    # rows: (metric_timestamp, heart_rate, pace, cadence, stance_time, vertical_oscillation)
    # 0-based indices after timestamp: hr=1, pace=2, cadence=3, stance=4, vo=5
    metrics = {
        "heart_rate":           1,
        "pace":                 2,
        "cadence":              3,
        "stance_time":  4,
        "vertical_oscillation": 5,
    }

    result = {
        "workout_id":  workout_id,
        "n_rows":      n,
        "window_pct":  window_pct,
        "window_size": win,
    }

    for name, idx in metrics.items():
        early_avg = safe_avg(early, idx)
        late_avg  = safe_avg(late,  idx)
        result[f"{name}_early"]     = round(early_avg, 3) if early_avg is not None else None
        result[f"{name}_late"]      = round(late_avg,  3) if late_avg  is not None else None
        result[f"{name}_drift"]     = drift(early_avg, late_avg)
        result[f"{name}_drift_pct"] = drift_pct(early_avg, late_avg)

    # Summary: overall fatigue score (0-100, higher = more fatigued)
    scores = []
    if result.get("stance_time_drift_pct") is not None:
        scores.append(min(100, max(0, result["stance_time_drift_pct"] * 5)))
    if result.get("heart_rate_drift_pct") is not None:
        scores.append(min(100, max(0, result["heart_rate_drift_pct"] * 10)))
    if result.get("cadence_drift_pct") is not None:
        scores.append(min(100, max(0, -result["cadence_drift_pct"] * 10)))

    result["fatigue_score"] = round(sum(scores) / len(scores), 1) if scores else None

    return result


# ---------------------------------------------------------------------------
# Single-workout: cadence-speed relationship
# ---------------------------------------------------------------------------

async def get_cadence_speed_profile(
    workout_id: int,
    metrics_repo: WorkoutMetricsRepo,
) -> Optional[list[dict]]:
    """
    Group data points by pace band (0.5 min/km buckets) and compute
    mean cadence for each band.

    Returns list of dicts sorted by pace_band ascending (slow → fast),
    or None if insufficient data.
    """
    rows = await metrics_repo.get_pace_cadence_series(workout_id)

    if len(rows) < 20:
        return None

    buckets: dict[float, list[float]] = {}
    for pace, cadence in rows:
        band = round(pace * 2) / 2   # nearest 0.5
        if band not in buckets:
            buckets[band] = []
        buckets[band].append(cadence)

    return [
        {
            "pace_band":   band,
            "avg_cadence": round(sum(vals) / len(vals), 1),
            "count":       len(vals),
        }
        for band, vals in sorted(buckets.items())
        if len(vals) >= 5
    ]


# ---------------------------------------------------------------------------
# Single-workout: biomechanics summary
# ---------------------------------------------------------------------------

async def get_workout_biomechanics(
    workout_id: int,
    metrics_repo: WorkoutMetricsRepo,
) -> Optional[dict]:
    """
    Single-row biomechanics summary for a workout.

    Returns averages and std devs for: cadence, GCT, VO, VR, pace, HR.
    """
    row = await metrics_repo.get_biomechanics_summary(workout_id)

    if not row or row.n_rows == 0:
        return None

    def r(v, digits=3):
        return round(float(v), digits) if v is not None else None

    return {
        "workout_id":  workout_id,
        "avg_cadence": r(row.avg_cadence, 1),
        "std_cadence": r(row.std_cadence, 2),
        "avg_gct":     r(row.avg_gct, 1),
        "std_gct":     r(row.std_gct, 2),
        "avg_vo":      r(row.avg_vo, 2),
        "std_vo":      r(row.std_vo, 3),
        "avg_vr":      r(row.avg_vr, 2),
        "std_vr":      r(row.std_vr, 3),
        "avg_pace":    r(row.avg_pace, 3),
        "avg_hr":      r(row.avg_hr, 1),
        "n_rows":      row.n_rows,
    }


# ---------------------------------------------------------------------------
# Longitudinal trends
# ---------------------------------------------------------------------------

async def get_biomechanics_trends(
    metrics_repo: WorkoutMetricsRepo,
    workout_repo: WorkoutRepo,
    days: int = 365,
    user_id: int = 1,
) -> list[dict]:
    """
    Per-workout biomechanics summary + fatigue signature for all running
    workouts in the last `days` days, sorted by date.
    """
    workouts = await workout_repo.get_running_workout_list(user_id, days)

    results = []
    for w in workouts:
        try:
            bio = await get_workout_biomechanics(w.workout_id, metrics_repo)
        except Exception:
            bio = None
        try:
            fat = await get_fatigue_signature(w.workout_id, metrics_repo)
        except Exception:
            fat = None

        row = {
            "workout_id":   w.workout_id,
            "workout_date": w.workout_date,
            "sport":        w.sport,
            "distance_km":  round((w.distance_m or 0) / 1000, 2),
        }

        if bio:
            row.update({
                "avg_cadence": bio["avg_cadence"],
                "avg_gct":     bio["avg_gct"],
                "avg_vo":      bio["avg_vo"],
                "avg_vr":      bio["avg_vr"],
                "avg_pace":    bio["avg_pace"],
                "avg_hr":      bio["avg_hr"],
            })
        else:
            row.update({k: None for k in
                        ["avg_cadence", "avg_gct", "avg_vo", "avg_vr", "avg_pace", "avg_hr"]})

        if fat:
            row.update({
                "fatigue_score":     fat["fatigue_score"],
                "cadence_drift_pct": fat["cadence_drift_pct"],
                "gct_drift_pct":     fat["stance_time_drift_pct"],
                "hr_drift_pct":      fat["heart_rate_drift_pct"],
            })
        else:
            row.update({k: None for k in
                        ["fatigue_score", "cadence_drift_pct", "gct_drift_pct", "hr_drift_pct"]})

        results.append(row)

    return results