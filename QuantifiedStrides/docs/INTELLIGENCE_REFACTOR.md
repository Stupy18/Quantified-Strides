# Intelligence Layer Refactor Plan

Migrate `intelligence/` from psycopg2 + raw SQL to async SQLAlchemy + repository pattern.

## Core Principle

Intelligence functions split into two kinds:
1. **Data-fetching** (raw SQL) → move to repos
2. **Computation** (pure Python math/logic) → stays in `intelligence/`, converted to async, receives data from repos

Service adapters become thin async orchestrators — no more `asyncio.to_thread()`.

---

## Phase 1: Add Methods to Existing Repos

Most SQL maps to tables already owned by existing repos.

| Repo | Methods to Add |
|---|---|
| `sleep_repo.py` | HRV series (for training_load + recovery + alerts), RHR baseline, sleep trend window, last night's sleep record |
| `workout_repo.py` | HR-zone TRIMP data, endurance fatigue data, recent load by sport, yesterday's training, consecutive-days workout check |
| `strength_repo.py` | Consecutive-days strength check, exercise suggestions, muscle importance map, weekly muscle frequency |
| `checkin_repo.py` | Today's readiness record, `went_out_last_night` single-field fetch |
| `environment_repo.py` | Latest weather record (single-row fetch) |

---

## Phase 2: Create `repos/workout_metrics_repo.py`

All `workout_metrics` queries from `analytics/` are time-series / per-workout — distinct enough to warrant their own repo rather than bloating `workout_repo.py`.

Methods:
- `get_metrics_for_workout(workout_id)` — full time-series
- `get_pace_hr_series(workout_id)` — aerobic decoupling / REI
- `get_pace_cadence(workout_id)` — cadence-speed profile
- `get_pace_power(workout_id)` — power-based REI
- `get_hr_gradient_series(user_id, days, sport)` — terrain analytics
- `get_elevation_series(workout_id)` — elevation HR decoupling
- `get_biomechanics_summary(workout_id)` — aggregate stats (single query)

---

## Phase 3: Refactor Intelligence Modules In-Place

Convert each file to async, replacing cursor params with repo params.

**Order (easiest → most complex):**

1. `analytics/biomechanics.py` — 4 queries → `workout_metrics_repo` + `workout_repo`
2. `analytics/running_economy.py` — 4 queries → `workout_metrics_repo` + `workout_repo`
3. `analytics/terrain_response.py` — 5 queries → `workout_metrics_repo` + `workout_repo`
4. `training_load.py` — 3 queries → `workout_repo` + `strength_repo` + `sleep_repo`
5. `recovery.py` — 2 queries → `sleep_repo` + `strength_repo` + `workout_repo`
6. `alerts.py` — 4 queries → `sleep_repo` + `workout_repo` + `strength_repo` + `checkin_repo`
7. `recommend.py` — 11 queries (most complex) → all repos

**Special case:** `_consecutive_days` currently runs a SQL query in a loop (up to 14×). Replace with a single query fetching all training dates in the lookback window, compute streak in Python.

---

## Phase 4: Update Service Adapters

Files: `services/adapters/training_load.py`, `recovery.py`, `alerts.py`, `recommendation.py`

- Remove `asyncio.to_thread()` wrappers
- Inject repos (add factories to `deps.py`)
- Call intelligence functions directly as async
- Adapters shrink to ~5-line async pass-throughs

**`deps.py` addition pattern:**
```python
def get_workout_metrics_repo(db: AsyncSession = Depends(get_db)) -> WorkoutMetricsRepo:
    return WorkoutMetricsRepo(db)
```

---

## Full Execution Order

```
Phase 1: sleep_repo → workout_repo → strength_repo → checkin_repo → environment_repo
Phase 2: workout_metrics_repo (new file)
Phase 3: biomechanics → running_economy → terrain_response → training_load → recovery → alerts → recommend
Phase 4: adapters (training_load → recovery → alerts → recommendation)
```

---

## SQL Query Inventory (by intelligence file)

### `training_load.py`
- `workouts`: HR zone columns for TRIMP computation
- `strength_sessions/exercises/sets`: set count for strength TRIMP fallback
- `sleep_sessions`: HRV + RHR + sleep_score series for `get_hrv_history`

### `recovery.py`
- `sleep_sessions`: HRV series for `get_hrv_status`
- `strength_sessions/exercises/sets + exercises`: per-muscle load for `get_muscle_freshness`
- `workouts`: endurance session fatigue for `get_muscle_freshness`

### `alerts.py`
- `sleep_sessions`: RHR baseline (`_get_rhr_baseline`), sleep trend (`_get_sleep_trend`)
- `workouts + strength_sessions`: consecutive training days (`_consecutive_days`)
- `daily_readiness`: `going_out_tonight` flag (`_went_out_last_night`)

### `recommend.py`
- `daily_readiness`: readiness record for today
- `workout_reflection`: load_feel for yesterday
- `strength_sessions`: yesterday's session type
- `workouts`: yesterday's Garmin workout, recent load by sport
- `sleep_sessions`: last night's sleep
- `environment_data`: latest weather
- `strength_sessions/exercises + exercises`: gym analysis (CTE + window fn)
- `strength_sets/exercises/sessions`: last performance per exercise
- `exercises`: muscle importance map
- `strength_sessions/exercises + exercises`: weekly muscle frequency
- `exercises + strength_exercises/sessions`: exercise suggestions (dynamic IN clause)
- `workouts + strength_sessions`: consecutive training days

### `analytics/biomechanics.py`
- `workout_metrics`: fatigue signature, cadence-speed profile, biomechanics summary
- `workouts`: workout list for longitudinal trends

### `analytics/running_economy.py`
- `workout_metrics`: GAP (pace+gradient), aerobic decoupling (pace+HR), REI (pace+power or pace+HR)
- `workouts`: workout list for running trends

### `analytics/terrain_response.py`
- `workout_metrics + workouts`: HR-gradient curve, grade cost model, optimal gradient
- `workout_metrics`: elevation HR decoupling (per-workout)
