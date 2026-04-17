"""
Anomaly detection, overtraining alerts, and metric interpretations.

Signals monitored:
  - ACWR (Acute:Chronic Workload Ratio) — injury risk window
  - RHR trend — rolling baseline deviation
  - HRV suppression depth + duration
  - Sleep quality cluster (3-day rolling)
  - Multi-metric illness onset pattern
  - Overtraining accumulation (TSB depth + consecutive days)
  - Fitness ramp rate (CTL change/week)

Each alert has a severity:
  'info'     — noteworthy, no action required
  'warning'  — take note, consider adjusting
  'critical' — act now, do not train hard today
"""

from datetime import timedelta

from repos.sleep_repo import SleepRepo
from repos.workout_repo import WorkoutRepo
from repos.checkin_repo import CheckinRepo


# ---------------------------------------------------------------------------
# Rolling RHR baseline
# ---------------------------------------------------------------------------

async def _get_rhr_baseline(sleep_repo: SleepRepo, today, window: int = 7, user_id: int = 1):
    start = today - timedelta(days=window + 3)
    rows  = await sleep_repo.get_rhr_series(user_id, start, today)
    if len(rows) < 3:
        return None, None, None

    last_date = rows[-1].sleep_date
    last_rhr  = rows[-1].rhr
    baseline_vals = [r.rhr for r in rows if r.sleep_date < last_date][-window:]
    if len(baseline_vals) < 3:
        return last_rhr, None, None

    mean = sum(baseline_vals) / len(baseline_vals)
    return last_rhr, round(mean, 1), round(last_rhr - mean, 1)


# ---------------------------------------------------------------------------
# Sleep quality cluster
# ---------------------------------------------------------------------------

async def _get_sleep_trend(sleep_repo: SleepRepo, today, window: int = 3, user_id: int = 1):
    start = today - timedelta(days=window + 1)
    rows  = await sleep_repo.get_sleep_trend(user_id, start, today, limit=window)
    if not rows:
        return None, None
    scores    = [r.sleep_score for r in rows]
    durations = [r.duration_minutes for r in rows if r.duration_minutes]
    avg_score    = sum(scores) / len(scores)
    avg_duration = sum(durations) / len(durations) if durations else None
    return round(avg_score, 1), round(avg_duration / 60, 1) if avg_duration else None


# ---------------------------------------------------------------------------
# Consecutive training days — single query, streak in Python
# ---------------------------------------------------------------------------

async def _consecutive_days(workout_repo: WorkoutRepo, today, user_id: int = 1) -> int:
    start   = today - timedelta(days=14)
    trained = await workout_repo.get_training_dates(user_id, start, today - timedelta(days=1))
    count = 0
    d = today - timedelta(days=1)
    for _ in range(14):
        if d not in trained:
            break
        count += 1
        d -= timedelta(days=1)
    return count


# ---------------------------------------------------------------------------
# Going-out check
# ---------------------------------------------------------------------------

async def _went_out_last_night(checkin_repo: CheckinRepo, today, user_id: int = 1) -> bool:
    yesterday = today - timedelta(days=1)
    return await checkin_repo.get_going_out(user_id, yesterday)


# ---------------------------------------------------------------------------
# Main alert generator
# ---------------------------------------------------------------------------

