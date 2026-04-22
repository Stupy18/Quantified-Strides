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

## Future Notebook — Grade-Biomechanics Per-Second Curves

**Prerequisite:** session-level baseline established in `05_biomechanics_baseline.ipynb`.

**Goal:** determine whether grade systematically shifts each biomechanics variable
in a consistent, athlete-specific way — and if so, build per-athlete grade-correction
curves so the baseline residuals are grade-neutral.

**Why not done yet:** unlike the Minetti formula for speed (universal, lab-validated),
grade effects on cadence, GCT, and VO are athlete-specific. Fitting reliable
per-athlete curves requires enough per-second data at a range of sustained grades.
Current session counts are sufficient to explore this, but not to build stable curves.

**What the notebook would do:**
1. Extract per-second records filtered to clean steady-state segments (post-warmup,
   speed within bounds, post-GPS-gap buffer)
2. Apply 30s smoothed gradient (same as in notebook 05)
3. For each athlete × variable: bin records by grade (e.g. −15 to +20% in 2.5% steps)
   and fit cadence/GCT/VO vs grade at fixed GAP speed bands
4. Assess whether the grade-biomechanics relationship is consistent across sessions
   (high R² within athlete) or noisy (personal style dominates)
5. If consistent: fit a correction curve per athlete per variable, producing
   "grade-adjusted cadence" analogous to GAP speed. Add to `05` baseline as an
   optional second-pass improvement.
6. If noisy: document that GAP speed as sole predictor is sufficient and grade
   effects on biomechanics are within personal noise — close the question.

**Trigger condition:** build this when any athlete has ≥150 road running sessions
with full biomechanics coverage (cadence, GCT, VO all non-null).

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

---

# Implementation Protocol — Biomechanical Baseline Model

This section translates `notebooks/05_biomechanics_baseline.ipynb` into a concrete
implementation spec. The algorithm establishes a personal speed-conditioned
biomechanics baseline per athlete, compares it against a population reference, and
flags sessions that deviate beyond the athlete's own normal variability.

---

## What This Model Does

For each athlete:
1. Cleans per-second running records (artifact removal, GPS dropout masking)
2. Converts actual speed to Grade Adjusted Pace speed (effort-equivalent flat speed)
3. Aggregates each session to a single row of mean biomechanics at mean GAP speed
4. Fits a personal linear regression: `biomechanics_variable ~ GAP_speed`
5. Computes residuals: deviation of each session from the personal baseline
6. Flags sessions whose residuals exceed ±1.5 × personal σ as outliers

The population reference table provides the external anchor: where solid recreational
runners sit at each effort level. Deviations from the population are informational;
deviations from the personal baseline are the anomaly signal.

---

## Constants

```python
WARMUP_STRIP_S       = 180     # strip first 3 min — neuromuscular settling time
SPEED_FLOOR_MS       = 2.0     # m/s — below this is walk/jog transition, not running gait
SPEED_PCT_CEILING    = 95      # percentile — dynamic ceiling per athlete, excludes sprinting
GPS_GAP_THRESHOLD_S  = 60      # seconds — gap above this = GPS dropout or auto-pause
GPS_GAP_BUFFER_S     = 30      # seconds — mask this window either side of each gap
MIN_DURATION_S       = 600     # 10 min of clean records after strip
MIN_DISTANCE_M       = 1500    # 1.5 km of clean records after strip
MIN_COVERAGE_PCT     = 0.50    # minimum non-null fraction to include variable for a session
CV_SPEED_THRESHOLD   = 0.30    # speed CV above this → interval session flag (excluded from baseline fit)
OUTLIER_THRESHOLD    = 1.5     # σ — sessions beyond this are flagged as anomalies
MIN_SESSIONS_BASELINE = 10     # minimum road sessions before baseline is surfaced to user
```

---

## Step 1 — Terrain Classification

**Source:** `workouts.sport` column (set by athlete on Garmin watch before starting).

```
sport == 'running'       → road
sport == 'trail_running' → trail
```

Do not use `gradient_pct` for terrain classification. In hilly cities, road runs
naturally carry significant elevation change. Gradient is also a noisy per-second
derivative (GPS altitude ±5–10m error / 1–2m distance = large spikes on flat ground)
and is not reliable as a session-level classifier.

Build separate baselines per terrain type. At current session counts, only the road
baseline has enough data. Trail baseline is deferred.

---

## Step 2 — Per-Second Record Cleaning

Apply in this exact order to `workout_metrics` records for each session:

### 2a. Warmup strip
```python
records = records[records.timestamp >= session_start + timedelta(seconds=180)]
```
Cardiac lag is ~120s but cadence, GCT, and VO take longer to reach steady-state
running form. 180s is the validated threshold.

