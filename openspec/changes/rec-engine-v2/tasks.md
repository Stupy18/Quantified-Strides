## 1. Schema Migrations

- [ ] 1.1 Write V003 migration: add `training_status`, `sex`, `date_of_birth`, `max_hr`, `max_hr_source`, `zone_speeds`, `hormonal_contraception`, `hrv_baseline_mean`, `hrv_baseline_sd` to `user_profile`; add `trimp`, `fatigue_index`, `terrain_type`, `hr_stability_last_10min` to `workouts`
- [ ] 1.2 Write V004 migration: create `training_load_daily` table; create `movement_patterns` table with seed rows for all 9 patterns; create `pattern_fatigue_ledger` table
- [ ] 1.3 Write V005 migration: add `primary_pattern`, `secondary_patterns`, `equipment`, `cns_cost`, `local_fatigue_cost`, `skill_level`, `velocity_based`, `bilateral`, `tags`, `enabled`, `permanent_fixture` to `exercises`; create `exercise_relationships`, `exercise_session_log`, `user_1rm_cache` tables
- [ ] 1.4 Write V006 migration: create `competitions`, `menstrual_cycles`, `biomechanics_baselines` tables
- [ ] 1.5 Write V007 migration: extend `injuries` table with `severity`, `affected_activities`, `cross_training_ok`, `cleared_by_user`, `return_volume_pct`
- [ ] 1.6 Write V008 migration: create plan catalog tables (`plan_types`, `plan_goal_tiers`, `plan_type_phases`, `session_type_catalog`, `plan_session_templates`, `strength_phase_catalog`, `strength_phase_exercises`) with parity trigger and all seed rows
- [ ] 1.7 Write V009 migration: create `training_plans` (with partial unique index), `training_plan_weeks` tables; add `strength_goal` and `goal_weights` to `training_plans`
- [ ] 1.8 Verify all migrations apply cleanly on a fresh DB and on an existing DB with existing data

## 2. Repository Layer

- [ ] 2.1 Create `repos/recommendation_repo.py` with async methods for: `upsert_training_load_daily`, `get_training_load_history`, `get_competitions`, `upsert_competition`, `get_active_plan`, `upsert_training_plan`, `get_pattern_fatigue_ledger`, `upsert_pattern_fatigue_ledger`, `get_exercise_session_log`, `insert_exercise_session_log`, `get_1rm_cache`, `upsert_1rm_cache`, `get_biomechanics_baseline`, `upsert_biomechanics_baseline`
- [ ] 2.2 Extend `repos/workout_repo.py` with: `get_trimp_series(user_id, days)`, `get_qualifying_runs_for_zone_calibration(user_id)`
- [ ] 2.3 Extend `repos/strength_repo.py` with: `get_sets_for_1rm(user_id, exercise_id)`, `get_pattern_fatigue_units(user_id, session_date)`
- [ ] 2.4 Add factory `get_recommendation_repo` to `deps.py`

## 3. Signal Assembly Layer

- [ ] 3.1 Create `intelligence/signal_assembly.py` with `assemble_signals(user_id, repos, today) -> dict` — calls all signal computations and returns the full signals dict with all keys, missing signals as `None`
- [ ] 3.2 Implement `compute_trimp(duration_min, avg_hr, resting_hr, max_hr, sex) -> float | None` per Banister formula with sex-specific coefficients
- [ ] 3.3 Implement `compute_load_metrics(trimp_series, today) -> dict` with TAU_ATL=7, TAU_CTL=42, ACWR null when CTL < 1, ramp_rate null when < 14 days
- [ ] 3.4 Implement `establish_hrv_baseline(hrv_series, preceding_trimp, easy_threshold=50, min_clean=14) -> tuple | None` — post-rest/easy only, stores to user_profile
- [ ] 3.5 Implement `compute_hrv_status(today_hrv, baseline_mean, baseline_sd) -> str` — returns 'suppressed'/'normal'/'elevated'/'no_data'
- [ ] 3.6 Implement `compute_sleep_readiness(sleep_row) -> float | None`
- [ ] 3.7 Implement `compute_hr_stability(hr_series) -> float | None` — CV of final 10 min HR
- [ ] 3.8 Implement `compute_zone_speeds(qualifying_runs) -> dict` — pace ranges per zone, None per zone when < 5 qualifying runs
- [ ] 3.9 Implement `compute_max_hr(workout_metrics_rows) -> int | None` — 99th percentile of HR across qualifying runs
- [ ] 3.10 Implement `compute_hr_rpe_ratio(sessions) -> str | None` — returns 'normal'/'decoupled'/None
- [ ] 3.11 Implement `estimate_cycle_phase(menstrual_cycles_row, today) -> str | None`
- [ ] 3.12 Implement `compute_pattern_fatigue_residuals(ledger_rows, movement_patterns) -> dict` — exponential decay per pattern; cold-start approximation from muscle_freshness when < 5 entries
- [ ] 3.13 Implement `compute_exercise_recency(session_log_rows) -> dict` — days since last selected per exercise_id

