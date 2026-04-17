"""
Daily training recommendation engine.

Reads today's morning check-in, yesterday's training, recent load,
sleep, and weather — then outputs what to do today and why.

CLI entry point has moved to cli/ — this module is the async API path only.
"""

from datetime import timedelta

from intelligence.training_load import tsb_intensity_hint
from intelligence.recovery import get_muscle_freshness
from repos.checkin_repo import CheckinRepo
from repos.strength_repo import StrengthRepo
from repos.workout_repo import WorkoutRepo
from repos.sleep_repo import SleepRepo
from repos.environment_repo import EnvironmentRepo
from repos.user_repo import UserRepo


# ---------------------------------------------------------------------------
# Garmin sport key → human label + category
# ---------------------------------------------------------------------------

SPORT_META = {
    "running":          {"label": "Road Run",        "category": "run",    "lower_load": True,  "upper_load": False},
    "trail_running":    {"label": "Trail Run",        "category": "run",    "lower_load": True,  "upper_load": False},
    "cycling":          {"label": "Road Bike",        "category": "bike",   "lower_load": True,  "upper_load": False},
    "mountain_biking":  {"label": "XC MTB",           "category": "bike",   "lower_load": True,  "upper_load": False},
    "indoor_cycling":   {"label": "Stationary Bike",  "category": "bike",   "lower_load": True,  "upper_load": False},
    "bouldering":       {"label": "Bouldering",       "category": "climb",  "lower_load": False, "upper_load": True},
    "resort_skiing":    {"label": "Skiing",           "category": "ski",    "lower_load": True,  "upper_load": False},
    "indoor_cardio":    {"label": "Cardio",           "category": "cardio", "lower_load": True,  "upper_load": False},
    "strength_training":{"label": "Gym (Garmin)",     "category": "gym",    "lower_load": False, "upper_load": False},
}

# Maps Garmin sport field values → user profile sport keys
_GARMIN_TO_SPORT_KEY = {
    "trail_running":      "trail_run",
    "running":            "road_run",
    "mountain_biking":    "xc_mtb",
    "cycling":            "bike",
    "road_biking":        "bike",
    "indoor_cycling":     "bike",
    "bouldering":         "climbing",
    "climbing":           "climbing",
    "skiing":             "ski",
    "backcountry_skiing": "ski",
    "resort_skiing":      "ski",
    "snowboarding":       "snowboard",
}

_SPORT_KEY_LABELS = {
    "trail_run":  "Trail Running",
    "xc_mtb":     "XC MTB",
    "climbing":   "Climbing",
    "ski":        "Skiing",
    "snowboard":  "Snowboarding",
    "road_run":   "Road Running",
    "bike":       "Road Cycling",
}

# Athlete sport priority profile — weights 1-5 (used when user has no profile)
ATHLETE_SPORTS = {
    "xc_mtb":    5,
    "trail_run": 5,
    "climbing":  4,
    "ski":       2,
    "snowboard": 1,
}


# ---------------------------------------------------------------------------
# Data-fetching functions (all async, repo-injected)
# ---------------------------------------------------------------------------

async def get_readiness(checkin_repo: CheckinRepo, today, user_id: int = 1):
    row = await checkin_repo.get_readiness(user_id, today)
    if not row:
        return None
    return {
        "overall":     row.overall_feel,
        "legs":        row.legs_feel,
        "upper":       row.upper_body_feel,
        "joints":      row.joint_feel,
        "injury_note": row.injury_note,
        "time":        row.time_available,
        "going_out":   row.going_out_tonight,
    }


async def get_yesterdays_training(
    checkin_repo: CheckinRepo,
    strength_repo: StrengthRepo,
    workout_repo: WorkoutRepo,
    yesterday,
    user_id: int = 1,
):
    """
    Returns a dict describing yesterday's training.
    Gym sessions take precedence over the Garmin strength_training entry.
    Augmented with load_feel from workout_reflection (-2..+2) when available.
    """
    load_feel = await checkin_repo.get_load_feel(user_id, yesterday)

    gym_row = await strength_repo.get_session_type_for_date(user_id, yesterday)
    if gym_row:
        return {"source": "gym", "session_type": gym_row.session_type,
                "sport": None, "load_feel": load_feel}

    garmin_row = await workout_repo.get_garmin_workout_for_date(user_id, yesterday)
    if garmin_row:
        meta = SPORT_META.get(garmin_row.sport,
                              {"label": garmin_row.sport, "category": "other",
                               "lower_load": False, "upper_load": False})
        return {
            "source":       "garmin",
            "session_type": meta["category"],
            "sport":        garmin_row.sport,
            "label":        meta["label"],
            "volume":       garmin_row.training_volume,
            "avg_hr":       garmin_row.avg_heart_rate,
            "lower_load":   meta["lower_load"],
            "upper_load":   meta["upper_load"],
            "load_feel":    load_feel,
        }

    return {"source": "rest", "session_type": "rest", "load_feel": load_feel}


