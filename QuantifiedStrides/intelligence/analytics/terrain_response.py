"""
analytics/terrain_response.py

Terrain response analytics: how your body responds to elevation changes.

1. HR-Gradient Response Curve
   Buckets all data points by gradient band and computes mean HR, mean pace,
   mean GAP for each band. Your personal "grade cost" table.

2. Per-Run Elevation vs HR Decoupling
   As cumulative elevation gain increases during a run, does HR rise
   disproportionately relative to pace? Separates terrain fatigue from
   flat-ground cardiac drift.

3. Grade Cost Model
   Fits a simple linear model: for each 1% of additional gradient,
   how many extra bpm does your HR add (at constant pace)?
   Compared against Minetti's theoretical model to see how close you track it.

4. Optimal Gradient Finder
   At which gradient is your pace:effort ratio (speed per HR beat) best?
   Most runners peak around -2 to 0%. Reveals whether you run downhills well.
"""

from __future__ import annotations

from typing import Optional

from intelligence.analytics.running_economy import gap_multiplier
from repos.workout_metrics_repo import WorkoutMetricsRepo


# ---------------------------------------------------------------------------
# HR-Gradient response curve
# ---------------------------------------------------------------------------

GRADIENT_BANDS = [
    ("steep_down",   None,  -8.0),
    ("down",         -8.0,  -4.0),
    ("slight_down",  -4.0,  -1.0),
    ("flat",         -1.0,   1.0),
    ("slight_up",     1.0,   4.0),
    ("up",            4.0,   8.0),
    ("steep_up",      8.0,  None),
]


def _band_for(gradient_pct: float) -> str:
    for name, lo, hi in GRADIENT_BANDS:
        if (lo is None or gradient_pct >= lo) and (hi is None or gradient_pct < hi):
            return name
    return "flat"


async def get_hr_gradient_curve(
    metrics_repo: WorkoutMetricsRepo,
    days: int = 365,
    sport: str = "running",
    user_id: int = 1,
) -> list[dict]:
    """
    Aggregate HR and pace across all running workouts by gradient band.

    Returns list of dicts, one per band:
        band            : str  (label)
        gradient_mid    : float  (representative gradient for that band)
        avg_hr          : float
        avg_pace        : float  (min/km)
        avg_gap         : float  (grade-adjusted pace)
        efficiency      : float  (speed_ms / HR — higher = more efficient)
        count           : int
    """
    rows = await metrics_repo.get_hr_gradient_series(
        user_id=user_id, days=days, sport=sport, gradient_range=30
    )

    if not rows:
        return []

    band_data: dict[str, dict] = {
        name: {"hr": [], "pace": [], "gap": []}
        for name, _, _ in GRADIENT_BANDS
    }
    band_mid = {
        "steep_down": -10.0, "down": -6.0, "slight_down": -2.5,
        "flat": 0.0, "slight_up": 2.5, "up": 6.0, "steep_up": 10.0,
    }

    for hr, pace, grad in rows:
        band = _band_for(grad)
        band_data[band]["hr"].append(hr)
        band_data[band]["pace"].append(pace)
        band_data[band]["gap"].append(pace * gap_multiplier(grad))

    result = []
    for name, _, _ in GRADIENT_BANDS:
        d = band_data[name]
        if len(d["hr"]) < 10:
            continue
        avg_hr   = sum(d["hr"])   / len(d["hr"])
        avg_pace = sum(d["pace"]) / len(d["pace"])
        avg_gap  = sum(d["gap"])  / len(d["gap"])
        speed_ms = 1000.0 / (avg_pace * 60.0)
        result.append({
            "band":         name,
            "gradient_mid": band_mid[name],
            "avg_hr":       round(avg_hr,   1),
            "avg_pace":     round(avg_pace, 3),
            "avg_gap":      round(avg_gap,  3),
            "efficiency":   round(speed_ms / avg_hr, 6),
            "count":        len(d["hr"]),
        })

    return result


# ---------------------------------------------------------------------------
# Per-run elevation vs HR decoupling
# ---------------------------------------------------------------------------

async def get_elevation_hr_decoupling(
    workout_id: int,
    metrics_repo: WorkoutMetricsRepo,
) -> Optional[dict]:
    """
    Within a single run, track how HR evolves as cumulative elevation gain grows.

    Splits the run into 4 quartiles of cumulative elevation gain.
    For each quartile: mean HR, mean pace, mean GAP.

    A well-trained runner holds steady HR even as elevation accumulates.
    Rising HR in Q3/Q4 relative to pace → terrain fatigue.

    Returns dict or None if insufficient elevation data.
    """
    rows = await metrics_repo.get_elevation_series(workout_id)

    if len(rows) < 50:
        return None

    cum_gain = 0.0
    points = []
    prev_alt = rows[0][3]   # altitude is index 3
    for ts, hr, pace, alt, grad in rows:
        d_alt = alt - prev_alt
        if d_alt > 0:
            cum_gain += d_alt
        points.append((hr, pace, grad, cum_gain))
        prev_alt = alt

    if cum_gain < 20:   # less than 20m total gain → not meaningful
        return None

    q_size = cum_gain / 4
    quartiles = [[], [], [], []]
    for hr, pace, grad, cg in points:
        q = min(3, int(cg / q_size))
        quartiles[q].append((hr, pace, grad))

    def avg(data, idx):
        vals = [r[idx] for r in data if r[idx] is not None]
        return sum(vals) / len(vals) if vals else None

    result = {
        "workout_id":   workout_id,
        "total_gain_m": round(cum_gain, 1),
        "quartiles":    [],
    }

    for i, q in enumerate(quartiles):
        if not q:
            continue
        a_hr   = avg(q, 0)
        a_pace = avg(q, 1)
        a_grad = avg(q, 2)
        a_gap  = None
        if a_pace and a_grad is not None:
            a_gap = round(a_pace * gap_multiplier(a_grad), 3)

        result["quartiles"].append({
            "quartile":     i + 1,
            "count":        len(q),
            "avg_hr":       round(a_hr,   1) if a_hr   else None,
            "avg_pace":     round(a_pace, 3) if a_pace else None,
            "avg_gap":      a_gap,
            "avg_gradient": round(a_grad, 2) if a_grad is not None else None,
        })

    return result