## 4. Safety Gates

- [ ] 4.1 Create `intelligence/safety_gates.py` with `apply_safety_gates(signals) -> GateResult` returning the first gate that fired (or None)
- [ ] 4.2 Implement Gate 0: ACWR > 1.8 → mandatory rest, OTS alert with healthcare provider append
- [ ] 4.3 Implement Gate 1: ACWR > 1.5 ≤ 1.8 → active recovery only (Zone 1, ≤ 45 min)
- [ ] 4.4 Implement Gate 2: ACWR > 1.3 + ramp_rate > 10 → duration cap at 60 min
- [ ] 4.5 Implement injury block: read active injuries, block `affected_activities`, offer cross-training when `cross_training_ok = TRUE`
- [ ] 4.6 Ensure `STANDARD_DISCLAIMER` is always set in output regardless of gate outcome

## 5. Daily Recommendation Engine

- [ ] 5.1 Rewrite `intelligence/recommend.py` — replace internals with: signal validation → safety gates → readiness composite → sport selection → session type / zone selection → prescription assembly → typed output
- [ ] 5.2 Implement `compute_readiness_composite(signals) -> float | None` — weighted average of HRV (0.4), sleep (0.3), TSB-normalized (0.2), subjective (0.1) with missing-signal renormalization
- [ ] 5.3 Implement sport selector — priority-weight scoring modulated by muscle freshness, weather, time_available, hard rules (upper gym → no climbing, etc.), active plan session type override
- [ ] 5.4 Implement session type / intensity zone selector from `session_type_catalog` — gate on readiness composite and TSB thresholds
- [ ] 5.5 Define `DailyRecommendation`, `Alert`, `ExerciseSuggestion`, `RunningPrescription` Pydantic models in `models/dashboard.py`
- [ ] 5.6 Implement degradation table: map signal availability count to `confidence` ('high'/'medium'/'low'/'no_data')
- [ ] 5.7 Implement cold-start defaults for new users (zero signals → Zone 2 base session, `confidence='no_data'`)

## 6. Strength CSP Solver

- [ ] 6.1 Create `intelligence/strength_solver.py` with `select_exercises(signals, user_profile, available_exercises) -> list[ExerciseSuggestion]`
- [ ] 6.2 Implement CSP hard constraints: pattern freshness gate, CNS budget cap, equipment filter, injury block, skill level filter
- [ ] 6.3 Implement constraint relaxation fallback: relax optional constraints in order; final fallback = minimal bodyweight session
- [ ] 6.4 Implement CNS budget computation from TSB and `strength_goal`
- [ ] 6.5 Implement 1RM cache read and progression eligibility flag (3 consecutive sessions at current load)
- [ ] 6.6 Implement `permanent_fixture` append post-solver
- [ ] 6.7 Write `update_pattern_fatigue_ledger(user_id, session_date, strength_sets, exercises)` — computes and upserts `pattern_fatigue_ledger` after each strength session
- [ ] 6.8 Write `invalidate_1rm_cache(user_id, exercise_id, weight, reps)` — called on new `strength_sets` insert with reps ≤ 10

## 7. Running Prescription

- [ ] 7.1 Create `intelligence/running_prescription.py` with `build_running_prescription(signals, user_profile) -> RunningPrescription | None`
- [ ] 7.2 Implement zone-speed lookup from `user_profile.zone_speeds` for target zone and terrain
- [ ] 7.3 Implement terrain selection logic (road default, weather override, injury redirect)
- [ ] 7.4 Set `gap_adjusted = TRUE` when terrain is trail and `biomechanics_baselines` has a trail row
- [ ] 7.5 Append HR/RPE decoupling advisory when `hr_rpe_status = 'decoupled'`

## 8. Female Athlete Protocol

- [ ] 8.1 Implement `estimate_cycle_phase(menstrual_row, today) -> str | None` in signal assembly
- [ ] 8.2 Add cycle phase intensity modifiers to session type selector: follicular (+0), ovulatory (+0), luteal (zone cap -1, duration -10%), menstrual (Zone 1–2 default unless readiness > 0.75)
- [ ] 8.3 Add ACL awareness flag to `DailyRecommendation.alerts` when `sex='female'` and plyometric exercise selected (non-blocking, awareness-only language)
- [ ] 8.4 Guard all cycle modifier code paths with `hormonal_contraception is not TRUE` check

