# Implementation Protocol — Personal Aerobic Profile Model

This document translates the research done in notebooks `00`–`04` into a concrete
implementation spec for the dev team. Read the notebooks for the EDA context; read
this doc to know exactly what to build and where it lives in the app.

---

## What Was Established in the Research

Three athletes (Vlad, Ciulavu, Mircea) across ~300 running sessions and ~450k
per-second records. The research validated a **per-athlete aerobic profile model**:
a personal mapping of HR → speed, built from session-level aggregates and anchored
by a linear regression line. Outputs feed directly into zone calibration drift
detection and the recommendation engine.

---

## Data Contract

### Parquet files (research reference — mirrors what the app already stores)

| File | Key columns | Rows |
|---|---|---|
| `sessions.parquet` | `session_id`, `sport`, `date`, `duration_s`, `distance_m`, `avg_hr`, `max_hr`, `avg_cadence`, `avg_vo`, `avg_stance`, `avg_step_len`, `avg_vr`, `trimp` | 1 per workout |
| `records.parquet` | `session_id`, `timestamp`, `heart_rate`, `speed_ms`, `pace_min_km`, `cadence`, `altitude`, `distance`, `vertical_oscillation`, `vertical_ratio`, `stance_time`, `step_length`, `gradient_pct` | 1 per second |
| `daily_signals.parquet` | `date`, `atl`, `ctl`, `tsb`, `acwr`, `hrv`, `hrv_z`, `sleep_score`, `rhr` | 1 per day |

### App database equivalents

| Parquet column | DB table / column |
|---|---|
| `sessions.*` | `workouts` (session-level aggregates) |
| `records.*` | `workout_metrics` (time-series, per-second) |
| `daily_signals.atl/ctl/tsb` | computed by `intelligence/training_load.py` |
| `daily_signals.hrv/hrv_z` | computed by `intelligence/recovery.py` from `sleep_sessions.hrv` |

The model reads from `workout_metrics` (records) and `workouts` (sessions) via the
existing repo layer. No new tables are needed.

---

## Algorithm — Step by Step

### Step 1: MAX_HR Estimation

```python
formula_hr = round(211 - 0.64 * age)
data_hr    = int(run_records['heart_rate'].quantile(0.99))

# Use data if within 10 bpm of formula — if >10 below, dataset has no hard efforts
MAX_HR = data_hr if data_hr >= formula_hr - 10 else formula_hr
```

- **Why 99th percentile:** sits above noise but below artifact spikes. Validated
  across all three athletes.
- **Why the 10 bpm fallback:** Ciulavu's dataset had no VO2max efforts; 99th pct
  was 12 bpm below formula. Pooling it with other zones produced bad regression.
- **Storage:** persist `MAX_HR` and `hr_source` in `user_profile` (new columns).
  Recalculate when new running sessions are synced.

### Step 2: Session-Level Aggregation

For each running session (sport = `'running'` or `'trail_running'`):

```python
# 1. Strip first 120s — cardiac lag makes early HR unrepresentative
records = records[records['timestamp'] >= session_start + 120s]

# 2. Filter moving records only
records = records[records['speed_ms'] >= 1.5]

# 3. Compute per-session summary
mean_hr    = records['heart_rate'].mean()
mean_speed = records['speed_ms'].mean()
```

One row per session. This is the input to the regression and zone assignment.

### Step 3: HR Zone Assignment

Five zones defined as % of MAX_HR:

| Zone | Label | HR range |
|---|---|---|
| Z1 | Recovery | 0–60% |
| Z2 | Aerobic | 60–70% |
| Z3 | Tempo | 70–80% |
| Z4 | Threshold | 80–90% |
| Z5 | VO2max | 90–101% |

Assign each session to the zone its `mean_hr` falls into.

### Step 4: Linear Regression (Personal Aerobic Profile)

```python
from scipy.stats import linregress
reg = linregress(session_stats['mean_hr'], session_stats['mean_speed'])
# speed = slope × HR + intercept
```

- The regression line **is the athlete's aerobic profile** — the speed they sustain
  at a given cardiac cost.