async def get_last_nights_sleep(sleep_repo: SleepRepo, today, user_id: int = 1):
    # Garmin labels sleep by the morning you wake up → today = last night
    row = await sleep_repo.get_for_date(user_id, today)
    if not row:
        return None
    return {
        "duration":     row.duration_minutes,
        "score":        row.sleep_score,
        "hrv":          row.hrv,
        "rhr":          row.rhr,
        "hrv_status":   row.hrv_status,
        "body_battery": row.body_battery_change,
    }


async def get_recent_load(workout_repo: WorkoutRepo, today, days: int = 7, user_id: int = 1):
    """Running km and bike minutes over the last N days."""
    since = today - timedelta(days=days)
    rows  = await workout_repo.get_recent_sport_load(user_id, since, today)
    load  = {"run_km": 0.0, "bike_min": 0.0, "climb_sessions": 0}
    for row in rows:
        sport   = row[0]
        volume  = row[2]
        minutes = row[3]
        if sport in ("running", "trail_running"):
            load["run_km"] += float(volume or 0) / 1000
        elif sport in ("cycling", "mountain_biking", "indoor_cycling"):
            load["bike_min"] += float(minutes or 0)
        elif sport == "bouldering":
            load["climb_sessions"] += 1
    return load


async def get_recent_load_by_sport(
    user_repo: UserRepo,
    workout_repo: WorkoutRepo,
    today,
    days: int = 7,
    user_id: int = 1,
):
    """
    Per-sport load for the last N days, keyed by the user's active sports.
    Each entry: {key, label, sessions, minutes, km}
    Ordered by user sport priority (highest first).
    """
    profile = await user_repo.get_by_id(user_id)
    user_sports = {}
    if profile and profile.primary_sports:
        raw = profile.primary_sports
        import json as _json
        user_sports = _json.loads(raw) if isinstance(raw, str) else raw

    since = today - timedelta(days=days)
    rows  = await workout_repo.get_recent_sport_load(user_id, since, today)

    accum = {}
    for row in rows:
        sport, sessions, volume, minutes = row[0], row[1], row[2], row[3]
        key = _GARMIN_TO_SPORT_KEY.get(sport)
        if key and key in user_sports:
            if key not in accum:
                accum[key] = {"sessions": 0, "minutes": 0.0, "km": 0.0}
            accum[key]["sessions"] += int(sessions or 0)
            accum[key]["minutes"]  += float(minutes or 0)
            accum[key]["km"]       += float(volume or 0) / 1000

    result = []
    for key in sorted(user_sports, key=lambda k: -user_sports[k]):
        data = accum.get(key, {"sessions": 0, "minutes": 0.0, "km": 0.0})
        result.append({
            "key":      key,
            "label":    _SPORT_KEY_LABELS.get(key, key),
            "sessions": data["sessions"],
            "minutes":  round(data["minutes"]),
            "km":       round(data["km"], 1),
        })
    return result


async def get_latest_weather(environment_repo: EnvironmentRepo):
    row = await environment_repo.get_latest()
    if not row:
        return None
    return {"temp": row.temperature, "rain": row.precipitation, "wind": row.wind_speed}


async def get_gym_analysis(strength_repo: StrengthRepo, today, user_id: int = 1):
    """
    Fetches the last 2 upper + 2 lower sessions with exercise labels.
    Returns per-session CNS totals, movement pattern breakdown, and muscle coverage.
    """
    rows = await strength_repo.get_gym_analysis(user_id, today)

    from collections import defaultdict, Counter
    sessions     = defaultdict(lambda: {"cns_total": 0, "fatigue_total": 0,
                                         "patterns": Counter(), "muscles": Counter(),
                                         "qualities": Counter()})
    session_order = []
    for row in rows:
        session_date, session_type, pattern, quality, muscles, cns, fatigue = (
            row.session_date, row.session_type, row.movement_pattern,
            row.quality_focus, row.primary_muscles, row.cns_load, row.systemic_fatigue,
        )
        key = (session_date, session_type)
        if key not in session_order:
            session_order.append(key)
        s = sessions[key]
        s["cns_total"]     += (cns or 0)
        s["fatigue_total"] += (fatigue or 0)
        if pattern:
            s["patterns"][pattern] += 1
        if quality:
            s["qualities"][quality] += 1
        for m in (muscles or []):
            s["muscles"][m] += 1

    result = {"upper": [], "lower": []}
    for key in session_order:
        session_date, session_type = key
        if session_type in result and len(result[session_type]) < 2:
            result[session_type].append({
                "date":          session_date,
                "cns_total":     sessions[key]["cns_total"],
                "fatigue_total": sessions[key]["fatigue_total"],
                "patterns":      dict(sessions[key]["patterns"]),
                "muscles":       dict(sessions[key]["muscles"]),
                "qualities":     dict(sessions[key]["qualities"]),
            })
    return result