## 9. Competition Calendar

- [ ] 9.1 Add `POST /api/v1/competitions` and `GET /api/v1/competitions` endpoints in `api/v1/training.py`
- [ ] 9.2 Implement `days_to_competition` signal computation in `intelligence/signal_assembly.py`
- [ ] 9.3 Wire `days_to_competition` and `competition_priority` into sport selector and taper trigger logic

## 10. Training Plan Generator

- [ ] 10.1 Create `intelligence/plan_generator.py` with `create_plan(user_id, plan_type_key, tier, competition_id, target_time_min, strength_goal) -> TrainingPlan`
- [ ] 10.2 Implement `generate_plan_weeks(plan) -> list[TrainingPlanWeek]` from `plan_session_templates` for the full plan duration
- [ ] 10.3 Implement goal tier determination from `plan_goal_tiers` (bracket target_time_min; fallback to catchall)
- [ ] 10.4 Implement phase progression from `plan_type_phases.phase_fraction`
- [ ] 10.5 Implement cutback week insertion (week 4 of each mesocycle, −30% volume)
- [ ] 10.6 Implement `strength_goal` → CSP budget/pattern weight mapping
- [ ] 10.7 Implement `combination` goal_weights validation (must sum to 1.0 ± 0.01)
- [ ] 10.8 Add `POST /api/v1/plans` and `GET /api/v1/plans/active` endpoints

## 11. Injury Management

- [ ] 11.1 Implement injury state machine transitions in `services/checkin_service.py` or a new `services/injury_service.py`
- [ ] 11.2 Wire injury block into safety gates (step 4.5 above)
- [ ] 11.3 Implement return-to-run volume ramp: compute `return_volume_pct` on `cleared_by_user` set to TRUE, apply 10%/week progression
- [ ] 11.4 Add `POST /api/v1/injuries` and `PATCH /api/v1/injuries/{id}/clear` endpoints

## 12. Background Jobs

- [ ] 12.1 Add APScheduler to `requirements.txt` and register in FastAPI lifespan context
- [ ] 12.2 Implement post-sync job: compute `trimp`, `terrain_type`, `fatigue_index`, `hr_stability_last_10min` for new workouts, then upsert `training_load_daily`
- [ ] 12.3 Implement monthly zone speed calibration job: `compute_zone_speeds()` → upsert `user_profile.zone_speeds`
- [ ] 12.4 Implement quarterly max HR update job: `compute_max_hr()` → upsert `user_profile.max_hr` and `max_hr_source`
- [ ] 12.5 Implement HRV baseline re-establishment trigger: run `establish_hrv_baseline()` after each new sleep session where preceding day TRIMP ≤ 50 or None

## 13. Backfill Scripts

- [ ] 13.1 Write `scripts/backfill_trimp.py` — compute and write TRIMP for all existing workouts with HR data
- [ ] 13.2 Write `scripts/backfill_training_load.py` — populate `training_load_daily` for all users from existing TRIMP series
- [ ] 13.3 Write `scripts/backfill_terrain_type.py` — classify and write terrain_type for all existing workouts with workout_metrics

## 14. Service and API Wiring

- [ ] 14.1 Update `services/intelligence/recommendation_service.py` to call `assemble_signals()` then `build_recommendation()` and map `DailyRecommendation` to the dashboard schema
- [ ] 14.2 Update `services/dashboard_service.py` to consume the typed `DailyRecommendation` instead of the freeform dict
- [ ] 14.3 Update `ingestion/workout.py` to call TRIMP, terrain, fatigue_index, and hr_stability_last_10min computations after each workout ingest
- [ ] 14.4 Update `models/dashboard.py` with `DailyRecommendation` and nested model definitions

## 15. Tests

- [ ] 15.1 Unit tests for `compute_trimp` (sex-specific coefficients, HR clamping, None on missing data)
- [ ] 15.2 Unit tests for `compute_load_metrics` (ACWR null when CTL < 1, ramp_rate null < 14 days)
- [ ] 15.3 Unit tests for `compute_hrv_status` (suppressed/normal/elevated/no_data thresholds)
- [ ] 15.4 Unit tests for safety gates (each gate in isolation, gate ordering, short-circuit)
- [ ] 15.5 Unit tests for CSP solver (constraint satisfaction, fallback, permanent_fixture append)
- [ ] 15.6 Integration test: full `build_recommendation()` call with all-None signals returns valid `DailyRecommendation` with `confidence='no_data'`
- [ ] 15.7 Integration test: ACWR > 1.8 returns mandatory rest with OTS alert and disclaimer
