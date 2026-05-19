## Context

The recommendation engine v2.0 requires 18 new tables, extensions to 4 existing tables, 4 new columns on `workouts`, 2 catalog seed sets, a parity-enforcement trigger, and a partial unique index. All DDL is verbatim in `RECOMMENDATION_PROTOCOL.md §2`. Current highest Flyway version is V005. No application code changes are in scope.

Flyway applies all `.sql` files in `QuantifiedStrides/db/flyway/` in version order. `BASELINE_ON_MIGRATE=true` means fresh DBs and DBs already at V005 both work: fresh runs all versions; existing V005 DB gets pending versions applied on next `docker compose up`.

## Goals / Non-Goals

**Goals:**
- All 18 new tables created with correct types, constraints, and FK relationships
- 4 existing tables extended idempotently (`IF NOT EXISTS` on all columns)
- 4 new nullable columns on `workouts` with no impact on existing rows
- `movement_patterns` seeded with 9 rows; `strength_phase_catalog` seeded with 4 rows
- `trg_plan_session_templates_parity` trigger active and enforcing parity exclusivity
- `training_plans_one_active_per_user` partial unique index in place
- Migrations idempotent on repeated apply (Flyway checksum-safe)

**Non-Goals:**
- Seeding `plan_types`, `plan_goal_tiers`, `plan_type_phases`, `session_type_catalog`, `plan_session_templates`, `strength_phase_exercises` — P2 catalog seeds
- Populating `training_load_daily`, `biomechanics_baselines`, or any computed columns — Story 002
- Populating `exercise_relationships` — no seed data defined in spec
- Any Python, API, or frontend changes

## Decisions

### 1. Split migrations across multiple files by logical group

**Decision:** Use three migration files (V006, V007, V008) grouped by dependency tier rather than a single monolithic file.

- **V006** — User profile + workout signal columns, stand-alone reference tables (`movement_patterns`, `injuries` extension), and exercise ontology columns. These have no FK dependencies on new tables (except `exercises.primary_pattern → movement_patterns`, handled by ordering within the file).
- **V007** — Plan catalog tables (`plan_types`, `plan_goal_tiers`, `plan_type_phases`, `session_type_catalog`, `plan_session_templates`) and strength catalog (`strength_phase_catalog`, `strength_phase_exercises`). These FK on each other but not on training plans.
- **V008** — `competitions`, `training_plans` (FKs to `competitions`, `plan_types`), `training_plan_weeks`, `training_load_daily`, `biomechanics_baselines`, `user_1rm_cache`, `exercise_relationships`, `pattern_fatigue_ledger`, `exercise_session_log`. These FK on earlier tables.

**Why over single file:** smaller diffs, easier review, clearer rollback isolation if a group fails. Flyway stops at the first failing version, so a bad V008 doesn't prevent V006+V007 from landing.

**Why over per-table files:** 20+ files creates noise in the migration history for a single logical change. Three files match the three natural dependency tiers.

### 2. Include `strength_goal` and `goal_weights` directly in `CREATE TABLE training_plans`

**Decision:** Rather than `CREATE TABLE training_plans` followed by `ALTER TABLE training_plans ADD COLUMN IF NOT EXISTS ...`, include these two columns in the initial `CREATE TABLE`. The spec explicitly permits this.

**Why:** Avoids two DDL operations on the same new table. The `IF NOT EXISTS` pattern is only needed for columns added to *existing* tables that may already have rows.

### 3. All `ALTER TABLE` additions use `IF NOT EXISTS`

All extensions to `user_profile`, `exercises`, `injuries`, and `workouts` use `ADD COLUMN IF NOT EXISTS`. This makes the migrations idempotent on re-run and safe on a DB where a column was manually added during development.

### 4. Catalog seeds are inlined in the migration file

`movement_patterns` (9 rows) and `strength_phase_catalog` (4 rows) are inserted inside their respective migration files. Since seeds are deterministic and keyed by `PRIMARY KEY`, re-running the migration would fail on `UNIQUE` violation — but Flyway's checksum protection prevents re-runs of committed files anyway.

## Risks / Trade-offs

- **`exercises` FK on `movement_patterns.pattern_key`** → `movement_patterns` must be created (and seeded) before the `ALTER TABLE exercises ADD COLUMN primary_pattern` FK. Within V006, order the `CREATE TABLE movement_patterns + INSERT` before the `ALTER TABLE exercises` block.
- **`plan_session_templates` parity trigger** → trigger function must be created before the trigger itself; both must be in V007 after `plan_session_templates CREATE TABLE`. Any test INSERT must respect the trigger or it will raise.
- **`strength_phase_exercises` FK on `exercises.exercise_id`** → exercises table must already exist (it does, from V001) and the exercise pool (797 rows) must be seeded. Seeding is handled by the Docker seed container, not Flyway — `strength_phase_exercises` table is created empty; exercise assignment is a P2 task.
- **`training_plans_one_active_per_user` partial index** → only one active plan per user. Any seed or test data that inserts two active plans for the same user will fail. Safe for a fresh DB with no plan rows.

## Migration Plan

1. Add `V006__rec_engine_user_workout_exercise_schema.sql`
2. Add `V007__rec_engine_plan_catalogs.sql`
3. Add `V008__rec_engine_load_and_tracking_tables.sql`
4. Run `docker compose down -v && docker compose up -d` — validates on fresh DB
5. Run `docker compose up -d` on a DB at V005 — validates non-destructive incremental apply
6. Confirm `flyway` service exits 0 in both cases

**Rollback:** Flyway does not support automatic rollback. Roll back by dropping all new tables and reverting `ALTER TABLE` changes manually — acceptable since this change is landing before any application code reads the new schema.

## Open Questions

_(none — DDL is fully specified in §2 of the protocol)_