async def get_last_performance(strength_repo: StrengthRepo, name: str, user_id: int = 1):
    return await strength_repo.get_last_performance(user_id, name)


async def get_muscle_importance(strength_repo: StrengthRepo, user_id: int = 1) -> dict:
    """
    Derives muscle importance from exercises table: for each muscle that appears
    as primary, compute weighted sport relevance using ATHLETE_SPORTS × sport_carryover.
    """
    rows   = await strength_repo.get_muscle_importance()
    totals = {}
    counts = {}
    for row in rows:
        muscles   = row.primary_muscles
        carryover = row.sport_carryover
        if not muscles or not carryover:
            continue
        sport_score = sum(
            ATHLETE_SPORTS.get(sport, 0) * float(val)
            for sport, val in carryover.items()
        )
        for m in muscles:
            totals[m] = totals.get(m, 0) + sport_score
            counts[m] = counts.get(m, 0) + 1
    return {m: totals[m] / counts[m] for m in totals}


async def get_weekly_muscle_frequency(
    strength_repo: StrengthRepo, today, user_id: int = 1
) -> dict:
    """Returns dict: muscle → number of sessions in last 7 days it appeared as primary."""
    week_start = today - timedelta(days=7)
    rows = await strength_repo.get_weekly_muscle_frequency(user_id, week_start, today)
    freq = {}
    for row in rows:
        for m in (row.primary_muscles or []):
            freq[m] = freq.get(m, 0) + 1
    return freq


async def get_consecutive_training_days(workout_repo: WorkoutRepo, today, user_id: int = 1) -> int:
    """How many days in a row has there been some training activity."""
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


async def get_exercise_suggestions(
    strength_repo: StrengthRepo,
    workout_repo: WorkoutRepo,
    gym_rec: dict | None,
    today,
    user_id: int = 1,
) -> list[dict]:
    """
    Selects 5 exercises for the recommended gym session.
    """
    if not gym_rec:
        return []

    focus_patterns  = gym_rec["focus"]
    is_light        = gym_rec["intensity"] == "light"
    session_type    = gym_rec.get("session_type", "upper")
    allowed_muscles = _SESSION_MUSCLE_FILTER.get(session_type, _UPPER_MUSCLES)

    candidates_raw = await strength_repo.get_exercise_suggestions(
        user_id, focus_patterns, session_type, today
    )
    candidates = [
        row for row in candidates_raw
        if not row.primary_muscles or bool(set(row.primary_muscles) & allowed_muscles)
    ]

    importance   = await get_muscle_importance(strength_repo, user_id)
    weekly_freq  = await get_weekly_muscle_frequency(strength_repo, today, user_id)
    muscle_fresh = await get_muscle_freshness(strength_repo, workout_repo, today, user_id=user_id)
    target_freq  = {m: max(1, round(score / 6)) for m, score in importance.items()}

    def deficit_score(muscles):
        if not muscles:
            return 0
        return sum(
            max(0, target_freq.get(m, 1) - weekly_freq.get(m, 0)) * importance.get(m, 1)
            for m in muscles
        )

    def avg_freshness(muscles):
        if not muscles:
            return 1.0
        scores = [muscle_fresh.get(m, 1.0) for m in muscles]
        return sum(scores) / len(scores)

    def quality_fit(qf):
        if is_light:
            return {"power": 1, "strength": 2, "hypertrophy": 2,
                    "stability": 1, "endurance": 1}.get(qf, 1)
        else:
            return {"power": 2, "strength": 2, "hypertrophy": 1,
                    "stability": 0, "endurance": 0}.get(qf, 1)

    def familiar_factor(last_done):
        return 1.0 if last_done is not None else 0.1

    def recency_factor(last_done):
        if last_done is None:
            return 1.0
        days_ago = (today - last_done).days
        if days_ago <= 7:
            return 0.2
        if days_ago <= 14:
            return 0.8
        return 1.0

    ranked = sorted(
        candidates,
        key=lambda r: -(
            deficit_score(r.primary_muscles or [])
            * quality_fit(r.quality_focus)
            * avg_freshness(r.primary_muscles or [])
            * familiar_factor(r.last_done)
            * recency_factor(r.last_done)
        ),
    )

    selected         = []
    session_muscles  = set()
    used_names       = set()
    covered_patterns = set()

    def _add(row, check_overlap=False):
        if row.name in used_names:
            return False
        muscles = row.primary_muscles or []
        if check_overlap and len(set(muscles) & session_muscles) >= 2:
            return False
        selected.append(row)
        session_muscles.update(muscles)
        used_names.add(row.name)
        covered_patterns.add(row.movement_pattern)
        return True

    # Phase 0: guarantee one explosive opener
    for row in ranked:
        if row.contraction_type == "explosive" and _add(row):
            break

    # Phase 1: guarantee one exercise per focus pattern
    for focus_pattern in focus_patterns:
        if focus_pattern in covered_patterns:
            continue
        for row in ranked:
            if row.movement_pattern == focus_pattern and _add(row):
                break

    # Phase 2: fill up to 5
    for row in ranked:
        if len(selected) >= 5:
            break
        _add(row, check_overlap=True)

    _ORDER = {"power": 0, "strength": 1, "hypertrophy": 1, "stability": 2,
              "endurance": 2, "isolation": 2}

    suggestions = []
    for row in selected:
        last_perf = await get_last_performance(strength_repo, row.name, user_id)
        s = _build_set_suggestion(row.name, row.movement_pattern, row.quality_focus,
                                  row.bilateral, last_perf, is_light)
        s["pattern"]   = row.movement_pattern
        s["quality"]   = row.quality_focus
        s["last_done"] = row.last_done
        s["_order"]    = _ORDER.get(row.quality_focus, 1) if row.quality_focus != "isolation" \
                         else _ORDER.get(row.movement_pattern, 2)
        suggestions.append(s)

    suggestions.sort(key=lambda x: x["_order"])
    for s in suggestions:
        del s["_order"]

    return suggestions