### 2b. Speed bounds
```python
speed_ceiling = percentile_95(athlete_road_running_speeds)  # computed once per athlete
records = records[(records.speed_ms >= 2.0) & (records.speed_ms <= speed_ceiling)]
```
Floor: below 2.0 m/s the gait transitions between walk and jog — not running mechanics.  
Ceiling: 95th percentile of the athlete's actual road running speed — excludes sprinting
(a biomechanically distinct regime that would skew the baseline).

### 2c. GPS gap masking
```python
gaps = records.timestamp.diff().dt.total_seconds()
for each gap > 60s:
    mask records within ±30s of the gap boundary
```
A gap > 60s means GPS signal loss or auto-pause. Speed and gradient in that window
are dead-reckoned (accelerometer estimate), not measured. Since the entire model is
effort-conditioned, records without reliable speed context must be excluded.
The ±30s buffer removes records where `gradient_pct` is computed from the bad
distance derivative near the gap boundary.

### 2d. Per-second sanity bounds
Null out (do not drop) records outside these ranges — the record timestamp and other
valid fields are kept; only the artifact value is nulled:

| Variable | Floor | Ceiling | Unit |
|---|---|---|---|
| `speed_ms` | 0.0 | 7.0 | m/s — above 7 is GPS spike |
| `cadence` | 100 | 240 | spm |
| `stance_time` | 100 | 500 | ms |
| `vertical_oscillation` | 2.0 | 20.0 | cm |
| `vertical_ratio` | 3.0 | 20.0 | % |
| `step_length` | 200 | 2000 | mm |

Note: `vertical_oscillation` is stored in cm in `workout_metrics`
(parsed as raw mm / 10 during Garmin ingestion).

### 2e. Grade Adjusted Pace (GAP) — Minetti et al. (2002)

For each record, compute the flat-equivalent speed using the Minetti metabolic
cost polynomial. This converts actual speed to the speed that would require
identical metabolic effort on flat ground.

```python
def minetti_gap_factor(grade_decimal: float) -> float:
    """
    grade_decimal: signed grade in decimal form
                   (0.10 = 10% uphill, -0.05 = 5% downhill)
    Validated range: ±0.45 (±45% grade). Clip inputs outside this range.
    Returns: multiplier to apply to actual speed → flat-equivalent speed
    """
    g = clip(grade_decimal, -0.45, 0.45)
    cost = 155.4*g**5 - 30.4*g**4 - 43.3*g**3 + 46.3*g**2 + 19.5*g + 3.6
    return cost / 3.6   # 3.6 J/kg/m = flat reference cost C(0)
```

Reference values:

| Grade | GAP factor | Effect on 3.0 m/s run |
|---|---|---|
| −15% | 0.54 | → 1.63 m/s equivalent (easier) |
| −10% | 0.60 | → 1.80 m/s equivalent |
| 0% | 1.00 | → 3.00 m/s (no change) |
| +10% | 1.66 | → 4.97 m/s equivalent (harder) |
| +15% | 2.15 | → 6.46 m/s equivalent |
| +20% | 2.82 | → 8.47 m/s equivalent |

**Gradient smoothing before applying GAP:**
`gradient_pct` from per-second GPS is noisy. Apply a 30-second centered rolling
mean (min 10 observations) before computing GAP. This removes GPS altitude noise
(per-second spikes) while preserving real sustained gradients (hills in a city
like Cluj are tens to hundreds of seconds long).

```python
grade_smooth = (
    records['gradient_pct']
    .rolling(window=30, center=True, min_periods=10)
    .mean()
    .fillna(0)
    / 100  # pct → decimal
)
records['gap_speed_ms'] = (records['speed_ms'] * minetti_gap_factor(grade_smooth)).clip(lower=0)
```

### 2f. Minimum session size
After all cleaning: require ≥ 600s duration AND ≥ 1500m distance. Sessions that
don't survive this filter after cleaning are rejected entirely. Shorter sessions
are not representative of steady-state mechanics.

---

## Step 3 — Session-Level Aggregation

Reduce each cleaned session to one summary row:

```python
session_row = {
    'workout_id':        ...,
    'date':              ...,
    'athlete_id':        ...,
    'terrain':           'road' | 'trail',
    'mean_speed':        mean(records.speed_ms),
    'mean_gap_speed':    mean(records.gap_speed_ms),   # primary predictor
    'gap_uplift':        mean_gap_speed - mean_speed,  # diagnostic: elevation effect
    'elevation_per_km':  total_ascent / (distance_m / 1000),
    'cv_speed':          std(speed_ms) / mean(speed_ms),
    'interval_flag':     cv_speed > 0.30,              # exclude from baseline fit
    'mean_hr':           mean(records.heart_rate),
    'mean_cadence':      mean(records.cadence)         if coverage >= 50% else null,
    'mean_vo':           mean(records.vertical_oscillation) if coverage >= 50% else null,
    'mean_vr':           mean(records.vertical_ratio)  if coverage >= 50% else null,
    'mean_gct':          mean(records.stance_time)     if coverage >= 50% else null,
    'cv_cadence':        std / mean of cadence         if coverage >= 50% else null,
    # ... cv_ for each variable
}
```

