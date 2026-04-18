"""
Training load metrics: TRIMP, ATL, CTL, TSB.

ATL (Acute Training Load)    = 7-day EWA  of daily load  → fatigue
CTL (Chronic Training Load)  = 42-day EWA of daily load  → fitness
TSB (Training Stress Balance)= CTL - ATL                 → form / freshness

TSB interpretation:
  > +10   : very fresh — race / peak performance window
   +5..+10: fresh — good day to push hard
  -5..+5  : neutral
 -15..-5  : productive fatigue — building fitness, train as planned
  < -15   : overreached — back off, risk of injury / illness
"""

from datetime import timedelta

from repos.workout_repo import WorkoutRepo
from repos.strength_repo import StrengthRepo
from repos.sleep_repo import SleepRepo


# ---------------------------------------------------------------------------
# TRIMP zone weights  (Edwards / 5-zone model)
# ---------------------------------------------------------------------------
_ZONE_WEIGHTS = [1.0, 1.5, 2.0, 3.0, 4.0]   # zones 1-5


async def _trimp_for_date(workout_repo: WorkoutRepo, strength_repo: StrengthRepo, d, user_id=1):
    """
    Sum HR-zone-weighted training load across all Garmin workouts on date d.
    time_in_hr_zone_* is stored in seconds.
    Falls back to strength_sessions set-count estimate if no Garmin entry.
    """
    rows = await workout_repo.get_hr_zones_for_date(user_id, d)
    trimp = 0.0
    for row in rows:
        for i, seconds in enumerate(row):
            if seconds:
                trimp += (seconds / 60.0) * _ZONE_WEIGHTS[i]

    if trimp == 0:
        sets  = await strength_repo.get_set_count_for_date(user_id, d)
        trimp = sets * 2.5   # rough: ~2.5 TRIMP per set ≈ 40 TRIMP for 16-set session

    return trimp


async def get_metrics(
    workout_repo: WorkoutRepo,
    strength_repo: StrengthRepo,
    today,
    lookback: int = 120,
    user_id: int = 1,
) -> dict:
    """
    Compute CTL, ATL, TSB as of `today` using `lookback` days of history.

    Returns a dict:
        ctl          : chronic training load (fitness)
        atl          : acute training load (fatigue)
        tsb          : training stress balance (form)
        today_load   : raw TRIMP for today
        ramp_rate    : CTL change over last 7 days (fitness ramp)
    """
    k_ctl = 1 / 42
    k_atl = 1 / 7
    ctl = 0.0
    atl = 0.0
    ctl_7ago   = 0.0
    today_load = 0.0
    cutoff_7ago = today - timedelta(days=7)

    d = today - timedelta(days=lookback)
    while d <= today:
        load = await _trimp_for_date(workout_repo, strength_repo, d, user_id)
        ctl  = ctl * (1 - k_ctl) + load * k_ctl
        atl  = atl * (1 - k_atl) + load * k_atl
        if d == cutoff_7ago:
            ctl_7ago = ctl
        if d == today:
            today_load = load
        d += timedelta(days=1)

    return {
        "ctl":        round(ctl, 1),
        "atl":        round(atl, 1),
        "tsb":        round(ctl - atl, 1),
        "today_load": round(today_load, 1),
        "ramp_rate":  round(ctl - ctl_7ago, 1),
    }


async def get_history(
    workout_repo: WorkoutRepo,
    strength_repo: StrengthRepo,
    today,
    days: int = 90,
    user_id: int = 1,
) -> list[dict]:
    """Return list of dicts with date/load/ctl/atl/tsb for the past `days` days."""
    k_ctl  = 1 / 42
    k_atl  = 1 / 7
    start  = today - timedelta(days=days + 60)   # extra warmup for CTL
    ctl = atl = 0.0
    history = []
    d = start
    while d <= today:
        load = await _trimp_for_date(workout_repo, strength_repo, d, user_id)
        ctl  = ctl * (1 - k_ctl) + load * k_ctl
        atl  = atl * (1 - k_atl) + load * k_atl
        if d >= today - timedelta(days=days):
            history.append({"date": d, "load": round(load, 1),
                             "ctl": round(ctl, 1), "atl": round(atl, 1),
                             "tsb": round(ctl - atl, 1)})
        d += timedelta(days=1)
    return history


async def get_hrv_history(
    sleep_repo: SleepRepo,
    today,
    days: int = 30,
    user_id: int = 1,
) -> list[dict]:
    """Return list of dicts with date/hrv/baseline/rhr/sleep_score."""
    start = today - timedelta(days=days + 10)
    rows  = await sleep_repo.get_hrv_series(user_id, start, today)
    result = []
    for i, row in enumerate(rows):
        d, hrv, rhr, score = row.sleep_date, row.overnight_hrv, row.rhr, row.sleep_score
        if d < today - timedelta(days=days):
            continue
        baseline_vals = [r.overnight_hrv for r in rows[:i] if r.sleep_date < d][-7:]
        baseline = round(sum(baseline_vals) / len(baseline_vals), 1) if baseline_vals else hrv
        result.append({"date": d, "hrv": hrv, "baseline": baseline,
                        "rhr": rhr, "sleep_score": score})
    return result


def tsb_intensity_hint(tsb):
    """
    Translate TSB into a training intensity recommendation.
    Returns (label, modifier) where modifier is 'push' | 'normal' | 'back_off' | 'rest'.
    """
    if tsb > 10:
        return "very fresh",  "push"
    if tsb > 5:
        return "fresh",       "push"
    if tsb >= -5:
        return "neutral",     "normal"
    if tsb >= -15:
        return "productive fatigue", "normal"
    return "overreached", "back_off"