# ---------------------------------------------------------------------------
# Pure-logic helpers (no DB access — all sync)
# ---------------------------------------------------------------------------

_UPPER_MUSCLES = {
    "chest", "front_delt", "side_delt", "rear_delt",
    "biceps", "triceps", "forearms",
    "upper_back", "lats", "rhomboids", "traps",
}
_LOWER_MUSCLES = {
    "quads", "hamstrings", "hip_flexors", "hip_abductors", "hip_adductors",
    "glutes", "calves", "tibialis", "peroneals",
}
_SESSION_MUSCLE_FILTER = {
    "upper": _UPPER_MUSCLES | {"abs", "obliques"},
    "lower": _LOWER_MUSCLES | {"lower_back", "abs", "obliques"},
}

_MED_BALL = {"Med Ball Chest-to-Ground Throws", "Med Ball Twist Throws"}

_SESSION_TEMPLATES = {
    "upper": ["push_h", "pull_v", "pull_h", "push_v", "isolation"],
    "lower": ["plyo", "hinge", "squat", "stability", "isolation"],
    "push":  ["push_h", "push_v", "isolation"],
    "pull":  ["pull_v", "pull_h", "isolation"],
    "legs":  ["plyo", "hinge", "squat", "stability", "isolation"],
    "full":  ["push_h", "pull_v", "hinge", "squat", "stability"],
}


