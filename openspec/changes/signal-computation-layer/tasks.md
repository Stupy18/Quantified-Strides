## 1. Repository Layer

- [ ] 1.1 Add `get_trimp_series(user_id, start_date, end_date)` to `repos/workout_repo.py` — returns list of `(date, trimp)` tuples for non-NULL trimp rows
- [ ] 1.2 Add `upsert_trimp(workout_id, trimp)` to `repos/workout_repo.py`
- [ ] 1.3 Add `upsert_hr_stability(workout_id, value)` to `repos/workout_repo.py`
- [ ] 1.4 Add `upsert_fatigue_index(workout_id, value)` to `repos/workout_repo.py`
- [ ] 1.5 Add `upsert_terrain_type(workout_id, terrain_type)` to `repos/workout_repo.py`
- [ ] 1.6 Create `repos/recommendation_repo.py` with `upsert_training_load_daily(user_id, date, atl, ctl, tsb, acwr, ramp_rate)` and `get_training_load_daily(user_id, date)` (returns most recent row within 7 days)
- [ ] 1.7 Add `get_pattern_fatigue_ledger(user_id, since_date)` to `repos/recommendation_repo.py`
- [ ] 1.8 Add `upsert_pattern_fatigue_ledger(user_id, pattern_key, session_date, fatigue_units)` to `repos/recommendation_repo.py`
- [ ] 1.9 Add `get_hrv_baseline(user_id)` to `repos/user_profile_repo.py` (or equivalent existing user profile repo) — returns `(mean, sd)` tuple or `(None, None)`
- [ ] 1.10 Add `update_hrv_baseline(user_id, mean, sd)` to user profile repo
- [ ] 1.11 Add `update_zone_speeds(user_id, zone_speeds_jsonb)` to user profile repo
- [ ] 1.12 Add `get_biomechanics_baseline(user_id, terrain_type)` to `repos/recommendation_repo.py` (reads `biomechanics_baselines`)

## 2. TRIMP Computation

- [ ] 2.1 Implement `compute_trimp(duration_min, avg_hr, resting_hr, max_hr, sex)` in `intelligence/training_load.py` using Banister formula with sex-specific coefficients; HRr clamped to `[0, 1]`
- [ ] 2.2 Implement `compute_load_metrics(trimp_series, today)` in `intelligence/training_load.py` with exponential decay (TAU_ATL=7, TAU_CTL=42), ACWR null-when-CTL<1, ramp_rate null-when-<14-days; mark constants `# HEURISTIC`
- [ ] 2.3 Add `get_resting_hr(user_id, today)` query in `repos/sleep_repo.py` — 7-day median of `sleep_sessions.min_hr`

## 3. Post-Sync Signal Writes

- [ ] 3.1 In `ingestion/workout.py`, after each workout is written, call `compute_trimp()` using the workout's `avg_hr`, `duration_min`, resting HR from sleep repo, and `user_profile.max_hr` / `sex`; write result via `upsert_trimp()`
- [ ] 3.2 In `ingestion/workout.py`, for running workouts with `workout_metrics`, call `compute_hr_stability()` over final-10-min HR slice; write via `upsert_hr_stability()`
- [ ] 3.3 In `ingestion/workout.py`, call `classify_terrain()` on running workouts with ≥ 10 gradient readings; write via `upsert_terrain_type()`
- [ ] 3.4 In `ingestion/workout.py`, call `compute_fatigue_index()` for running workouts that have a matching `biomechanics_baselines` row; write via `upsert_fatigue_index()`; silently skip (NULL) when no baseline
- [ ] 3.5 Implement `compute_hr_stability(hr_series)` in `intelligence/analytics/biomechanics.py` — returns CV float or `None` when len < 10
- [ ] 3.6 Implement `classify_terrain(gradient_series)` in `intelligence/analytics/biomechanics.py` — returns `'road'` or `'trail'` or `None` when < 10 readings
- [ ] 3.7 Implement `compute_fatigue_index(cadence, gct_ms, vertical_ratio, baseline_row)` in `intelligence/analytics/biomechanics.py` — weighted deviation (50/30/20); mark weights `# HEURISTIC`

## 4. Training Load Daily

