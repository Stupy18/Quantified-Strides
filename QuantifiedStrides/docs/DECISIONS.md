# QuantifiedStrides — Design Decisions

This document records every significant decision made about how the recommendation engine, exercise selection, formulas, and data models work. Written so that future-me (or Claude) can understand *why* things are the way they are.

---

## Database Migrations

### Tooling: Flyway (SQL-first, Docker service)

Chosen over Alembic because the codebase uses raw SQL in repos — there are no declarative SQLAlchemy ORM models to auto-generate migrations from. Flyway is SQL-first by design.

Runs as a Docker service (`flyway/flyway:10`) on every `docker compose up`. Backend and seed depend on `flyway: condition: service_completed_successfully`.

Migration files live in `db/flyway/`. Naming: `V{version}__{description}.sql` (double underscore, integer version). `V001__baseline.sql` is the frozen initial schema snapshot.

**Key invariant:** committed migration files are immutable. Flyway checksums each file on every run and refuses to migrate if a previously applied file has changed. All schema changes go in a new version file.

**`BASELINE_ON_MIGRATE=true`** handles the two bootstrap scenarios:
- Fresh DB (no volume): Flyway runs V001 to create the full schema.
- Existing DB (volume present, no `flyway_schema_history`): V001 is marked as baseline without re-running; any pending V002+ are applied.

To catch up after a `git pull` that added new migrations: `docker compose up` (or `docker compose run --rm flyway`) applies only the gap.

---

## Training Load Model

### Formula: TRIMP (Banister sex-specific, Story 002)

**Current implementation.** Each workout's TRIMP is computed post-sync and written to `workouts.trimp`:

```
HRr = (avg_hr - resting_hr) / (max_hr - resting_hr)   # heart-rate reserve, clamped [0,1]
TRIMP = duration_min × HRr × k × exp(y × HRr)
```

Sex-specific coefficients (Banister 1991 `[1]`):
| Sex | k | y |
|-----|-----|-----|
| female | 0.86 | 1.67 |
| male / prefer_not_to_say | 0.64 | 1.92 |

**Why Banister over Edwards:**
The exponential term accounts for the nonlinear physiological cost at high intensities. Edwards zone-weighted TRIMP requires knowing zone boundaries (which vary per athlete) and can't distinguish between two sessions with the same zone-seconds but different HR profiles. Banister requires only avg_hr, max_hr, and resting_hr — all available from Garmin + sleep data. The sex-specific coefficients encode the known difference in female fat oxidation rate at moderate intensities. The HRV quality filter (easy_threshold = 50 TRIMP) also maps more reliably to actual training stress with Banister scores.

**`NULL` handling:** when `avg_hr` or `max_hr` is missing, `workouts.trimp` is `NULL` and the session is excluded from load metric computation.

`resting_hr` = 7-day median of `sleep_sessions.rhr`.
`max_hr` = `user_profile.max_hr` (NULL until set via onboarding or quarterly cron).

**Fallback for strength sessions without HR data:** `workouts.trimp` stays `NULL`. The `training_load_daily` computation uses only sessions with non-NULL TRIMP — no made-up strength estimates. This avoids contaminating the Banister TRIMP series with an ad-hoc set-count approximation.

### ATL / CTL / TSB — Precomputed post-sync (Story 002)

**Current implementation.** Computed using continuous exponential decay, NOT the EWA approximation:

```python
gap = (session_date - prev_date).days
atl = atl * exp(-gap / TAU_ATL) + trimp * (1 - exp(-1 / TAU_ATL))
ctl = ctl * exp(-gap / TAU_CTL) + trimp * (1 - exp(-1 / TAU_CTL))
```

TAU_ATL = 7, TAU_CTL = 42 (Morton et al. 1990 `[2]`). Marked `# HEURISTIC` in code — these are literature defaults, not validated against Vlad's personal response.

**Stored in `training_load_daily`** (one row per user per day) after every successful Garmin sync. Dashboard reads from this table instead of recomputing from raw workouts — O(1) lookup instead of O(n) over 90+ days. This also stabilises recommendation inputs between syncs.