async def get_alerts(
    sleep_repo: SleepRepo,
    workout_repo: WorkoutRepo,
    checkin_repo: CheckinRepo,
    today,
    tl_metrics: dict,
    hrv_status: dict,
    readiness: dict | None = None,
    user_id: int = 1,
) -> list[tuple[str, str]]:
    """
    Returns a list of (severity, message) tuples, sorted critical → warning → info.
    """
    alerts = []

    tsb       = tl_metrics["tsb"]
    ctl       = tl_metrics["ctl"]
    atl       = tl_metrics["atl"]
    ramp      = tl_metrics["ramp_rate"]
    hrv_st    = hrv_status["status"]
    hrv_dev   = hrv_status.get("deviation")
    hrv_trend = hrv_status.get("trend")

    last_rhr, rhr_baseline, rhr_delta = await _get_rhr_baseline(sleep_repo, today, user_id=user_id)
    sleep_score_avg, sleep_hrs_avg    = await _get_sleep_trend(sleep_repo, today, user_id=user_id)
    consec                            = await _consecutive_days(workout_repo, today, user_id)

    # --- ACWR (Acute:Chronic Workload Ratio) ---
    acwr = atl / ctl if ctl > 5 else None
    if acwr:
        if acwr > 1.5:
            alerts.append(("critical",
                f"ACWR {acwr:.2f} — acute load is 1.5× your chronic baseline. "
                "High injury risk. Reduce intensity today."))
        elif acwr > 1.3:
            alerts.append(("warning",
                f"ACWR {acwr:.2f} — load spike above safe ramp zone (>1.3). "
                "Keep today moderate."))

    # --- Overtraining (TSB depth) ---
    if tsb < -25:
        alerts.append(("critical",
            f"TSB {tsb:+.0f} — deep fatigue accumulation. "
            "Consider a rest or easy day to avoid overreaching."))
    elif tsb < -15:
        alerts.append(("warning",
            f"TSB {tsb:+.0f} — significant fatigue. Train as planned but avoid adding extra volume."))

    # --- Consecutive training days ---
    if consec >= 6:
        alerts.append(("critical",
            f"{consec} consecutive training days — mandatory rest or active recovery only."))
    elif consec >= 4:
        alerts.append(("warning",
            f"{consec} days straight — consider whether today needs a rest."))

    # --- Fitness ramp rate ---
    if ramp > 8:
        alerts.append(("warning",
            f"CTL ramp +{ramp:.1f}/week — above safe ceiling (~5-7). "
            "Pull back to avoid accumulated fatigue."))
    elif ramp < -7:
        alerts.append(("info",
            f"CTL ramp {ramp:+.1f}/week — significant detraining. "
            "Increase consistency to rebuild fitness base."))

    # --- RHR elevation ---
    if rhr_delta is not None:
        if rhr_delta >= 8:
            alerts.append(("critical",
                f"RHR +{rhr_delta:.0f} bpm above baseline ({last_rhr} vs {rhr_baseline:.0f} avg). "
                "Possible illness or significant stress. Rest recommended."))
        elif rhr_delta >= 5:
            alerts.append(("warning",
                f"RHR +{rhr_delta:.0f} bpm above baseline. Monitor closely — could indicate illness onset."))

    # --- HRV suppression ---
    if hrv_dev is not None:
        if hrv_dev < -1.5:
            alerts.append(("critical",
                f"HRV severely suppressed ({hrv_dev:+.1f}SD). "
                "Sympathetic dominance — nervous system is under-recovered."))
        elif hrv_dev < -1.0:
            alerts.append(("warning",
                f"HRV suppressed ({hrv_dev:+.1f}SD below your baseline). "
                "Reduce load today, prioritise sleep tonight."))

    # --- Multi-metric illness onset pattern ---
    illness_signals = sum([
        rhr_delta is not None and rhr_delta >= 5,
        hrv_dev is not None and hrv_dev < -1.0,
        sleep_score_avg is not None and sleep_score_avg < 55,
    ])
    if illness_signals >= 2:
        alerts.append(("critical",
            "Multiple recovery signals suppressed simultaneously (RHR↑, HRV↓, sleep↓). "
            "Possible illness onset — rest today and monitor."))

    # --- Sleep quality cluster ---
    if sleep_score_avg is not None and sleep_score_avg < 50:
        alerts.append(("warning",
            f"3-day avg sleep score {sleep_score_avg:.0f} — sustained poor sleep "
            "compounds fatigue faster than training load alone."))
    elif sleep_hrs_avg is not None and sleep_hrs_avg < 6.5:
        alerts.append(("warning",
            f"Avg {sleep_hrs_avg:.1f}h sleep over last 3 nights — below recovery threshold."))

    # --- Subjective readiness signals ---
    if readiness:
        overall = readiness.get("overall")
        energy  = readiness.get("energy")
        going_out_last_night = await _went_out_last_night(checkin_repo, today, user_id)

        if going_out_last_night:
            alerts.append(("warning",
                "You went out last night — expect reduced recovery quality. "
                "Prioritise technique over intensity today."))

        if overall is not None and overall <= 3:
            alerts.append(("critical",
                f"Overall feel {overall}/10 — very low. "
                "Consider rest or easy movement only."))
        elif overall is not None and overall <= 5:
            alerts.append(("warning",
                f"Overall feel {overall}/10 — below average. Reduce today's planned load."))

        if energy is not None and energy <= 3:
            alerts.append(("warning",
                f"Energy level {energy}/10 — low. Favour shorter, lower-intensity work."))

        soreness = readiness.get("soreness")
        if (soreness is not None and soreness >= 7
                and going_out_last_night
                and hrv_dev is not None and hrv_dev < -0.5):
            alerts.append(("critical",
                f"High soreness ({soreness}/10) + went out last night + HRV dip — "
                "recovery is compromised. Easy day strongly recommended."))

    order = {"critical": 0, "warning": 1, "info": 2}
    alerts.sort(key=lambda x: order[x[0]])
    return alerts