- [ ] 4.1 In `ingestion/workout.py` (end of successful sync pipeline), call `compute_load_metrics()` with last 90 days of TRIMP from `get_trimp_series()` and upsert today's row via `upsert_training_load_daily()`
- [ ] 4.2 Ensure `upsert_training_load_daily()` is the last step — if it fails, sync returns 500; the previous row is untouched

## 5. HRV Baseline

- [ ] 5.1 Implement `establish_hrv_baseline(hrv_series, preceding_trimp, easy_threshold=50.0, min_clean=14)` in `intelligence/recovery.py` — filters clean readings, returns `(mean, sd)` or `None`; mark `easy_threshold` and `min_clean` as `# HEURISTIC`
- [ ] 5.2 Update `compute_hrv_status()` in `intelligence/recovery.py` to accept `personal_mean`, `personal_sd` params and use them instead of recomputing a rolling window; return `consecutive_suppressed` count
- [ ] 5.3 After `upsert_training_load_daily()` in sync pipeline, fetch full HRV series + preceding TRIMP, call `establish_hrv_baseline()`, and write result via `update_hrv_baseline()` if non-None

## 6. Pattern Fatigue Ledger

- [ ] 6.1 Implement `compute_pattern_fatigue_residuals(ledger_rows, movement_patterns, now)` in `intelligence/recommend.py` — exponential decay per pattern using `fatigue_decay_tau_h`; returns dict with all 9 patterns
- [ ] 6.2 Implement cold-start branch: when a pattern has < 5 ledger entries, use `(1 − mean(freshness[primary_muscles])) × 3.0`; mark as `# HEURISTIC`
- [ ] 6.3 After each strength session write in `services/strength_service.py`, call `upsert_pattern_fatigue_ledger()` for each engaged pattern using `cns_cost + local_fatigue_cost` sum

## 7. Zone Speeds Calibration

- [ ] 7.1 Implement `compute_zone_speeds(qualifying_runs, workout_metrics_by_run)` in `intelligence/analytics/running_economy.py` — builds pace ranges per terrain type per HR zone; skips zones with < 5 samples
- [ ] 7.2 Trigger zone speeds calibration as a background task at end of sync; on error, log and continue (do not fail sync); skip if < 5 qualifying runs available

## 8. Signal Assembly

- [ ] 8.1 Create `intelligence/signal_assembly.py` with `assemble_signals(user_id, today, workout_repo, sleep_repo, strength_repo, recommendation_repo, user_profile_repo)` accepting injected repos
- [ ] 8.2 Implement assembly of all §3.1 signals: load from `training_load_daily`, HRV status from stored baseline, sleep readiness, muscle freshness, pattern fatigue residuals, biomechanics fatigue, zone speeds; all keys present, missing values as `None`
- [ ] 8.3 Wrap each individual signal call in try/except; on exception log the error and set that signal to `None` — do not propagate

## 9. Service Layer Updates

- [ ] 9.1 Update `services/intelligence/training_load_service.py` to read ATL/CTL/TSB from `recommendation_repo.get_training_load_daily()` instead of calling `intelligence.training_load.get_metrics()`
- [ ] 9.2 Update `services/intelligence/recovery_service.py` to use new `compute_hrv_status()` signature (pass stored baseline from user_profile)
- [ ] 9.3 Register `RecommendationRepo` factory in `deps.py`

## 10. Register RecommendationRepo and Wire Dependencies

- [ ] 10.1 Add `get_recommendation_repo` factory to `deps.py` following existing repo factory pattern
- [ ] 10.2 Inject `recommendation_repo` into `sync.py` router handler so it can be passed to post-sync compute functions

## 11. Validation

- [ ] 11.1 Verify `workouts.trimp` is populated for a newly synced workout with HR data; confirm NULL for workout without `avg_hr`
- [ ] 11.2 Verify `training_load_daily` row is upserted after a sync; confirm ATL/CTL/TSB are non-zero for a user with training history
- [ ] 11.3 Verify dashboard load time improvement — ATL/CTL/TSB response must come from `training_load_daily` (add query-level logging or check with debugger)
- [ ] 11.4 Verify `compute_hrv_status()` returns `'no_data'` for a user with NULL `hrv_baseline_mean`
- [ ] 11.5 Verify `assemble_signals()` returns all §3.1 keys with no missing keys in output dict
- [ ] 11.6 Confirm `pattern_fatigue_residuals` uses cold-start approximation for patterns with < 5 ledger entries; switches to decay above 5