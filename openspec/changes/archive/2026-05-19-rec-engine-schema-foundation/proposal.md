## Why

The recommendation engine v2.0 spec (§2 of `RECOMMENDATION_PROTOCOL.md`) defines 18 new tables, ALTER TABLE extensions to 4 existing tables, and 4 new columns on `workouts` — none of which exist beyond V005. Every P1 feature in the rec engine build depends on at least one of these additions, so the schema must land first as an isolated, non-destructive foundation before any application code is written.

## What Changes

- **New tables (18):** `training_load_daily`, `competitions`, `menstrual_cycles`, `biomechanics_baselines`, `user_1rm_cache`, `movement_patterns`, `exercise_relationships`, `pattern_fatigue_ledger`, `exercise_session_log`, `plan_types`, `plan_goal_tiers`, `plan_type_phases`, `session_type_catalog`, `plan_session_templates`, `strength_phase_catalog`, `strength_phase_exercises`, `training_plans`, `training_plan_weeks`
- **Extended tables (ALTER TABLE):** `user_profile` (+9 columns), `exercises` (+11 columns via `IF NOT EXISTS`), `injuries` (+5 columns via `IF NOT EXISTS`), `training_plans` (+2 columns via `IF NOT EXISTS` — included directly in `CREATE TABLE` for simplicity)
- **New columns on `workouts`:** `trimp`, `terrain_type`, `fatigue_index`, `hr_stability_last_10min` — all nullable, no impact on existing rows
- **Seed data:** `movement_patterns` (9 rows with `fatigue_decay_tau_h` values), `strength_phase_catalog` (4 rows: gpp, spp, power, maintenance)
- **Trigger:** `trg_plan_session_templates_parity` on `plan_session_templates` — enforces parity exclusivity (a slot uses `'any'` XOR the `odd/even` pair, never both)
- **Partial unique index:** `training_plans_one_active_per_user` — one active plan per user
- No user-visible behavior changes; no Python, API, or frontend changes

## Capabilities

### New Capabilities

- `rec-engine-schema`: Database schema additions (tables, columns, indexes, trigger, seed catalogs) required as the foundation for the recommendation engine v2.0 — covers all DDL from `RECOMMENDATION_PROTOCOL.md §2`

### Modified Capabilities

_(none — no existing spec-level behavior changes)_

## Impact

- **Database only:** Flyway migrations V006+ in `QuantifiedStrides/db/flyway/`
- **No existing rows affected:** all `ALTER TABLE` additions use `IF NOT EXISTS` with safe defaults or are nullable
- **Dependency order:** `movement_patterns` must precede `exercises` FK; `plan_types` must precede `plan_goal_tiers`, `plan_type_phases`, `plan_session_templates`; `session_type_catalog` must precede `plan_session_templates`; `strength_phase_catalog` must precede `plan_type_phases` FK and `strength_phase_exercises`; `competitions` and `plan_types` must precede `training_plans`; `training_plans` must precede `training_plan_weeks`