# ---------------------------------------------------------------------------
# Plain-English metric interpretations (no DB access — stays sync)
# ---------------------------------------------------------------------------

def interpret_metrics(tl_metrics: dict, hrv_status: dict) -> list[str]:
    """
    Returns a list of interpretation strings for CTL/ATL/TSB, HRV, and ramp.
    Each string is one concise sentence suitable for display in the recommendation.
    """
    lines = []

    tsb  = tl_metrics["tsb"]
    ctl  = tl_metrics["ctl"]
    atl  = tl_metrics["atl"]
    ramp = tl_metrics["ramp_rate"]
    acwr = atl / ctl if ctl > 5 else None

    if tsb > 10:
        lines.append(f"Form is high (TSB {tsb:+.0f}) — your body is primed, good day to push.")
    elif tsb > 5:
        lines.append(f"You're fresh (TSB {tsb:+.0f}) — lean toward the harder end of today's plan.")
    elif tsb >= -5:
        lines.append(f"Balanced load (TSB {tsb:+.0f}) — fitness and fatigue are in equilibrium.")
    elif tsb >= -15:
        lines.append(f"Productive fatigue (TSB {tsb:+.0f}) — fitness is building, train as planned.")
    elif tsb >= -25:
        lines.append(f"Accumulated fatigue (TSB {tsb:+.0f}) — you're digging a hole. Manageable, but watch the trend.")
    else:
        lines.append(f"Deep fatigue (TSB {tsb:+.0f}) — recovery is overdue.")

    if ramp > 5:
        lines.append(f"Fitness ramp +{ramp:.1f} CTL/week — building well, watch total load.")
    elif ramp > 0:
        lines.append(f"Fitness slowly building (+{ramp:.1f} CTL/week).")
    elif ramp > -3:
        lines.append(f"Fitness holding steady ({ramp:+.1f} CTL/week).")
    else:
        lines.append(f"Fitness declining ({ramp:+.1f} CTL/week) — needs more consistent training.")

    if acwr:
        if acwr < 0.8:
            lines.append(f"ACWR {acwr:.2f} — below training zone, risk of detraining.")
        elif acwr <= 1.3:
            lines.append(f"ACWR {acwr:.2f} — load is in the optimal training zone.")
        elif acwr <= 1.5:
            lines.append(f"ACWR {acwr:.2f} — above optimal zone, ease into this week.")
        else:
            lines.append(f"ACWR {acwr:.2f} — load spike. Injury risk is elevated.")

    if hrv_status["status"] != "no_data" and hrv_status.get("deviation") is not None:
        dev   = hrv_status["deviation"]
        trend = hrv_status["trend"]
        if dev > 0.5:
            line = f"HRV elevated (+{dev:.1f}SD above baseline)"
        elif dev < -1.0:
            line = f"HRV suppressed ({dev:+.1f}SD) — nervous system needs recovery"
        else:
            line = f"HRV within normal range ({dev:+.1f}SD)"
        trend_note = {"rising": " and trending up — recovery accelerating.",
                      "falling": " and trending down — monitor closely.",
                      "stable":  "."}
        lines.append(line + trend_note.get(trend, "."))

    return lines