**Why precomputed vs request-time:**
Recomputing ATL/CTL/TSB on every dashboard load requires iterating 90+ days of TRIMP with async repo calls per day. With precomputed values, any request within 7 days of the last sync returns instantly without touching workout data.

```
CTL = CTL_prev × (1 - 1/42) + load × (1/42)   # 42-day constant → fitness
ATL = ATL_prev × (1 - 1/7)  + load × (1/7)    # 7-day constant  → fatigue
TSB = CTL - ATL                                 # form / freshness
```

TSB interpretation:
- `> +10`: very fresh — peak performance window
- `+5..+10`: fresh — lean toward the harder end
- `-5..+5`: neutral — fitness and fatigue in balance
- `-15..-5`: productive fatigue — building fitness, train as planned
- `< -15`: overreached — back off

### Ramp Rate

`ramp_rate = ((CTL_today - CTL_14d_ago) / CTL_14d_ago) × 100`  (% change)

NULL when fewer than 14 days of TRIMP data exist. Stored in `training_load_daily.ramp_rate`.

Safe ceiling: ~10%/week caution, >15%/week triggers volume cap gate (Story 003). `[4]` Soligard et al. 2016.

### ACWR (Acute:Chronic Workload Ratio)

`ACWR = ATL / CTL` — NULL when `CTL < 1.0` (avoid dividing by noise in the cold-start period)

Optimal range: 0.8–1.3
| ACWR | Label | Gate action (Story 003) |
|------|-------|------------------------|
| None | no_data | skip gate |
| < 0.8 | under_training | flag only |
| 0.8–1.3 | optimal | none |
| 1.3–1.5 | caution | gate 2 |
| > 1.5 | danger | gate 1 |
| > 1.8 | critical | gate 0 |

**Why NULL below CTL 1 (not CTL 5):** CTL < 1 means the athlete is essentially at rest — any non-zero ATL over near-zero CTL would produce a meaninglessly large ACWR (e.g. ATL=0.5, CTL=0.1 → ACWR=5.0). The threshold of 1.0 is more permissive than the previous "CTL > 5" guard. Changed in Story 002 per RECOMMENDATION_PROTOCOL.md §3.3.

---

## HRV Analysis

### Baseline — Per-athlete stored, clean-day filtered (Story 002)

**Current implementation.** The baseline is computed from clean-day readings only and stored in `user_profile.hrv_baseline_mean / hrv_baseline_sd`:

**Clean reading criterion:** Preceding day's `workouts.trimp` is NULL (rest) or ≤ 50 (≈ 60–70 min easy Z2). Hard sessions and their next-day suppressed readings are excluded.

**Minimum 14 clean readings** before baseline is established. `compute_hrv_status()` returns `'no_data'` until then — all HRV safety gates skip in `'no_data'` state.

**Why stored per-athlete instead of rolling window:**
A rolling window derived from the current time series is contaminated by the training stress it is measuring. During a heavy training block, suppressed HRV shifts the mean down — subsequent genuinely-bad HRV days appear "normal" because the window has already adjusted. The clean-day filter ensures the stored baseline reflects true resting HRV, not training-stressed HRV.

**Why no dedicated baseline week:**
Continuous accumulation across the training year collects clean readings naturally (rest days, easy Z2 days). Any day following a rest or easy session contributes. This makes the baseline available sooner and keeps it current without forcing the athlete into a "do-nothing week to calibrate."

```
clean_readings = [hrv for hrv, preceding_trimp in zip(series, preceding_triples)
                  if preceding_trimp is None or preceding_trimp <= 50]
```

Status thresholds (z-score against stored baseline):
- `z > +1.0`: elevated (parasympathetic dominance — ready for quality)
- `-1.0 < z ≤ +1.0`: normal
- `-1.5 < z ≤ -1.0`: suppressed (mild withdrawal)
- `z ≤ -1.5`: very_suppressed (Plews et al. 2012 `[5]`, Kiviniemi et al. 2007 `[6]`)

**Why `very_suppressed` vs `suppressed` split at -1.5:**
The -1.5 threshold corresponds to where Plews et al. found a reliable signal-to-noise ratio for detecting genuine recovery deficit vs day-to-day HRV variance. Above -1.5 the z-score is within the normal noise band of most athletes' HRV data.