**Coverage rule:** if more than 50% of clean records for a session have null for a
given biomechanics variable (e.g. no running dynamics pod), set that variable to null
for the session. The session itself is not rejected — other variables with coverage
are still included.

**Interval flag:** sessions with speed CV > 30% have high within-session speed
variation (interval structure, or heavily hilly segments). Keep them in the dataset
for range exploration but **exclude from baseline fitting**. They are included in
population comparison plots.

---

## Step 4 — Population Reference Table

Reference ranges for solid recreational runners, from Dallam et al. (2005),
Moore (2016), Folland et al. (2017), Garmin Running Dynamics white paper (2017).

The x-axis for this table is GAP speed (flat-equivalent effort), not raw speed.

| GAP speed (m/s) | Cadence (spm) | GCT (ms) | VO (cm) | VR (%) |
|---|---|---|---|---|
| 2.0 – 2.5 | 152 – 165 | 270 – 315 | 8.0 – 11.0 | 8.5 – 11.5 |
| 2.5 – 3.0 | 158 – 170 | 255 – 300 | 7.5 – 10.5 | 8.0 – 11.0 |
| 3.0 – 3.5 | 162 – 175 | 235 – 280 | 7.5 – 10.0 | 7.5 – 10.5 |
| 3.5 – 4.0 | 165 – 180 | 220 – 265 | 7.0 – 9.5 | 7.0 – 10.0 |
| 4.0 – 4.5 | 168 – 183 | 205 – 250 | 6.5 – 9.0 | 6.5 – 9.5 |
| 4.5 – 5.5 | 172 – 186 | 190 – 235 | 6.0 – 8.5 | 6.0 – 9.0 |

Notes:
- 180 spm only applies at 4+ m/s GAP effort. At 3 m/s, 165 spm is within the efficient range.
- GCT decreases with effort — faster running requires shorter ground contact to maintain elastic energy return.
- VO is relatively effort-independent in the recreational range; it reflects running style more than speed.
- VR is the primary efficiency signal: lower is better at every effort level.

---

## Step 5 — Personal Baseline Regression

For each athlete × biomechanics variable, fit a linear regression on **steady
sessions only** (interval_flag == False):

```
variable = intercept + slope × mean_gap_speed
```

```python
from scipy.stats import linregress
reg = linregress(session_data['mean_gap_speed'], session_data['mean_variable'])

baseline = {
    'slope':         reg.slope,
    'intercept':     reg.intercept,
    'r2':            reg.rvalue ** 2,
    'n':             len(session_data),
    'gap_speed_min': session_data['mean_gap_speed'].min(),
    'gap_speed_max': session_data['mean_gap_speed'].max(),
}
```

**Minimum data requirement:** ≥ 5 sessions with non-null values for that variable.
Below this threshold, return `low_data: true` and do not surface the baseline.

**R² interpretation:**
- ≥ 0.30: effort explains a meaningful fraction of this variable — regression is useful
- < 0.30: variable is largely style/noise — regression is weak; use population reference only

**Do not extrapolate:** when predicting from a new session's GAP speed, clamp to
`[gap_speed_min, gap_speed_max]`. The model is not valid outside the observed range.

---

## Step 6 — Residual Computation

For each session:
```python
predicted = baseline['slope'] * session['mean_gap_speed'] + baseline['intercept']
residual  = session['mean_variable'] - predicted
```

Residual = 0: session is exactly on personal baseline at that effort level.  
Residual > 0: session is above baseline (e.g. cadence higher than expected).  
Residual < 0: session is below baseline.

---

## Step 7 — Personal Variability (σ)

Compute across all sessions (steady + interval, not just steady):

```python
sigma = std(all_residuals_for_variable)
```

σ is the athlete's natural session-to-session variability around their baseline
after accounting for effort level and elevation. This is the outlier detection unit.

**Normality check (Shapiro-Wilk):** if p > 0.05, residuals are normally distributed
and z-score based detection is valid. If p ≤ 0.05, use IQR-based detection instead:

```python
# z-score method (normal residuals)
is_outlier = abs(residual / sigma) > 1.5

# IQR method (non-normal residuals)
Q1, Q3 = percentile(residuals, 25), percentile(residuals, 75)
IQR = Q3 - Q1
is_outlier = (residual < Q1 - 1.5*IQR) or (residual > Q3 + 1.5*IQR)
```

Require ≥ 8 sessions before running the normality test. Below that, default to IQR.

---

## Step 8 — Efficiency Coupling (VR Correlation)