def _build_set_suggestion(name, pattern, quality_focus, bilateral, last_perf, is_light):
    is_bw    = bool(last_perf and last_perf[0][5])
    band     = last_perf[0][6] if last_perf else None
    wkg      = last_perf[0][3] if last_perf else None
    per_hand = bool(last_perf and last_perf[0][7])
    base_w   = wkg
    reps_list = [r[1] for r in last_perf if r[1] is not None] if last_perf else []
    dur_list  = [r[2] for r in last_perf if r[2] is not None] if last_perf else []

    avg_reps = sum(reps_list) / len(reps_list) if reps_list else None
    min_reps = min(reps_list) if reps_list else None

    if quality_focus == "power":
        n_sets = 4 if is_light else 5
    elif quality_focus in ("strength", "hypertrophy"):
        n_sets = 3 if is_light else 4
    else:
        n_sets = 2 if is_light else 3

    def fmt_w(w):
        if w is None:
            return "start light"
        return f"{w:g}kg" + ("/hand" if per_hand else "")

    if quality_focus == "power":
        target_reps = int(avg_reps) if avg_reps else 4
        if name in _MED_BALL:
            return {"name": name, "sets": n_sets, "reps": target_reps,
                    "weight_str": "med ball", "note": "focus on speed and distance"}
        if is_bw:
            return {"name": name, "sets": n_sets, "reps": target_reps,
                    "weight_str": "BW",
                    "note": "focus on height / distance / reactive contact time"}
        if band:
            return {"name": name, "sets": n_sets, "reps": target_reps,
                    "weight_str": f"band({band})",
                    "note": "move to lighter band when reps feel explosive and easy"}
        return {"name": name, "sets": n_sets, "reps": target_reps,
                "weight_str": fmt_w(base_w),
                "note": "increase weight when 5 reps feels consistently easy (RPE ≤ 7)"}

    if quality_focus in ("stability", "endurance") or pattern == "isolation":
        if dur_list:
            avg_dur = int(sum(dur_list) / len(dur_list))
            w_str = "BW" if is_bw else fmt_w(base_w)
            return {"name": name, "sets": n_sets, "reps": None,
                    "duration": avg_dur, "weight_str": w_str, "note": ""}
        r = int(avg_reps) if avg_reps else 12
        w_str = ("BW" if is_bw
                 else f"band({band})" if band
                 else fmt_w(base_w))
        return {"name": name, "sets": n_sets, "reps": r, "weight_str": w_str, "note": ""}

    upper_threshold = 10 if quality_focus == "hypertrophy" else 8
    bw_rep_limit    = 15

    if not last_perf:
        return {"name": name, "sets": n_sets, "reps": 6,
                "weight_str": "start light", "note": "no history — start conservative"}

    if is_bw:
        if avg_reps and avg_reps >= bw_rep_limit:
            return {"name": name, "sets": n_sets, "reps": 8,
                    "weight_str": "+2.5kg",
                    "note": f"hit {bw_rep_limit} reps — time to add weight, aim for 8 reps"}
        suggest_reps = int(avg_reps) + 1 if avg_reps else bw_rep_limit - 3
        return {"name": name, "sets": n_sets, "reps": suggest_reps,
                "weight_str": "BW",
                "note": f"build to {bw_rep_limit} reps before adding weight"}

    if band:
        r = int(avg_reps) if avg_reps else 8
        return {"name": name, "sets": n_sets, "reps": r,
                "weight_str": f"band({band})", "note": ""}

    if min_reps is not None and min_reps >= upper_threshold:
        suggest_w = (base_w or 0) + 2.5
        note = f"+2.5kg{'/ hand' if per_hand else ''} (was {fmt_w(base_w)}) — aim for 6+ reps"
        r    = 6
    elif min_reps is not None and min_reps < 6:
        suggest_w = max((base_w or 0) - 2.5, 0)
        note = f"consider dropping to {fmt_w(suggest_w)} (fell below 6 reps last time)"
        r    = 8
    else:
        suggest_w = base_w
        r    = int(avg_reps) + 1 if avg_reps else 6
        note = f"add a rep (last avg: {avg_reps:.1f})" if avg_reps else ""
    return {"name": name, "sets": n_sets, "reps": r,
            "weight_str": fmt_w(suggest_w), "note": note}


def apply_blocks(readiness, yesterday, weather):
    blocks = {}
    yesterday_type = yesterday.get("session_type")

    if yesterday_type == "lower":
        blocks["run"]       = "Lower body gym yesterday — legs need recovery"
        blocks["trail_run"] = "Lower body gym yesterday — legs need recovery"
        blocks["gym_lower"] = "Lower body gym yesterday — need at least 48h before next lower session"

    if yesterday_type == "upper":
        blocks["climb"]     = "Upper body gym yesterday — joints and ligaments need recovery"
        blocks["gym_upper"] = "Upper body gym yesterday — need at least 48h before next upper session"

    if readiness:
        if readiness["legs"] and readiness["legs"] <= 4:
            blocks["run"]       = "Legs feel too poor for running"
            blocks["trail_run"] = "Legs feel too poor for running"
            blocks["gym_lower"] = blocks.get("gym_lower", f"Legs feel poor ({readiness['legs']}/10) — skip lower gym")
            blocks["bike"]      = blocks.get("bike", "Legs feel poor — easy Z2 only if biking")

        if readiness["upper"] and readiness["upper"] <= 4:
            blocks["climb"]     = f"Upper body feel too poor for climbing ({readiness['upper']}/10)"
            blocks["gym_upper"] = blocks.get("gym_upper", f"Upper body feel too poor ({readiness['upper']}/10) — skip upper gym")

        if readiness["joints"] and readiness["joints"] <= 4:
            blocks["run"]       = f"Joint/injury feel too low ({readiness['joints']}/10)"
            blocks["trail_run"] = f"Joint/injury feel too low ({readiness['joints']}/10)"
            blocks["climb"]     = f"Joint/injury feel too low ({readiness['joints']}/10)"
            blocks["gym_upper"] = blocks.get("gym_upper", f"Joint feel too low ({readiness['joints']}/10) — skip upper gym")
            blocks["gym_lower"] = blocks.get("gym_lower", f"Joint feel too low ({readiness['joints']}/10) — skip lower gym")

        if readiness["overall"] and readiness["overall"] <= 3:
            blocks["intensity"] = "Overall feel very low — rest or easy Z2 only"
            blocks["gym_upper"] = blocks.get("gym_upper", "Overall feel too low for gym")
            blocks["gym_lower"] = blocks.get("gym_lower", "Overall feel too low for gym")

    if weather:
        if weather["rain"] and weather["rain"] > 0.5:
            blocks["trail_run"] = "Rain — technical trail too risky"
            blocks["xc_mtb"]    = "Rain — muddy and slippery on MTB"
            blocks["intensity"] = blocks.get("intensity", "Rain — avoid threshold outdoor sessions")
        if weather["temp"] and weather["temp"] > 30:
            blocks["intensity"] = blocks.get("intensity", "Extreme heat — no high intensity outdoors")

    return blocks