### Trend

3-day mean vs 7-day mean (legacy `get_hrv_status()` — kept for backwards compatibility with dashboard until Story 003 wires `compute_hrv_status()` fully):
- `+3 ms`: rising
- `-3 ms`: falling
- Otherwise: stable

---

## Signal Computation Layer (Story 002)

### Biomechanics Fatigue Index

Weighted deviation of three biomechanics metrics from per-athlete, terrain-stratified baselines stored in `biomechanics_baselines`:

```
fatigue_index = 0.50 × |cadence_dev| + 0.30 × max(0, GCT_z) + 0.20 × max(0, VR_z)
```

Weights (50/30/20) are `# HEURISTIC` — cadence is the most reliable real-time fatigue indicator (Cormack et al.), GCT rises with fatigue, vertical ratio rises with fatigue. Only positive z-scores contribute for GCT and VR (degradation, not improvement). Written to `workouts.fatigue_index` post-sync. NULL when no baseline exists for the session's terrain type — no error, no fallback.

### HR Stability (zone speeds calibration gate)

Coefficient of variation (CV = stdev/mean) of HR in the final 10 minutes of a running session. CV < 0.05 (< 5%) = stable steady-state HR. Qualifying sessions are used for `compute_zone_speeds()`. Written to `workouts.hr_stability_last_10min`.

**Why CV < 0.05:** This threshold filters out intervals, tempo efforts, and sessions with large pace changes that would corrupt pace-per-zone measurements. A stable final 10 min indicates the athlete settled into a metabolic steady state — only then can we reliably map HR to speed.

### Terrain Classification

`classify_terrain()` classifies a session as `'road'` or `'trail'` from `workout_metrics.gradient_pct`. Trail criterion: mean absolute gradient > 3% OR stdev of gradient > 4%. Written to `workouts.terrain_type`. NULL when < 10 readings available.

### Pattern Fatigue Residuals

Per-pattern exponential decay from `pattern_fatigue_ledger`:

```
residual = Σ (fatigue_units × exp(-elapsed_hours / tau_h))
```

`tau_h` comes from `movement_patterns.fatigue_decay_tau_h` (e.g., `POWER_FULL_BODY = 72h`). Computed in-memory at request time (not stored — residuals decay continuously).

**Cold-start rule (< 5 ledger sessions per pattern):** approximate from muscle freshness:
```
residual_approx = (1 - mean(freshness[primary_muscles])) × 3.0
```
The 3.0 multiplier is `# HEURISTIC`. Above 5 sessions, decay-from-ledger takes over exclusively.

**Why ledger-based instead of strength_sets volume:** `strength_sets` volume (weight × reps) captures local muscle damage well but not CNS cost. The pattern ledger uses `cns_cost + local_fatigue_cost` from the `exercises` taxonomy — a two-axis model that separates neural fatigue (heavy compound lifts) from local metabolic fatigue (high-rep isolation). This distinction matters for the CSP solver: a power clean 24h ago blocks power output even if quads feel fresh.

### Signal Assembly (`intelligence/signal_assembly.py`)

`assemble_signals()` is the single entry point for building the full signals dict passed to `build_recommendation()`. Every key from §3.1 is present — missing values are `None`, no key omitted. Each signal call is wrapped in try/except; errors are logged and set that signal to None without propagating.

**Why centralized:** the recommendation engine needs all signals simultaneously. Without a central assembly function, signal collection would be scattered across callers, making it easy to miss a key or compute signals with inconsistent timestamps. A single function also makes testing straightforward.

### References

`[1]` Banister EW. Modeling elite athletic performance. In: Green HJ, McDougal JD, Wenger H, eds. *Physiological Testing of Elite Athletes*. 1991.
`[2]` Morton RH, Fitz-Clarke JR, Banister EW. Modeling human performance in running. *J Appl Physiol*. 1990.
`[3]` Clarke DC, Skiba PF. Rationale and resources for teaching the mathematical modeling of athletic training and performance. *Adv Physiol Educ*. 2013.
`[4]` Soligard T, et al. How much is too much? BJSM consensus statement on load. *BJSM*. 2016.
`[5]` Plews DJ, Laursen PB, Kilding AE, Buchheit M. Heart-rate variability in elite triathletes. *Int J Sports Physiol Perform*. 2012.
`[6]` Kiviniemi AM, et al. Endurance training guided individually by daily HRV measurements. *Eur J Appl Physiol*. 2007.

