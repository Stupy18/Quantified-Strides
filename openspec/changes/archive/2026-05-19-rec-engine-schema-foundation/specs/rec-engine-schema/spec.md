## ADDED Requirements

### Requirement: New tables created
All 18 new tables defined in `RECOMMENDATION_PROTOCOL.md §2` SHALL exist after migrations apply, with correct column types, constraints (CHECK, NOT NULL, DEFAULT), and foreign key relationships.

#### Scenario: Fresh database migration
- **WHEN** `docker compose down -v && docker compose up -d` is run
- **THEN** all 18 new tables exist and the Flyway service exits with code 0

#### Scenario: Incremental migration on existing V005 database
- **WHEN** `docker compose up -d` is run on a database already at schema V005
- **THEN** all V006+ migrations apply cleanly, no existing rows are destroyed, and the Flyway service exits with code 0

### Requirement: Existing tables extended idempotently
All `ALTER TABLE` additions to `user_profile`, `exercises`, `injuries`, and `workouts` SHALL use `ADD COLUMN IF NOT EXISTS` so re-running a migration on a database that already has the column does not fail.

#### Scenario: Column already exists
- **WHEN** a migration adding a column via `IF NOT EXISTS` runs on a DB that already has the column
- **THEN** the migration completes without error and the column's existing data is preserved

### Requirement: Workouts table extended with signal columns
Four new nullable columns (`trimp`, `terrain_type`, `fatigue_index`, `hr_stability_last_10min`) SHALL be added to the `workouts` table. All four are nullable. No existing row SHALL be affected.

#### Scenario: Existing workout rows after migration
- **WHEN** migrations run on a database with existing workout rows
- **THEN** all four new columns are NULL on existing rows and no existing columns are modified

### Requirement: movement_patterns catalog seeded
The `movement_patterns` table SHALL contain exactly 9 rows after migration, with the `fatigue_decay_tau_h` values specified in §2: `POWER_FULL_BODY=72.0`, `HIP_HINGE=60.0`, `KNEE_DOMINANT=60.0`, `HORIZONTAL_PUSH=48.0`, `HORIZONTAL_PULL=48.0`, `VERTICAL_PUSH=48.0`, `VERTICAL_PULL=48.0`, `CARRY_BRACE=36.0`, `ISOLATION=24.0`.

#### Scenario: Pattern catalog row count
- **WHEN** migrations complete on a fresh database
- **THEN** `SELECT COUNT(*) FROM movement_patterns` returns 9

#### Scenario: Pattern fatigue decay values
- **WHEN** the `movement_patterns` table is queried after migration
- **THEN** `POWER_FULL_BODY` has `fatigue_decay_tau_h = 72.0` and `ISOLATION` has `fatigue_decay_tau_h = 24.0`

### Requirement: strength_phase_catalog seeded
The `strength_phase_catalog` table SHALL contain exactly 4 rows after migration: `gpp`, `spp`, `power`, `maintenance`.

#### Scenario: Strength phase catalog row count
- **WHEN** migrations complete on a fresh database
- **THEN** `SELECT COUNT(*) FROM strength_phase_catalog` returns 4

#### Scenario: Strength phase keys present
- **WHEN** `strength_phase_catalog` is queried after migration
- **THEN** rows with `phase_key` values `'gpp'`, `'spp'`, `'power'`, and `'maintenance'` all exist

### Requirement: Parity trigger enforces exclusivity
The `trg_plan_session_templates_parity` trigger on `plan_session_templates` SHALL raise an exception when a row with `week_parity = 'any'` is inserted for a slot that already has an `'odd'` or `'even'` row, and vice versa.

#### Scenario: Insert 'any' when odd/even exists
- **WHEN** a row with `week_parity = 'odd'` exists for a given `(plan_type_key, tier, phase, quality_count, day_of_week)` slot, and a new row with `week_parity = 'any'` is inserted for the same slot
- **THEN** the INSERT raises an exception containing `'parity conflict'`

#### Scenario: Insert odd/even when 'any' exists
- **WHEN** a row with `week_parity = 'any'` exists for a given slot, and a new row with `week_parity = 'odd'` is inserted for the same slot
- **THEN** the INSERT raises an exception containing `'parity conflict'`

#### Scenario: Compatible parity insert succeeds
- **WHEN** no row exists for a given slot and a row with `week_parity = 'any'` is inserted
- **THEN** the INSERT succeeds without error

### Requirement: One active plan per user enforced
The `training_plans_one_active_per_user` partial unique index SHALL prevent inserting a second row with `status = 'active'` for the same `user_id`.

#### Scenario: Duplicate active plan rejected
- **WHEN** a user already has a row in `training_plans` with `status = 'active'` and a second INSERT with `status = 'active'` for the same user is attempted
- **THEN** the INSERT fails with a unique constraint violation

#### Scenario: Multiple historical plans allowed
- **WHEN** a user has an `'active'` plan and a `'completed'` plan
- **THEN** both rows coexist without constraint violation

### Requirement: Flyway checksums pass on re-run
No committed migration file SHALL be edited after its first apply. Flyway SHALL pass checksum validation on every `docker compose up`.

#### Scenario: Re-run with unchanged migration files
- **WHEN** `docker compose up -d` is run on a fully migrated database with no file changes
- **THEN** the Flyway service exits 0 and logs that all migrations are already applied
