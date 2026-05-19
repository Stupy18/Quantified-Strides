## 1. V006 — User, Workout, and Exercise Schema

- [x] 1.1 Create `V006__rec_engine_user_workout_exercise_schema.sql`: ALTER TABLE `user_profile` to add `training_status`, `sex`, `date_of_birth`, `max_hr`, `max_hr_source`, `zone_speeds`, `hormonal_contraception`, `hrv_baseline_mean`, `hrv_baseline_sd` (all `IF NOT EXISTS`)
- [x] 1.2 In V006: ALTER TABLE `workouts` to add `trimp FLOAT`, `terrain_type VARCHAR(10)`, `fatigue_index FLOAT`, `hr_stability_last_10min FLOAT` — all nullable, all `IF NOT EXISTS`
- [x] 1.3 In V006: CREATE TABLE `movement_patterns` with `pattern_key`, `display_name`, `fatigue_decay_tau_h`, `notes`
- [x] 1.4 In V006: INSERT the 9 seed rows into `movement_patterns` (`POWER_FULL_BODY=72.0` through `ISOLATION=24.0`)
- [x] 1.5 In V006: ALTER TABLE `exercises` to add `primary_pattern`, `secondary_patterns`, `equipment`, `cns_cost`, `local_fatigue_cost`, `skill_level`, `velocity_based`, `bilateral`, `tags`, `enabled`, `permanent_fixture` — all `IF NOT EXISTS`
- [x] 1.6 In V006: ALTER TABLE `injuries` to add `severity`, `affected_activities`, `cross_training_ok`, `cleared_by_user`, `return_volume_pct` — all `IF NOT EXISTS`

## 2. V007 — Plan Catalog and Strength Phase Tables

- [x] 2.1 Create `V007__rec_engine_plan_catalogs.sql`: CREATE TABLE `plan_types` with `plan_type_key`, `display_name`, `sport_category`, `enabled`, `notes`
- [x] 2.2 In V007: CREATE TABLE `plan_goal_tiers` with FK to `plan_types`
- [x] 2.3 In V007: CREATE TABLE `strength_phase_catalog` with `phase_key`, `display_label`, `sessions_pw`, `sets_range`, `reps_range`, `load_pct_range`, `plyometrics`, `plyo_note`, `scheduling_note`, `rationale`
- [x] 2.4 In V007: INSERT the 4 seed rows into `strength_phase_catalog` (`gpp`, `spp`, `power`, `maintenance`)
- [x] 2.5 In V007: CREATE TABLE `plan_type_phases` with FK to `plan_types` and `strength_phase_catalog`
- [x] 2.6 In V007: CREATE TABLE `session_type_catalog` with `type_key`, `display_name`, zone fields, duration fields, `recovery_days`, `max_per_week`, `purpose`, `structure_note`, `applicable_phases`
- [x] 2.7 In V007: CREATE TABLE `plan_session_templates` with FKs to `plan_types` and `session_type_catalog`, UNIQUE constraint on `(plan_type_key, tier, phase, quality_count, week_parity, day_of_week)`
- [x] 2.8 In V007: CREATE OR REPLACE FUNCTION `plan_session_templates_parity_check()` implementing the parity exclusivity logic
- [x] 2.9 In V007: CREATE TRIGGER `trg_plan_session_templates_parity` BEFORE INSERT OR UPDATE on `plan_session_templates`
- [x] 2.10 In V007: CREATE TABLE `strength_phase_exercises` with FKs to `strength_phase_catalog` and `exercises`, UNIQUE on `(phase_key, exercise_id)`

## 3. V008 — Load, Tracking, and Plan Instance Tables

- [x] 3.1 Create `V008__rec_engine_load_and_tracking_tables.sql`: CREATE TABLE `training_load_daily` with `(user_id, load_date)` UNIQUE
- [x] 3.2 In V008: CREATE TABLE `competitions` with FK to `users`
- [x] 3.3 In V008: CREATE TABLE `menstrual_cycles` with FK to `users`, UNIQUE on `(user_id, start_date)`
- [x] 3.4 In V008: CREATE TABLE `biomechanics_baselines` with FK to `users`, UNIQUE on `(user_id, terrain_type)`
- [x] 3.5 In V008: CREATE TABLE `user_1rm_cache` with FKs to `users` and `exercises`, UNIQUE on `(user_id, exercise_id)`
- [x] 3.6 In V008: CREATE TABLE `exercise_relationships` with FKs to `exercises` (both directions), UNIQUE on `(exercise_a_id, exercise_b_id, relationship_type)`
- [x] 3.7 In V008: CREATE TABLE `pattern_fatigue_ledger` with FKs to `users` and `movement_patterns`, UNIQUE on `(user_id, pattern_key, session_date)`
- [x] 3.8 In V008: CREATE TABLE `exercise_session_log` with FKs to `users` and `exercises`, UNIQUE on `(user_id, session_date, slot_index)`
- [x] 3.9 In V008: CREATE TABLE `training_plans` including `strength_goal` and `goal_weights` columns inline, FKs to `users`, `competitions`, `plan_types`
- [x] 3.10 In V008: CREATE UNIQUE INDEX `training_plans_one_active_per_user` ON `training_plans (user_id) WHERE status = 'active'`
- [x] 3.11 In V008: CREATE TABLE `training_plan_weeks` with FKs to `training_plans` and `strength_phase_catalog`, UNIQUE on `(plan_id, week_number)`

## 4. Validation

- [x] 4.1 Run `docker compose down -v && docker compose up -d` — confirm Flyway service exits 0 on a fresh database
- [x] 4.2 Run `docker compose up -d` on an existing V005 database — confirm Flyway service exits 0 and no existing rows are affected
- [x] 4.3 Confirm `SELECT COUNT(*) FROM movement_patterns` returns 9
- [x] 4.4 Confirm `SELECT COUNT(*) FROM strength_phase_catalog` returns 4 and all four `phase_key` values are present
- [x] 4.5 Confirm `trg_plan_session_templates_parity` trigger is active: attempt a parity-conflicting insert and confirm exception is raised
- [x] 4.6 Confirm `training_plans_one_active_per_user` index is present: attempt two active plan inserts for the same user and confirm unique constraint violation
- [x] 4.7 Confirm all 18 new tables exist via `\dt` or information_schema query
- [x] 4.8 Confirm re-running `docker compose up -d` on an already-migrated DB passes Flyway checksum validation (exits 0, no re-apply)