---

## Muscle Fatigue Decay Model

Models residual fatigue per muscle as exponential decay:

```
fatigue(t) = peak_load × e^(−λ × t_days)
where λ = ln(2) / half_life
```

Peak load per exercise: `systemic_fatigue × num_sets`

Secondary muscle contribution: 40% of primary load.

**Half-lives by muscle group (days):**
| Muscle | Half-life |
|--------|-----------|
| lower_back, hip_flexors | 3.0 |
| lats, upper_back, rhomboids, traps | 2.5 |
| chest, quads, hamstrings, glutes, hip_abductors, hip_adductors | 2.0 |
| Everything else (delts, biceps, triceps, calves, etc.) | 1.5 |

Rationale: slow-twitch dominant / postural muscles (back, glutes) recover slower than fast-twitch / smaller muscles (delts, biceps).

**Freshness score:**
```
freshness = 1 - min(1, accumulated_fatigue / 50)
```

Calibration cap of 50: one hard session (e.g. 3 chest exercises × 4 sets × systemic_fatigue 3 = 36 primary + secondary contributions ≈ 50).

Freshness is used as a multiplier in exercise ranking — prefer muscles that have recovered more.

---

## Exercise Selection Algorithm

### Exercise Pool

~797 exercises: 36 custom + 761 imported from wger API, labeled with Claude Haiku (batch=20).

Each exercise has:
- `movement_pattern`: the structural slot it fills (e.g. `horizontal_push`, `hinge`, `vertical_pull`)
- `quality_focus`: `power` | `strength` | `hypertrophy` | `stability` | `endurance`
- `contraction_type`: `explosive` | `concentric` | `isometric`
- `primary_muscles`, `secondary_muscles`: JSONB arrays
- `systemic_fatigue`, `cns_load`: 1–5 scale
- `bilateral`: bool

### Session Type → Allowed Muscles

Upper sessions: pushing muscles (chest, front/side delt, triceps) + pulling muscles (lats, upper_back, rhomboids, traps, rear_delt, biceps) + upper accessories.

Lower sessions: quads, hamstrings, glutes, hip flexors, calves, lower_back, abs, obliques, hip abductors/adductors.

### Ranking Formula

```
score = deficit_score(muscles)
      × quality_fit(quality_focus)
      × avg_freshness(muscles)
      × familiar_factor(last_done)
      × recency_factor(last_done)
```

**deficit_score:** How urgently these muscles need training this week.
```
deficit = Σ max(0, target_freq[m] - weekly_freq[m]) × importance[m]
```
Target frequency derived from muscle importance scores (normalized from 1–10 ratings per muscle).

**quality_fit:** Matches exercise quality to day intensity.
| Quality | Heavy day | Light day |
|---------|-----------|-----------|
| power | 2 | 1 |
| strength | 2 | 2 |
| hypertrophy | 1 | 2 |
| stability | 0 | 1 |
| endurance | 0 | 1 |

**avg_freshness:** Mean freshness score across primary muscles (0–1). Deprioritises recently hammered muscles.

**familiar_factor:** Exercises never logged by the user score 0.1× — strongly deprioritised. Only surface novel exercises when no familiar alternative fits. This ensures the engine defaults to your training routine.

**recency_factor:** Avoids repeating the same exercise within a weekly cycle.
- Done ≤ 7 days ago: 0.2×
- Done 8–14 days ago: 0.8×
- Older / never done: 1.0×

Rationale: 7-day window matches a 4x/week split where each day occurs once per week.

### Selection Phases

**Phase 0 — Explosive opener:**
Guarantee one `contraction_type = 'explosive'` exercise opens every session. Primes the CNS, built on plyometrics research showing explosive work is best when fresh.

**Phase 1 — Pattern coverage:**
Guarantee one exercise per focus pattern (e.g. `vertical_pull`, `hinge`) — ensures no movement pattern goes unrepresented.