def _gym_intensity_label(gym_rec: dict) -> str:
    lvl = gym_rec.get("intensity", "moderate")
    typ = gym_rec.get("session_type", "upper")
    if lvl == "heavy":
        return "Power focus" if typ == "lower" else "Push+Pull heavy"
    if lvl == "light":
        return "Stability focus" if typ == "lower" else "Movement quality"
    return "Moderate"


def _describe_gym_day(gym_type, gym_analysis, today, tsb=0):
    focus    = _SESSION_TEMPLATES.get(gym_type, _SESSION_TEMPLATES["upper"])
    sessions = gym_analysis.get(gym_type, [])

    if not sessions:
        return {
            "intensity":    "moderate",
            "focus":        focus,
            "focus_label":  "First session — moderate intensity",
            "why":          f"No {gym_type} gym history — start moderate",
            "session_type": gym_type,
        }

    last           = sessions[0]
    cns            = last["cns_total"]
    threshold      = 15 if gym_type == "upper" else 13
    last_was_heavy = cns >= threshold

    if tsb > 10:
        last_was_heavy = False
    elif tsb < -15:
        last_was_heavy = True

    tsb_label, _ = tsb_intensity_hint(tsb)

    if gym_type == "upper":
        pushes = last["patterns"].get("push_h", 0) + last["patterns"].get("push_v", 0)
        pulls  = last["patterns"].get("pull_h", 0) + last["patterns"].get("pull_v", 0)
        if last_was_heavy:
            emphasis  = "pull-dominant" if pushes >= pulls else "push-dominant"
            label     = f"Full upper — {emphasis} emphasis"
            why       = f"CNS {cns} last upper + TSB {tsb:+.0f} ({tsb_label}) — light day, {emphasis}"
            intensity = "light"
        else:
            label     = "Full upper — heavy, balanced push + pull"
            why       = f"CNS {cns} last upper + TSB {tsb:+.0f} ({tsb_label}) — heavy day, full push + pull"
            intensity = "heavy"
    else:
        if last_was_heavy:
            label     = "Full lower — strength + stability focus"
            why       = f"CNS {cns} last lower + TSB {tsb:+.0f} ({tsb_label}) — strength/stability emphasis"
            intensity = "light"
        else:
            label     = "Full lower — power + strength focus"
            why       = f"CNS {cns} last lower + TSB {tsb:+.0f} ({tsb_label}) — power/strength day"
            intensity = "heavy"

    return {
        "intensity":    intensity,
        "focus":        focus,
        "focus_label":  label,
        "why":          why,
        "session_type": gym_type,
    }


def _days_since(last_date, today):
    if last_date is None:
        return None
    return (today - last_date).days


def _fmt_days(d):
    if d is None:
        return "never"
    return f"{d}d ago"


def _pick_gym_type(gym_analysis, today):
    last_upper_date = gym_analysis["upper"][0]["date"] if gym_analysis["upper"] else None
    last_lower_date = gym_analysis["lower"][0]["date"] if gym_analysis["lower"] else None
    days_upper = _days_since(last_upper_date, today)
    days_lower = _days_since(last_lower_date, today)
    eff_upper  = days_upper if days_upper is not None else 9999
    eff_lower  = days_lower if days_lower is not None else 9999
    if eff_upper < eff_lower:
        return "lower"
    elif eff_lower < eff_upper:
        return "upper"
    return "upper"