- R² of 0.4–0.7 is expected across mixed-effort datasets. A flat or negative slope
  indicates all sessions are at similar intensity (Ciulavu case: almost all Z3/Z4).
- **Clamp predictions** to `[hr_data_min, hr_data_max]` — do not extrapolate.
  Flag when the requested HR exceeds the observed ceiling.

### Step 5: Blended Zone Speed Estimates

Pure empirical means are noisy at low session counts. The blend shrinks toward the
regression prediction when data is sparse:

```python
BLEND_K = 8   # at n=8, empirical weight = 50%

for zone in zones:
    n        = len(sessions_in_zone)
    reg_pred = regression.predict(zone_midpoint_hr)  # clamped

    if n == 0:
        estimate = reg_pred
    else:
        w_emp    = n / (n + BLEND_K)
        estimate = w_emp * empirical_mean + (1 - w_emp) * reg_pred
```

**Monotonicity enforcement:** after blending, walk Z1→Z5 and clamp any zone that
is slower than the previous one. Drop CI for corrected zones (it would be
misleading).

**95% Confidence interval:** only compute when `n >= BLEND_K` AND `n >= 3`.
Below that threshold the blend is more regression than data; the CI would not
bracket the blended estimate.

```python
se     = std(zone_speeds, ddof=1) / sqrt(n)
t_crit = t.ppf(0.975, df=n - 1)
ci_lo  = empirical_mean - t_crit * se
ci_hi  = empirical_mean + t_crit * se
```

### Step 6: Best Effort Extraction (1k and 3k)

Extracts the fastest valid segment of a given distance from per-second records.

```python
BOUNDS = {1000: (150s, 600s), 3000: (480s, 1800s)}  # sanity time windows
MAX_SEGMENT_SPEED_MS = 7.0   # ~4:17/km — above this is GPS artifact
MAX_RECORD_GAP_S     = 60    # gap > 60s means GPS dropout → reject segment

# For each (i, j) pair where records[j].distance - records[i].distance >= target_distance:
#   elapsed = timestamp[j] - timestamp[i]
#   reject if elapsed outside BOUNDS
#   reject if any inter-record gap > MAX_RECORD_GAP_S
#   reject if any implied speed > MAX_SEGMENT_SPEED_MS
#   keep the minimum elapsed — that's the best effort
```

Also record `avg_hr` and `peak_hr` (95th percentile of segment HR) for the segment.
Strip first 120s before searching — cardiac lag would inflate the HR of early segments.

Best efforts are used to:
1. Validate the zone-speed model (compare model prediction vs empirical best)
2. Detect when zone boundaries are stale (aerobic decoupling alert)

---

## Where This Lives in the App

### New service: `services/aerobic_profile_service.py`

```
build_aerobic_profile(user_id, db) -> AerobicProfile
  - reads running sessions from workout_repo
  - reads running records from workout_metrics_repo
  - runs steps 1–6 above
  - returns structured result (see models below)

get_zone_speed(user_id, zone, db) -> ZoneSpeed
  - returns blended speed estimate + CI for a given zone

get_best_efforts(user_id, db) -> BestEfforts
  - returns 1k and 3k best effort times + HR
```

### New intelligence module: `intelligence/analytics/aerobic_profile.py`

Pure functions, no DB access. Mirror the pattern of `biomechanics.py`:

```python
def estimate_max_hr(run_records: pd.DataFrame, age: int) -> tuple[int, str]: ...
def aggregate_sessions(run_records: pd.DataFrame, sessions: pd.DataFrame) -> pd.DataFrame: ...
def fit_regression(session_stats: pd.DataFrame) -> RegressionResult: ...
def blend_zone_estimates(session_stats, reg, zone_bounds, max_hr, blend_k=8) -> dict: ...
def extract_best_efforts(run_records: pd.DataFrame, distances=(1000, 3000)) -> dict: ...
```

### API endpoint: `api/v1/running.py`

Add to the existing running router:

```
GET /api/v1/running/aerobic-profile
  → AerobicProfileResponse (zone speeds + CI, regression stats, best efforts, MAX_HR source)
```

### Frontend: `frontend/src/pages/Running.jsx`

