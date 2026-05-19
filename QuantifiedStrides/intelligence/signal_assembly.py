"""
Signal assembly — centralised entry point for building the full signal dict
passed to build_recommendation() (Story 004).

Every key from §3.1 of RECOMMENDATION_PROTOCOL.md is present in the returned dict.
Missing values are None — no key is omitted.
Each signal call is wrapped in try/except; errors are logged and set that signal to None.
"""

import logging
from datetime import date, timedelta

from repos.workout_repo import WorkoutRepo
from repos.sleep_repo import SleepRepo
from repos.strength_repo import StrengthRepo
from repos.recommendation_repo import RecommendationRepo
from repos.user_repo import UserRepo

logger = logging.getLogger(__name__)

# All signal keys defined in §3.1 of RECOMMENDATION_PROTOCOL.md
_SIGNAL_KEYS = [
    "trimp",
    "atl", "ctl", "tsb", "acwr", "ramp_rate",
    "hrv_status", "hrv_z", "consecutive_suppressed",
    "sleep_readiness",
    "muscle_freshness",
    "biomechanics_fatigue_index",
    "terrain_type",
    "zone_speeds",
    "max_hr", "max_hr_source",
    "hr_rpe_status",
    "cycle_phase",
    "hormonal_contraception",
    "pattern_fatigue_residuals",
    "exercise_history_recency",
    "training_status",
    "goal", "sex",
    "has_readiness_checkin",
    "hrv_data_days",
    "biomechanics_baseline",
    "has_zone_speeds",
    "strength_goal", "goal_weights",
    "readiness_scores",
    "days_to_competition", "competition_priority",
    "hr_stability_last_10min",
]