VR (vertical ratio) is the primary running efficiency proxy. Lower VR at a given
effort = more energy going forward, less wasted vertically.

For each athlete × variable (excluding VR itself):
```python
r, p = pearsonr(variable_residuals, vr_values)
```

Interpretation:
- r > 0.3 AND p < 0.10: when this variable is above the athlete's baseline, their
  VR is worse. **Worth improving** — flag for coaching feedback.
- Otherwise: **personal style** — no efficiency penalty detected. Do not prescribe changes.

These correlation weights feed the anomaly scoring. Recompute whenever the athlete
adds ≥ 10 new sessions (correlation estimates stabilise slowly).

---

## Step 9 — Session Anomaly Score

Composite score across all biomechanics variables:

```python
# Weights: |r| for variables with significant VR correlation (p < 0.10), else 0
weights = {var: abs(r) if p < 0.10 else 0.0 for var, r, p in correlations}
total_weight = sum(weights.values())

# Fallback: if no significant correlations yet, equal weights
if total_weight == 0:
    weights = {var: 1.0 / n_vars for var in variables}

# Composite z-score
score = sum(
    (residual[var] - mean(all_residuals[var])) / std(all_residuals[var])
    * weights[var] / total_weight
    for var in variables if residual[var] is not null
)

is_outlier = abs(score) > 1.5
direction  = 'degraded_mechanics' if score > 0 else 'unusually_clean'
```

Positive score: the session showed worse-than-usual mechanics for that effort level
(higher cadence than expected for GAP speed may not matter, but higher GCT when
GCT correlates with VR does).  
Negative score: unusually clean mechanics.

---

## Step 10 — Baseline Stability Gate

Before surfacing any baseline or anomaly scores to the user:

```python
MIN_SESSIONS = 10  # road sessions with non-null values for the variable
```

Below 10 sessions, return `{"status": "insufficient_data", "sessions_needed": N}`.
Do not show a baseline or flag outliers. Show population reference only.

Based on stability analysis (notebook 05, cell 14): R² stabilises around 8–12
sessions for cadence and GCT. 10 is the conservative minimum across all variables.

---

## App Integration

### New intelligence module
`intelligence/analytics/biomechanics_baseline.py`

Pure functions, no DB access:

```python
def clean_session_records(records: pd.DataFrame, session_start: datetime,
                          speed_ceiling: float) -> pd.DataFrame | None: ...

def compute_gap_speed(records: pd.DataFrame) -> pd.DataFrame: ...

def aggregate_session(records: pd.DataFrame, session_meta: dict) -> dict: ...

def fit_baseline(sessions: pd.DataFrame, variable: str) -> dict | None: ...

def compute_residuals(sessions: pd.DataFrame, baselines: dict) -> pd.DataFrame: ...

def compute_sigma(residuals: pd.Series) -> tuple[float, str]: ...
    # returns (sigma, method) where method is 'zscore' or 'iqr'

def compute_anomaly_score(residuals: dict, sigmas: dict,
                          efficiency_weights: dict) -> float: ...

def compare_to_population(mean_gap_speed: float, variable: str) -> dict: ...
    # returns {'in_range': bool, 'lo': float, 'hi': float, 'position': 'below'|'within'|'above'}
```

### New service method
`services/running_service.py` → `get_biomechanics_baseline(user_id, db)`

Reads from:
- `workouts` WHERE sport IN ('running', 'trail_running') AND user_id = ?
- `workout_metrics` WHERE workout_id IN (above)

Returns `BiomechanicsBaseline` model with:
- Per-variable baseline regression parameters
- Per-variable σ and outlier method
- Population reference gaps
- Efficiency coupling weights
- Last N session anomaly scores

### New API endpoint
`GET /api/v1/running/biomechanics-baseline`

```json
{
  "status": "ok" | "insufficient_data",
  "sessions_used": 52,
  "sessions_needed": null,
  "variables": {
    "cadence": {
      "r2": 0.667,
      "slope": 15.34,
      "intercept": 114.7,
      "sigma": 3.1,
      "outlier_method": "zscore",
      "population_position": "within",
      "population_lo": 162,
      "population_hi": 175
    }
  },
  "recent_sessions": [
    {
      "date": "2026-04-15",
      "mean_gap_speed": 3.42,
      "gap_uplift": 0.38,
      "anomaly_score": 0.21,
      "is_outlier": false,
      "residuals": {"cadence": 1.2, "stance_time": -4.1, "vertical_oscillation": 0.05}
    }
  ]
}
```

### Frontend
`frontend/src/pages/Running.jsx` — extend the existing Running page:
- Biomechanics vs population scatter plot (GAP speed on x, variable on y, green reference band, personal trend line)
- Per-variable status card: position relative to population + personal baseline
- Session history: anomaly score timeline, flagged sessions highlighted
- Efficiency summary: VR trend, speed/HR trend