def build_recommendation(readiness, yesterday, sleep, weather, load,
                         consecutive_days, gym_analysis, today, tl_metrics, user_id=1):
    """Core decision logic. Returns a recommendation dict."""
    tsb            = tl_metrics["tsb"]
    blocks         = apply_blocks(readiness, yesterday, weather)
    yesterday_type = yesterday.get("session_type", "rest")
    time_available = readiness["time"] if readiness else "medium"

    if consecutive_days >= 6:
        return {
            "primary":   "Rest Day",
            "intensity": None,
            "duration":  None,
            "why":       f"You've trained {consecutive_days} days in a row — a rest day is not optional.",
            "avoid":     [],
            "notes":     [],
        }

    if readiness and readiness["overall"] and readiness["overall"] <= 3:
        return {
            "primary":   "Rest or very easy Z2 bike (20-30 min)",
            "intensity": "Z1/Z2",
            "duration":  "20-30 min",
            "why":       f"Overall feel is {readiness['overall']}/10 — your body is telling you something. Active recovery at most.",
            "avoid":     list(blocks.keys()),
            "notes":     [],
        }

    notes = []
    avoid = []

    load_feel = yesterday.get("load_feel")
    if load_feel is not None:
        if load_feel <= -2:
            notes.append("Yesterday felt much too easy — push harder today, the engine will step up your load")
        elif load_feel == -1:
            notes.append("Yesterday felt slightly easy — room to increase intensity today")
        elif load_feel == 1:
            notes.append("Yesterday was slightly taxing — keep today comfortable, don't compound fatigue")
        elif load_feel >= 2:
            notes.append("Yesterday was too hard — back off intensity today to allow proper recovery")

    if sleep:
        if sleep["score"] and sleep["score"] < 60:
            notes.append(f"Poor sleep score ({sleep['score']:.0f}) — keep intensity conservative today")
        if sleep["hrv_status"] and sleep["hrv_status"] in ("UNBALANCED", "LOW"):
            notes.append(f"HRV status is {sleep['hrv_status']} — body still under stress")
        if sleep["body_battery"] and sleep["body_battery"] < 20:
            notes.append(f"Body battery only recovered {sleep['body_battery']} points overnight — take it easy")

    if readiness and readiness["going_out"]:
        notes.append("You're going out tonight — keep today's session moderate, don't dig a hole")

    if load["run_km"] > 0:
        notes.append(f"Running load this week: {load['run_km']:.1f} km — stay within 10% increase week over week")

    last_upper_date  = gym_analysis["upper"][0]["date"] if gym_analysis["upper"] else None
    last_lower_date  = gym_analysis["lower"][0]["date"] if gym_analysis["lower"] else None
    days_since_upper = _days_since(last_upper_date, today)
    days_since_lower = _days_since(last_lower_date, today)

    gym_rec = None

    if yesterday_type == "lower":
        avoid.append("Running (lower body recovery)")
        if time_available != "short" and "gym_upper" not in blocks and (days_since_upper is None or days_since_upper >= 2):
            gym_rec   = _describe_gym_day("upper", gym_analysis, today, tsb)
            primary   = f"Upper Gym — {gym_rec['focus_label']}"
            intensity = gym_rec["intensity"].capitalize()
            duration  = "60-90 min"
            why = gym_rec["why"] + f" (last upper: {_fmt_days(days_since_upper)})"
        elif time_available == "short":
            primary = "Easy Z2 Stationary Bike (20-30 min)"
            intensity = "Z2"
            duration = "20-30 min"
            why = "Lower body trained yesterday. Short window — easy spin, legs moving without stress."
        else:
            primary = "Easy Z2 Stationary Bike (45-60 min)"
            intensity = "Z2"
            duration = "45-60 min"
            why = "Lower body trained yesterday. Bike keeps aerobic stimulus without impacting recovering legs."

    elif yesterday_type == "upper":
        avoid.append("Climbing (upper body/joint recovery)")
        if time_available != "short" and "gym_lower" not in blocks and (days_since_lower is None or days_since_lower >= 2):
            gym_rec   = _describe_gym_day("lower", gym_analysis, today, tsb)
            primary   = f"Lower Gym — {gym_rec['focus_label']}"
            intensity = gym_rec["intensity"].capitalize()
            duration  = "60-90 min"
            why = gym_rec["why"] + f" (last lower: {_fmt_days(days_since_lower)})"
        elif time_available == "short":
            primary = "Easy Z2 Stationary Bike (20-30 min)"
            intensity = "Z2"
            duration = "20-30 min"
            why = "Upper body trained yesterday. Short window — easy bike, lower body only."
        elif time_available == "medium":
            primary = "Road Run (flat, easy pace)"
            intensity = "Z2"
            duration = "30-40 min"
            why = "Upper body trained yesterday — legs are fresh. Easy flat run to build the aerobic base."
        else:
            primary = "Road Run or Outdoor Bike (flat, easy)"
            intensity = "Z2"
            duration = "45-60 min"
            why = "Upper body trained yesterday — legs are fresh and ready. Good window for base building."

    else:
        gym_type_candidate = _pick_gym_type(gym_analysis, today)
        gym_block_key      = f"gym_{gym_type_candidate}"
        days_since_gym     = days_since_upper if gym_type_candidate == "upper" else days_since_lower
        gym_is_priority    = (days_since_gym is None or days_since_gym >= 2) and gym_block_key not in blocks

        if time_available == "short":
            primary = "Easy Z2 Stationary Bike (30 min)"
            intensity = "Z2"
            duration = "30 min"
            why = "Short window — stationary bike is the lowest friction option. Still moves the aerobic needle."

        elif time_available == "medium":
            if gym_is_priority:
                gym_rec   = _describe_gym_day(gym_type_candidate, gym_analysis, today, tsb)
                primary   = f"{gym_type_candidate.capitalize()} Gym — {gym_rec['focus_label']}"
                intensity = gym_rec["intensity"].capitalize()
                duration  = "60-90 min"
                why = gym_rec["why"] + f" (last {gym_type_candidate}: {_fmt_days(days_since_gym)})"
            elif "climb" not in blocks and readiness and readiness["upper"] and readiness["upper"] >= 7:
                primary = "Bouldering (technique focus)"
                intensity = "Moderate"
                duration = "1.5-2 hrs"
                why = "Fresh day, good upper body feel, medium window — good day for technical climbing work."
            elif "run" not in blocks:
                primary = "Road Run (flat, easy)"
                intensity = "Z2"
                duration = "30-40 min"
                why = "Fresh day, medium window — easy flat run to build the running base back up."
            else:
                primary = "Easy Z2 Stationary Bike (45 min)"
                intensity = "Z2"
                duration = "45 min"
                why = "Other options blocked — stationary bike keeps the aerobic work going."

        else:  # long
            if gym_is_priority:
                gym_rec   = _describe_gym_day(gym_type_candidate, gym_analysis, today, tsb)
                primary   = f"{gym_type_candidate.capitalize()} Gym — {gym_rec['focus_label']}"
                intensity = gym_rec["intensity"].capitalize()
                duration  = "75-105 min"
                why = gym_rec["why"] + f" (last {gym_type_candidate}: {_fmt_days(days_since_gym)})"
            elif "run" not in blocks and "trail_run" not in blocks:
                primary = "Road Run or Trail Run (easy pace)"
                intensity = "Z2"
                duration = "45-75 min"
                why = "Fresh day, long window — best opportunity for a longer aerobic run. Keep it easy, build the base."
            elif "climb" not in blocks:
                primary = "Bouldering + Z2 Bike"
                intensity = "Moderate + Z2"
                duration = "2-3 hrs total"
                why = "Fresh day, long window — combine climbing with a bike session for full training coverage."
            else:
                primary = "Long Z2 Bike (outdoor or stationary)"
                intensity = "Z2"
                duration = "60-90 min"
                why = "Fresh day, long window — solid base building ride."

    if gym_rec and load_feel is not None:
        if load_feel <= -1 and gym_rec.get("intensity") == "light":
            gym_rec["intensity"]   = "moderate"
            gym_rec["focus_label"] = gym_rec.get("focus_label", "").replace("Light", "Moderate")
            gym_rec["why"]         = gym_rec.get("why", "") + " (bumped from light — yesterday felt too easy)"
        elif load_feel >= 1 and gym_rec.get("intensity") == "heavy":
            gym_rec["intensity"]   = "moderate"
            gym_rec["focus_label"] = gym_rec.get("focus_label", "").replace("Heavy", "Moderate")
            gym_rec["why"]         = gym_rec.get("why", "") + " (dropped from heavy — yesterday was already taxing)"

    if gym_rec:
        intensity = _gym_intensity_label(gym_rec)

    return {
        "primary":   primary,
        "intensity": intensity,
        "duration":  duration,
        "why":       why,
        "avoid":     avoid,
        "notes":     notes,
        "blocks":    blocks,
        "gym_rec":   gym_rec,
    }