# ---------------------------------------------------------------------------
# Grade cost model: HR per 1% grade increase (linear fit)
# ---------------------------------------------------------------------------

async def get_grade_cost_model(
    metrics_repo: WorkoutMetricsRepo,
    days: int = 365,
    sport: str = "running",
    user_id: int = 1,
) -> Optional[dict]:
    """
    Fit a linear model: HR ~ α + β × gradient_pct  (at matched pace bands).

    Returns:
        slope_bpm_per_pct : float  (HR cost per 1% gradient)
        intercept         : float
        r_squared         : float
        minetti_expected  : float  (theoretical HR cost from Minetti model)
    """
    rows = await metrics_repo.get_hr_gradient_series(
        user_id=user_id, days=days, sport=sport, gradient_range=20
    )

    if len(rows) < 100:
        return None

    xs = [r[2] for r in rows]   # gradient_pct
    ys = [r[0] for r in rows]   # heart_rate
    n  = len(xs)

    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    ss_xy  = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    ss_xx  = sum((x - mean_x) ** 2 for x in xs)

    if ss_xx == 0:
        return None

    slope     = ss_xy / ss_xx
    intercept = mean_y - slope * mean_x

    ss_res = sum((y - (slope * x + intercept)) ** 2 for x, y in zip(xs, ys))
    ss_tot = sum((y - mean_y) ** 2 for y in ys)
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0

    def _minetti(g):
        return 155.4*g**5 - 30.4*g**4 - 43.3*g**3 + 46.3*g**2 + 19.5*g + 3.6

    cost_flat = _minetti(0.0)
    cost_1pct = _minetti(0.01)
    minetti_expected = (cost_1pct / cost_flat - 1.0) * mean_y

    return {
        "slope_bpm_per_pct": round(slope, 3),
        "intercept":         round(intercept, 1),
        "r_squared":         round(r2, 4),
        "n_points":          n,
        "minetti_expected":  round(minetti_expected, 3),
        "mean_hr":           round(mean_y, 1),
    }


# ---------------------------------------------------------------------------
# Optimal gradient finder
# ---------------------------------------------------------------------------

async def get_optimal_gradient(
    metrics_repo: WorkoutMetricsRepo,
    days: int = 365,
    sport: str = "running",
    user_id: int = 1,
) -> Optional[dict]:
    """
    At which gradient (in 2% buckets) is your speed:HR ratio highest?
    speed_per_hr = (1000 / pace_s) / heart_rate   (m/s per bpm)

    Returns list of {gradient_pct, speed_per_hr, count} and the optimal band.
    """
    rows = await metrics_repo.get_hr_gradient_series(
        user_id=user_id, days=days, sport=sport, gradient_range=20
    )

    if not rows:
        return None

    buckets: dict[int, list[float]] = {}
    for hr, pace, grad in rows:
        speed_ms   = 1000.0 / (pace * 60.0)
        efficiency = speed_ms / hr
        b = round(grad / 2) * 2   # 2% buckets
        if b not in buckets:
            buckets[b] = []
        buckets[b].append(efficiency)

    bands = [
        {
            "gradient_pct": b,
            "speed_per_hr": round(sum(v) / len(v), 7),
            "count":        len(v),
        }
        for b, v in sorted(buckets.items())
        if len(v) >= 20
    ]

    if not bands:
        return None

    optimal = max(bands, key=lambda x: x["speed_per_hr"])

    return {
        "bands":              bands,
        "optimal_gradient":   optimal["gradient_pct"],
        "optimal_efficiency": optimal["speed_per_hr"],
    }


# ---------------------------------------------------------------------------
# Combined summary
# ---------------------------------------------------------------------------

async def get_terrain_summary(
    metrics_repo: WorkoutMetricsRepo,
    days: int = 365,
    sport: str = "running",
    user_id: int = 1,
) -> dict:
    """Returns all terrain response analytics as a single dict."""
    curve   = await get_hr_gradient_curve(metrics_repo, days=days, sport=sport, user_id=user_id)
    model   = await get_grade_cost_model(metrics_repo,  days=days, sport=sport, user_id=user_id)
    optimal = await get_optimal_gradient(metrics_repo,  days=days, sport=sport, user_id=user_id)

    return {
        "hr_gradient_curve": curve,
        "grade_cost_model":  model,
        "optimal_gradient":  optimal,
    }