async def assemble_signals(
    user_id: int,
    today: date,
    workout_repo: WorkoutRepo,
    sleep_repo: SleepRepo,
    strength_repo: StrengthRepo,
    recommendation_repo: RecommendationRepo,
    user_repo: UserRepo,
) -> dict:
    """
    Assemble all §3.1 signals for a user.

    Reads precomputed values from training_load_daily and user_profile where available.
    Computes in-memory signals (HRV status, sleep readiness, muscle freshness,
    pattern fatigue residuals) at request time.

    Returns a dict with every _SIGNAL_KEYS entry present; missing values are None.
    """
    signals: dict = {k: None for k in _SIGNAL_KEYS}

    # ── Load metrics from training_load_daily ─────────────────────────────────
    try:
        row = await recommendation_repo.get_training_load_daily(user_id, today)
        if row:
            signals["atl"] = row.atl
            signals["ctl"] = row.ctl
            signals["tsb"] = row.tsb
            signals["acwr"] = row.acwr
            signals["ramp_rate"] = row.ramp_rate
    except Exception as e:
        logger.error("assemble_signals: load metrics error user=%s: %s", user_id, e)

    # ── User profile signals ───────────────────────────────────────────────────
    try:
        profile = await user_repo.get_profile_signals(user_id)
        if profile:
            signals["max_hr"] = profile.max_hr
            signals["zone_speeds"] = profile.zone_speeds or {}
            signals["has_zone_speeds"] = bool(profile.zone_speeds)
    except Exception as e:
        logger.error("assemble_signals: profile signals error user=%s: %s", user_id, e)

    try:
        hrv_mean, hrv_sd = await user_repo.get_hrv_baseline(user_id)
    except Exception as e:
        logger.error("assemble_signals: get_hrv_baseline error user=%s: %s", user_id, e)
        hrv_mean, hrv_sd = None, None

    # ── HRV status ────────────────────────────────────────────────────────────
    try:
        from intelligence.recovery import compute_hrv_status
        start = today - timedelta(days=30)
        hrv_rows = await sleep_repo.get_hrv_series(user_id, start, today)
        if hrv_rows:
            hrv_series = [float(r.overnight_hrv) for r in hrv_rows]
            hrv_result = compute_hrv_status(hrv_series, hrv_mean, hrv_sd)
            signals["hrv_z"] = hrv_result.get("z")
            signals["hrv_status"] = hrv_result.get("status")
            signals["consecutive_suppressed"] = hrv_result.get("consecutive_suppressed", 0)
            signals["hrv_data_days"] = len(hrv_rows)
    except Exception as e:
        logger.error("assemble_signals: hrv_status error user=%s: %s", user_id, e)

    # ── Sleep readiness ───────────────────────────────────────────────────────
    try:
        sleep_row = await sleep_repo.get_for_date(user_id, today)
        if sleep_row is None:
            sleep_row = await sleep_repo.get_for_date(user_id, today - timedelta(days=1))
        if sleep_row:
            signals["sleep_readiness"] = _compute_sleep_readiness_from_row(
                sleep_row, signals.get("hrv_z")
            )
    except Exception as e:
        logger.error("assemble_signals: sleep_readiness error user=%s: %s", user_id, e)

    # ── Muscle freshness ──────────────────────────────────────────────────────
    try:
        from intelligence.recovery import get_muscle_freshness
        freshness = await get_muscle_freshness(strength_repo, workout_repo, today, user_id=user_id)
        signals["muscle_freshness"] = freshness
    except Exception as e:
        logger.error("assemble_signals: muscle_freshness error user=%s: %s", user_id, e)

    # ── Pattern fatigue residuals ─────────────────────────────────────────────
    try:
        from intelligence.recommend import compute_pattern_fatigue_residuals
        from datetime import datetime
        since = today - timedelta(days=7)
        ledger_rows = await recommendation_repo.get_pattern_fatigue_ledger(user_id, since)
        movement_patterns = await recommendation_repo.get_movement_patterns()
        entry_counts = await recommendation_repo.get_pattern_ledger_entry_counts(user_id)
        freshness = signals.get("muscle_freshness") or {}
        residuals = compute_pattern_fatigue_residuals(
            ledger_rows, movement_patterns, entry_counts, freshness,
            now=datetime.utcnow(),
        )
        signals["pattern_fatigue_residuals"] = residuals
    except Exception as e:
        logger.error("assemble_signals: pattern_fatigue_residuals error user=%s: %s", user_id, e)

    # ── Biomechanics signals from most recent running workout ─────────────────
    try:
        since = today - timedelta(days=14)
        recent_runs = await workout_repo.get_running_workouts_for_signal_compute(user_id, since)
        if recent_runs:
            latest = recent_runs[-1]
            signals["biomechanics_fatigue_index"] = latest.fatigue_index if hasattr(latest, "fatigue_index") else None
            signals["terrain_type"] = latest.terrain_type
            signals["hr_stability_last_10min"] = latest.hr_stability_last_10min if hasattr(latest, "hr_stability_last_10min") else None
    except Exception as e:
        logger.error("assemble_signals: biomechanics error user=%s: %s", user_id, e)

    return signals


def _compute_sleep_readiness_from_row(sleep_row, hrv_z: float | None) -> str:
    """Inline sleep readiness from sleep_sessions row + HRV z-score."""
    score = 0
    available = 0

    sleep_score = getattr(sleep_row, "sleep_score", None)
    body_battery = getattr(sleep_row, "body_battery_change", None)
    duration_min = getattr(sleep_row, "duration_minutes", None)
    duration_h = duration_min / 60.0 if duration_min else None

    if sleep_score is not None:
        available += 1
        score += 2 if sleep_score >= 75 else (1 if sleep_score >= 55 else 0)
    if hrv_z is not None:
        available += 1
        score += 2 if hrv_z > 0.0 else (1 if hrv_z > -1.0 else 0)
    if body_battery is not None:
        available += 1
        score += 2 if body_battery >= 60 else (1 if body_battery >= 35 else 0)
    if duration_h is not None:
        score += 1 if duration_h >= 7.5 else (-1 if duration_h < 6.0 else 0)

    if available == 0:
        return "no_data"

    max_score = 2 * available + (1 if duration_h is not None else 0)
    ratio = score / max(max_score, 1)
    result = "high" if ratio >= 0.60 else ("moderate" if ratio >= 0.30 else "low")

    if duration_h is not None and duration_h < 6.0 and result == "high":
        result = "moderate"

    return result