Extend the existing Running page (already wired end-to-end) with:
- Zone speed table (Z1–Z5, speed, pace, CI if available)
- HR–speed scatter plot with regression line colored by zone
- Best effort card (1k / 3k time, pace, avg HR, % HRmax)

### Integration with `intelligence/recommend.py`

Zone calibration drift alert (Tier 1 from CLAUDE.md):

```python
# If the athlete's aerobic decoupling trend crosses threshold:
# → alert "your Z2 is now Z3 effort — zones need recalibration"

# Trigger: running sessions at Z2 HR show speed consistent with Z3 estimate
# from the current zone model.
```

The aerobic profile should be recalculated after each Garmin sync that adds new
running sessions.

---

## Model Inputs and Freshness

| Input | Source | Update trigger |
|---|---|---|
| Running sessions | `workouts` WHERE sport IN ('running', 'trail_running') | POST /sync/garmin |
| Per-second records | `workout_metrics` | POST /sync/garmin |
| Age | `user_profile` | profile update |
| MAX_HR override | `user_profile` (new column) | profile update |

Minimum viable profile: **5 running sessions** with HR data. Below that, return the
formula-based zone table with a `low_data` flag; do not surface CIs.

---

## What the Research Did NOT Build (Do Not Implement Yet)

- **Terrain stratification** — road vs trail split of the profile. Noted in CLAUDE.md
  as Tier 2; pooling them is fine for now given the small session counts per athlete.
- **Longitudinal trend of the regression slope** — aerobic adaptation over months.
  Tier 3 in CLAUDE.md; requires 3+ months of consistent data.
- **Running power curves** — Garmin running power is algorithmically derived and
  unreliable on technical terrain. Explicitly excluded.
- **HRV-strain 48h underperformance prediction** — requires outcome labels not in
  the dataset.

---

## Data Available for Development and Testing

All Parquet files are committed to `data/`:

```
data/
  sessions.parquet           # Vlad — 38 sessions, 5 running
  records.parquet            # Vlad — 83k records, 6.1k running
  daily_signals.parquet      # Vlad — 54 days, HRV + sleep

  Ciulavu/
    sessions.parquet         # 248 sessions, 56 running
    records.parquet          # 489k records, 153k running
  Mircea/
    sessions.parquet         # 164 sessions, 98 running
    records.parquet          # 321k records, 213k running

  analysis_Ciulavu/          # pre-computed plots from notebook 03
  analysis_Mircea/           # pre-computed plots from notebook 04
  biomechanics_plots_*/      # per-session scatter plots
```

Use the Ciulavu and Mircea datasets as the primary test cases — they have enough
running sessions (56 and 98) to produce stable estimates. Vlad's dataset (5 running
sessions) tests the `low_data` fallback path.

### Expected outputs for regression testing

**Ciulavu** (MAX_HR 197, formula fallback):
- All sessions cluster in Z3/Z4 — no Z1/Z2 empirical data
- Regression R² ~0.3 (compressed HR range)
- 1k best: 4:54 min/km @ avg HR 170, peak 187 (95% HRmax)
- 3k best: 5:32 min/km @ avg HR 170, peak 187

**Mircea** (MAX_HR 199, data-driven):
- Wide zone distribution: 2 Z2, 22 Z3, 64 Z4, 10 Z5
- Regression R² expected 0.5–0.7 (good HR spread)
- Dataset has sufficient Z4/Z5 for tight CI on those zones

---

## Column Name Reference

The app uses slightly different column names than the research notebooks in some
places. Canonical mapping:

| Notebook column | DB / `workout_metrics` column |
|---|---|
| `heart_rate` | `heart_rate` |
| `speed_ms` | `speed_ms` |
| `cadence` | `cadence` |
| `vertical_oscillation` | `vertical_oscillation` |
| `vertical_ratio` | `vertical_ratio` |
| `stance_time` | `stance_time` |
| `step_length` | `step_length` |
| `gradient_pct` | `gradient_pct` |
| `session_id` | `workout_id` (FK to `workouts`) |

Note: `workout_metrics.workout_id` is the FK — the notebooks use `session_id` as a
local integer index. Do not confuse the two when joining.
