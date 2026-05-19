## Why

Signal assembly is scattered across `intelligence/training_load.py` and `intelligence/recovery.py`, TRIMP is not stored per workout, and ATL/CTL/TSB is recomputed from raw workouts on every dashboard request — causing unnecessary load and stale signal quality. The recommendation engine (Stories 003–004) requires a reliable, precomputed, correctly filtered signal set to make safe training decisions.

## What Changes

- `workouts.trimp` computed and written post-sync using Banister's sex-specific formula; `NULL` when HR data missing
- `workouts.hr_stability_last_10min` computed post-sync for running workouts to qualify sessions for zone calibration
- `workouts.fatigue_index` computed post-sync from biomechanics deviation against terrain-specific baselines
- `training_load_daily` upserted after every successful sync with ATL, CTL, TSB, ACWR, and ramp_rate; dashboard reads from this table instead of recomputing
- HRV baseline stored in `user_profile.hrv_baseline_mean / hrv_baseline_sd` using only clean (low-TRIMP day) readings; `compute_hrv_status()` returns `'suppressed'`, `'normal'`, `'elevated'`, or `'no_data'`
- `user_profile.zone_speeds` JSONB populated monthly from qualifying running sessions (HR-stable final 10 min)
- Pattern fatigue residuals computed in-memory per request from `pattern_fatigue_ledger` with cold-start fallback
- `intelligence/signal_assembly.py` → `assemble_signals()` centralises all signals into one dict with `None` for missing values — no key omitted

## Capabilities

### New Capabilities

- `training-load-signals`: Per-workout TRIMP computation (Banister formula) and precomputed daily ATL/CTL/TSB/ACWR/ramp_rate stored in `training_load_daily`
- `hrv-signal`: Quality-filtered HRV baseline (clean-day readings only) stored in `user_profile`, plus `compute_hrv_status()` returning `suppressed / normal / elevated / no_data`
- `biomechanics-signals`: Biomechanics fatigue index written to `workouts.fatigue_index` and HR-stability flag `workouts.hr_stability_last_10min` for zone calibration qualifying runs
- `zone-speeds-calibration`: Monthly calibration of `user_profile.zone_speeds` from HR-stable qualifying runs; skipped when < 5 qualifying runs available
- `pattern-fatigue-residuals`: In-memory exponential decay from `pattern_fatigue_ledger` with cold-start approximation (< 5 ledger entries per pattern)
- `signal-assembly`: Centralised `assemble_signals()` in `intelligence/signal_assembly.py` returning complete signal dict with every key from §3.1 registry; missing values are `None`

### Modified Capabilities

- `rec-engine-schema`: `biomechanics_baselines` must exist with terrain-type rows before fatigue index can be computed; no requirement change — dependency only

## Impact

- `intelligence/training_load.py` — refactored to expose standalone `compute_trimp()` and `compute_daily_load()` functions
- `intelligence/recovery.py` — `compute_hrv_status()` updated; baseline now reads from `user_profile` columns rather than recomputing from raw HRV window
- `intelligence/signal_assembly.py` — new file; single entry point for all signal computation
- `ingestion/workout.py` — post-sync calls added for TRIMP, hr_stability, fatigue_index, and training_load_daily upsert
- `repos/workout_repo.py` — add `get_trimp_series()`, `upsert_trimp()`, `upsert_fatigue_index()`, `upsert_hr_stability()`
- `repos/recommendation_repo.py` — new file; `upsert_training_load_daily()`, `get_training_load_daily()`, `get_pattern_fatigue_ledger()`
- `repos/user_profile_repo.py` — add `update_hrv_baseline()`, `get_hrv_baseline()`, `update_zone_speeds()`
- `services/intelligence/training_load_service.py` — updated to read from `training_load_daily` instead of recomputing
- Dashboard response latency reduced — load metrics served from precomputed table