**Phase 2 — Fill to 5:**
Fill remaining slots with overlap check: no exercise added if it shares ≥ 2 primary muscles already in the session.

### TSB Overrides on Intensity

TSB directly overrides the heavy/light day decision:
- `TSB > +10`: force heavy (CNS is fresh, use it)
- `TSB < -15`: force light (accumulated fatigue, don't dig deeper)

---

## Progression Logic

### Power exercises (bodyweight / plyometric)
Never add weight. Cue: focus on quality — height, distance, reactive contact time.

### Power exercises (weighted)
Same reps, increase weight when 5 reps feels consistently easy (RPE ≤ 7).

### Strength / hypertrophy (bodyweight)
Reps → 15, then add weight.

### Strength / hypertrophy (weighted)
6–10 rep scheme. Progress: +2.5 kg when all sets ≥ 8 reps (last set not ≤ 6).

### Stability / endurance
Maintain reps/duration — progression only when technique is solid.

---

## Alert System

### Severity Levels
- `critical`: Act now, do not train hard today
- `warning`: Take note, consider adjusting
- `info`: Noteworthy, no action required

### Alert Triggers

| Signal | Warning | Critical |
|--------|---------|----------|
| ACWR | > 1.3 | > 1.5 |
| TSB | < -15 | < -25 |
| Consecutive training days | ≥ 4 | ≥ 6 |
| CTL ramp rate | > 8/week | — |
| RHR above baseline | +5 bpm | +8 bpm |
| HRV deviation | < -1.0 SD | < -1.5 SD |
| Sleep score (3-day avg) | < 50 | — |
| Sleep hours (3-day avg) | < 6.5h | — |
| Overall feel | ≤ 5/10 | ≤ 3/10 |
| Energy level | ≤ 3/10 | — |
| Multi-metric illness (2+ of: RHR↑, HRV↓, sleep<55) | — | triggered |
| Soreness ≥7 + went out + HRV dip < -0.5 SD | — | triggered |

---

## Recommendation Engine Flow

```
1. Get today's readiness (morning check-in)
2. Get yesterday's training (gym session or Garmin workout)
3. Get last night's sleep
4. Get current weather
5. Get recent load (consecutive days, weekly volume)
6. Get gym analysis (last 2 upper + last 2 lower sessions)
7. Compute training load metrics (CTL/ATL/TSB/ACWR)
8. Check HRV status
9. Run alert system
10. Apply hard decision rules (injury, weather, time constraints)
11. Build recommendation:
    - Determine primary activity (run / bike / gym / rest / active recovery)
    - If gym: determine session type (upper/lower), intensity (heavy/light), focus patterns
    - TSB overrides intensity decision
    - Select 5 exercises via ranking formula
    - Build progressive set/weight suggestions per exercise
12. Output: primary recommendation + why + exercises with weights
```

---

## Data Sources

| Source | Data | Method |
|--------|------|--------|
| Garmin Connect | Workouts (HR zones, biomechanics, VO2max), sleep (HRV, RHR, stages, body battery) | `garminconnect` Python library |
| OpenWeatherMap | Temperature, wind, rain | REST API |
| Ambee | Pollen index (grass + tree + weed average) | REST API |
| Manual (Streamlit) | Morning readiness, post-workout reflection, strength sessions | Forms |
| wger | Exercise database (761 exercises) | REST API + Claude Haiku labeling |

Location: dynamic — uses Garmin GPS coordinates (`start_latitude`, `start_longitude`) from the day's workout when available; falls back to IP geolocation via `ipinfo.io` on rest days. No hardcoded coordinates.

---

## Running Analytics Module (`analytics/`)

### Grade-Adjusted Pace (GAP)

Uses Minetti et al. (2002) metabolic cost of running on slopes:

```
Cr(g) = 155.4g⁵ - 30.4g⁴ - 43.3g³ + 46.3g² + 19.5g + 3.6
```

Where `g` is gradient as a dimensionless fraction (not %).

```
GAP multiplier = Cr(0) / Cr(g)
GAP = actual_pace × GAP_multiplier
```

Clamped to ±45% gradient (beyond that the polynomial is unreliable for running).
`Cr(0) = 3.6 J/kg/m` is the flat-ground reference.

**Why Minetti over simpler models (e.g. Strava's +10s/km per 1%):**
Minetti is a 5th-degree polynomial calibrated from actual oxygen consumption measurements on treadmills at varying grades. The linear approximation breaks down above ~6% grade. Since Vlad does trail running with steep grades, the polynomial is worth the extra complexity.

### Aerobic Decoupling

Splits each run into two equal halves by data point count.
Computes `Pa:HR ratio = speed_per_hr = (1/pace) / heart_rate` for each half.

```
decoupling_pct = (ratio_first - ratio_second) / ratio_first × 100
```

Thresholds:
- `< 5%`: aerobically efficient
- `5–10%`: moderate cardiac drift
- `> 10%`: significant cardiac drift — aerobic base needs work

Requires ≥ 40 valid data points. Filters: pace 0–20 min/km, HR > 40 bpm.

**Why speed (not pace) in the ratio:**
Speed (m/s) is proportional to metabolic output. Pace (min/km) is inversely proportional, so speed gives a ratio where "higher = better" in both halves, making the comparison intuitive.

### Running Economy Index (REI)

Primary (power meter / Stryd available):
```
REI = avg_power (W) / avg_speed (m/s)
```
Lower = more economical. Comparable across different paces.

Fallback (no power):
```
REI = avg_HR / avg_speed (m/s)
```
A proxy. Less precise but still captures fitness trends.

Speed derived from pace: `speed_ms = 1000 / (pace_min_per_km × 60)`.

### Fatigue Signature

Compares first and last `window_pct` (default 20%) of a run's data points.

Per-metric drift:
- `drift = late_avg - early_avg`
- `drift_pct = (late - early) / early × 100`

Composite fatigue score (0–100):
```
score = mean(
    min(100, GCT_drift_pct × 5),
    min(100, HR_drift_pct  × 10),
    min(100, -cadence_drift_pct × 10)
)
```

Calibration: GCT and HR weights chosen so a 5% GCT rise contributes ~25 pts and a 5% HR rise contributes ~50 pts. Cadence drop penalised at same rate as HR rise.

Requires ≥ 50 data points. Window floor: 10 points.

### Terrain Response — HR-Gradient Curve

Seven gradient bands: steep_down (<-8%), down (-8 to -4%), slight_down (-4 to -1%), flat (-1 to 1%), slight_up (1–4%), up (4–8%), steep_up (>8%).

For each band: avg HR, avg pace, avg GAP, efficiency (speed_ms / avg_HR).

Requires ≥ 10 data points per band to include a band in results.

### Grade Cost Model

Linear regression across all (gradient_pct, heart_rate) data points:

```
HR = slope × gradient_pct + intercept
```

`slope` = your personal HR cost per 1% gradient increase.

Compared against Minetti theoretical:
```
minetti_expected = (Cr(0.01) / Cr(0.0) - 1.0) × mean_HR
```

Ratio interpretation:
- `> 1.2×`: paying more HR for gradient than theory predicts → uphill economy weak
- `< 0.8×`: paying less → strong uphill economy
- Otherwise: tracks model closely

Caveat: confounded by pace variation across gradients. The model is descriptive, not causal. Use the per-pace-band notebook analysis for a cleaner estimate.

### Optimal Gradient Finder

Groups (gradient_pct, HR, pace) into 2% buckets.
Metric: `speed_ms / HR` (speed per heartbeat — higher = better).
The bucket with the highest mean efficiency is the "optimal gradient."

Requires ≥ 20 data points per bucket. Gradient range: -20 to +20%.

---

## Analytics Architecture

Three tiers:

```
notebooks/  →  explore patterns, validate hypotheses, one-off analysis
analytics/  →  production functions, called by both Streamlit and notebooks
pages/      →  Streamlit charts, daily-use dashboards
```

**Why not put analytics logic directly in Streamlit pages:**
Keeps computation testable and reusable. Notebooks can call the same functions without going through Streamlit. Caching is applied at the Streamlit layer, not inside the analytics functions.

Investigative analysis is done ad hoc in Jupyter notebooks (not tracked in this repo) and findings are discussed before being encoded into the analytics module.
