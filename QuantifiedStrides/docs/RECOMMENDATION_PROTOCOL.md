# QuantifiedStrides — Recommendation Engine Specification

**Version:** 2.0 | **Status:** Engineering Spec | **Date:** 2026-05-09

---

## 0. Mandatory Legal Constraints

Every recommendation response **MUST** include a disclaimer field.
The system **NEVER** diagnoses injury, illness, or overtraining.
All alert language is load-management framing, not medical assessment.
Cycle-phase content is performance optimisation framing only.

```
STANDARD_DISCLAIMER = (
  "This is a training load su
  ggestion based on your personal data. "
  "It is not medical advice. If you experience pain, illness, or unusual "
  "fatigue, consult a qualified healthcare provider before training."
)
```

Female athlete ACL flag: awareness only. Does not block sessions.
OTS-level alert: must append `"Consider consulting a healthcare provider."`

---

## 1. Scope

This spec covers the complete recommendation engine, which has two distinct subsystems:

**Daily engine** (§3–§11) — per-request computation. Runs on every dashboard load.
- Signal computation (what, when, where stored)
- Safety gates (hard overrides)
- Session selection logic
- Strength and running prescription
- Female athlete protocol
- Output contract (typed JSON) — §9
- Degradation / cold-start rules — §10, §11

**Plan generator** (§14–§16) — per-user, event-triggered. Runs on plan creation, plan revision, injury events.
- Training plan system — periodization, goal taxonomy, session type library, weekly templates
- Race-free (open-ended) training mode
- Injury management — states, cross-training, return-to-running protocol

**Background jobs** (§12) — async tasks invoked by both subsystems.
**Build order** (§13) — implementation priority across both subsystems.

**Input contract:** `build_recommendation()` expects a signals dict pre-assembled by the caller. Required keys: `acwr`, `hrv_status`, `sleep_readiness`, `readiness_scores`, `ctl`, `tsb`, `atl`, `ramp_rate`, `days_to_competition`, `competition_priority`, `muscle_freshness`, `biomechanics_fatigue_index`, `zone_speeds`, `hr_rpe_status`, `cycle_phase`, `hormonal_contraception`, `training_status`, `goal`, `sex`, `has_readiness_checkin`, `hrv_data_days`, `max_hr_source`, `biomechanics_baseline`, `has_zone_speeds`, `strength_goal`, `goal_weights`. All nullable per §3.1. Missing key = `None`; caller must not omit keys. `strength_goal` defaults to `'sport_support'` when `None` — the safest default for a concurrent athlete (minimal CNS interference with endurance training). `goal_weights` is `None` unless `strength_goal == 'combination'`. Signal assembly is tested independently of recommendation logic.

**Heuristic thresholds:** The following values are derived from sports science literature and validated against the Vlad dataset. They are labelled `# HEURISTIC` in code and may require per-athlete calibration as more data accumulates: TRIMP sex coefficients (Banister `[1]`), TAU_ATL=7 and TAU_CTL=42 (Morton `[2]`), HRV z-score thresholds (-1.5 / +1.0), biomechanics fatigue index weights (50/30/20), muscle decay τ defaults, and cycle phase intensity scales. None of these should be changed without at least 20 sessions of evidence showing systematic drift.

**Out of scope:** frontend rendering, narrative (Claude API), RAG.

---

## 2. Required Schema Additions

Run as migrations. All non-destructive.

```sql
-- ── user_profile additions ─────────────────────────────────────────────────
ALTER TABLE user_profile
  ADD COLUMN training_status  VARCHAR(20) NOT NULL DEFAULT 'recreational'
    CHECK (training_status IN ('untrained','recreational','trained','elite')),
  ADD COLUMN sex              VARCHAR(20) NOT NULL DEFAULT 'prefer_not_to_say'
    CHECK (sex IN ('male','female','prefer_not_to_say')),
  ADD COLUMN date_of_birth    DATE,
  ADD COLUMN max_hr           SMALLINT CHECK (max_hr BETWEEN 100 AND 230),
  ADD COLUMN max_hr_source    VARCHAR(20)
    CHECK (max_hr_source IN ('data_99th_pct','tanaka_formula','manual')),
  ADD COLUMN zone_speeds      JSONB NOT NULL DEFAULT '{}',
  -- {"road":{"z1":"6:30–7:30","z2":"5:45–6:30",...},"trail":{...}}
  ADD COLUMN hormonal_contraception BOOLEAN DEFAULT NULL,
  -- NULL = not provided → no cycle modifiers applied. NEVER assume.
  -- Source: (1) Garmin menstrual JSON export, (2) onboarding form.
  ADD COLUMN hrv_baseline_mean FLOAT,
  ADD COLUMN hrv_baseline_sd   FLOAT;
  -- Stored by establish_hrv_baseline() — accumulated continuously from post-rest/easy readings.
  -- NULL = fewer than 14 clean readings → compute_hrv_status() returns 'no_data'.
  -- "Clean" reading = preceding day TRIMP is NULL (rest) or ≤ 50 (easy Z2).
  -- Recompute whenever ≥ 14 clean readings are available; no dedicated baseline week needed.

-- ── Precomputed training load (one row per user per day) ───────────────────
CREATE TABLE training_load_daily (
  load_id     SERIAL PRIMARY KEY,
  user_id     INT  NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  load_date   DATE NOT NULL,
  atl         FLOAT NOT NULL,
  ctl         FLOAT NOT NULL,
  tsb         FLOAT NOT NULL,
  acwr        FLOAT,        -- NULL when CTL < 1 (avoid ÷ noise)
  ramp_rate   FLOAT,        -- % CTL change vs 7 days ago; NULL when < 2 weeks data
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, load_date)
);

-- ── Competition calendar ───────────────────────────────────────────────────
CREATE TABLE competitions (
  competition_id SERIAL PRIMARY KEY,
  user_id        INT    NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  event_date     DATE   NOT NULL,
  sport          VARCHAR(50) NOT NULL,
  event_name     VARCHAR(200),
  priority       CHAR(1) NOT NULL CHECK (priority IN ('A','B','C')),
  distance_km    FLOAT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- priority: A = goal race, B = tune-up, C = training race

-- ── Menstrual cycle log ────────────────────────────────────────────────────
CREATE TABLE menstrual_cycles (
  cycle_id               SERIAL PRIMARY KEY,
  user_id                INT      NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  start_date             DATE     NOT NULL,
  predicted_cycle_length SMALLINT,
  actual_cycle_length    SMALLINT,   -- backfilled when next cycle starts
  source                 VARCHAR(10) NOT NULL DEFAULT 'manual'
    CHECK (source IN ('garmin','manual','predicted')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, start_date)
);

-- ── Per-athlete biomechanics baselines (terrain-stratified) ───────────────
CREATE TABLE biomechanics_baselines (
  baseline_id          SERIAL PRIMARY KEY,
  user_id              INT         NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  terrain_type         VARCHAR(10) NOT NULL CHECK (terrain_type IN ('road','trail')),
  cadence_slope        FLOAT,          -- cadence ~ speed linear regression slope
  cadence_intercept    FLOAT,
  cadence_r2           FLOAT,
  gct_mean_ms          FLOAT,          -- ground contact time mean
  gct_sd_ms            FLOAT,
  vertical_ratio_mean  FLOAT,
  vertical_ratio_sd    FLOAT,
  sessions_used        SMALLINT,
  computed_at          DATE NOT NULL,
  UNIQUE (user_id, terrain_type)
);

-- ── 1RM estimate cache ─────────────────────────────────────────────────────
CREATE TABLE user_1rm_cache (
  cache_id      SERIAL PRIMARY KEY,
  user_id       INT   NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  exercise_id   INT   NOT NULL REFERENCES exercises(exercise_id) ON DELETE CASCADE,
  estimated_1rm FLOAT NOT NULL,    -- kg, via Epley formula
  source_weight FLOAT NOT NULL,
  source_reps   SMALLINT NOT NULL,
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, exercise_id)
);
-- Invalidate and recompute on every new strength_sets insert for this exercise.

-- ── Movement pattern catalog ───────────────────────────────────────────────
CREATE TABLE movement_patterns (
  pattern_key         VARCHAR(30) PRIMARY KEY,
  display_name        VARCHAR(100),
  fatigue_decay_tau_h FLOAT NOT NULL DEFAULT 48.0,
  -- HEURISTIC — hours for fatigue to decay to 1/e of peak load.
  -- Slower-recovering patterns (POWER_FULL_BODY=72h) reflect deeper neural demand.
  -- Calibrate per-athlete after ≥ 20 sessions.
  notes               TEXT
);
INSERT INTO movement_patterns (pattern_key, display_name, fatigue_decay_tau_h) VALUES
  ('POWER_FULL_BODY', 'Full-Body Power',   72.0),
  ('HIP_HINGE',       'Hip Hinge',         60.0),
  ('KNEE_DOMINANT',   'Knee Dominant',     60.0),
  ('HORIZONTAL_PUSH', 'Horizontal Push',   48.0),
  ('HORIZONTAL_PULL', 'Horizontal Pull',   48.0),
  ('VERTICAL_PUSH',   'Vertical Push',     48.0),
  ('VERTICAL_PULL',   'Vertical Pull',     48.0),
  ('CARRY_BRACE',     'Carry / Brace',     36.0),
  ('ISOLATION',       'Isolation',         24.0);

-- ── Exercise ontology columns ──────────────────────────────────────────────
-- Extends the existing exercises table (797 entries; exercise_id FK already used by user_1rm_cache).
-- cns_cost and local_fatigue_cost are independent axes:
--   power clean: cns_cost=5.0, local_fatigue_cost=2.5 (high neural, moderate local damage)
--   BSS high-rep: cns_cost=1.5, local_fatigue_cost=4.5 (low neural, high local damage)
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS primary_pattern     VARCHAR(30)
    REFERENCES movement_patterns(pattern_key),
  ADD COLUMN IF NOT EXISTS secondary_patterns  VARCHAR(30)[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS equipment           VARCHAR(20)[] NOT NULL DEFAULT '{}',
  -- Valid values: 'BARBELL','DUMBBELL','CABLE','MACHINE','BODYWEIGHT','SMITH'. App-layer validated.
  ADD COLUMN IF NOT EXISTS cns_cost            FLOAT NOT NULL DEFAULT 2.5
    CHECK (cns_cost BETWEEN 1.0 AND 5.0),
  ADD COLUMN IF NOT EXISTS local_fatigue_cost  FLOAT NOT NULL DEFAULT 2.5
    CHECK (local_fatigue_cost BETWEEN 1.0 AND 5.0),
  ADD COLUMN IF NOT EXISTS skill_level         SMALLINT NOT NULL DEFAULT 1
    CHECK (skill_level IN (1,2,3)),
  ADD COLUMN IF NOT EXISTS velocity_based      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bilateral           BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS tags                TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS permanent_fixture   BOOLEAN NOT NULL DEFAULT FALSE;
  -- permanent_fixture=TRUE: appended to every session after solver output; see §7.0.5.

-- ── Exercise relationship graph ────────────────────────────────────────────
-- Encodes ontology graph edges between exercises.
-- SUBSTITUTES and FATIGUES_SAME are bidirectional — insert both directions (A→B and B→A).
-- PROGRESSES_TO / REGRESSES_TO are directed (A→B only).
-- ANTAGONIST is bidirectional — insert both directions.
CREATE TABLE exercise_relationships (
  relationship_id   SERIAL PRIMARY KEY,
  exercise_a_id     INT NOT NULL REFERENCES exercises(exercise_id),
  exercise_b_id     INT NOT NULL REFERENCES exercises(exercise_id),
  relationship_type VARCHAR(30) NOT NULL
    CHECK (relationship_type IN ('SUBSTITUTES','PROGRESSES_TO','REGRESSES_TO','FATIGUES_SAME','ANTAGONIST')),
  notes             TEXT,
  UNIQUE (exercise_a_id, exercise_b_id, relationship_type)
);

-- ── Pattern fatigue ledger ─────────────────────────────────────────────────
-- Per-athlete, per-pattern fatigue load written after each strength session.
-- fatigue_units = sum of (cns_cost + local_fatigue_cost) for all sets in that pattern that session.
-- Residual at query time is computed in-memory by compute_pattern_fatigue_residuals() — not stored.
CREATE TABLE pattern_fatigue_ledger (
  ledger_id     SERIAL PRIMARY KEY,
  user_id       INT  NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  pattern_key   VARCHAR(30) NOT NULL REFERENCES movement_patterns(pattern_key),
  session_date  DATE NOT NULL,
  fatigue_units FLOAT NOT NULL,
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, pattern_key, session_date)
);

-- ── Exercise session log ───────────────────────────────────────────────────
-- Records which exercises the CSP solver selected for each strength session and in what order.
-- constraint_violations_bypassed: populated when user_override bypassed a solver constraint;
-- retained for analytics — lets us detect which constraints users most frequently override.
CREATE TABLE exercise_session_log (
  log_id                        SERIAL PRIMARY KEY,
  user_id                       INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  session_date                  DATE NOT NULL,
  exercise_id                   INT NOT NULL REFERENCES exercises(exercise_id),
  slot_index                    SMALLINT NOT NULL,
  selected_by                   VARCHAR(20) NOT NULL DEFAULT 'csp_solver'
    CHECK (selected_by IN ('csp_solver','user_override')),
  constraint_violations_bypassed TEXT[] DEFAULT '{}',
  UNIQUE (user_id, session_date, slot_index)
);

-- ── Injuries (extended) ───────────────────────────────────────────────────
-- The injuries table already exists in schema.sql. Run this migration to extend it.
ALTER TABLE injuries
  ADD COLUMN IF NOT EXISTS severity            VARCHAR(10)
    CHECK (severity IN ('minor','moderate','severe')),
  ADD COLUMN IF NOT EXISTS affected_activities TEXT[],
  -- e.g. ARRAY['running','cycling']; activities to block while injured
  -- NULL = system infers from injury_type; empty array = no activity blocked (logging only)
  ADD COLUMN IF NOT EXISTS cross_training_ok   BOOLEAN NOT NULL DEFAULT TRUE,
  -- FALSE for severe lower-limb injuries where any weight-bearing is contraindicated
  ADD COLUMN IF NOT EXISTS cleared_by_user     BOOLEAN NOT NULL DEFAULT FALSE,
  -- Set to TRUE when user marks injury resolved; triggers return_to_run protocol
  ADD COLUMN IF NOT EXISTS return_volume_pct   FLOAT;
  -- Starting volume % of pre-injury CTL-implied km on first return week (computed on clearance)

-- ── Plan type catalog ─────────────────────────────────────────────────────
-- Source of truth for supported plan types. Add new sports here — no schema change.
CREATE TABLE plan_types (
  plan_type_key  VARCHAR(50) PRIMARY KEY,
  display_name   VARCHAR(100) NOT NULL,
  sport_category VARCHAR(30)  NOT NULL,
  -- V1 valid: 'endurance_running' | 'strength' | 'hypertrophy'
  -- V2 add:   'triathlon' | 'cycling' | 'swimming' — INSERT only, no schema change
  enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  notes          TEXT
);
-- Seed rows (full seed data in migrations/seed_plan_catalog.sql):
-- marathon, half_marathon, 10k, 5k, trail_50k → sport_category='endurance_running'
-- standalone_strength                          → sport_category='strength'
-- standalone_hypertrophy                       → sport_category='hypertrophy'

-- ── Goal tier parameters ───────────────────────────────────────────────────
-- Maps target finishing time → athlete tier + volume parameters.
-- Adding a new tier (e.g. sub-2:45) = INSERT, no code change.
CREATE TABLE plan_goal_tiers (
  id                        SERIAL PRIMARY KEY,
  plan_type_key             VARCHAR(50) NOT NULL REFERENCES plan_types(plan_type_key),
  tier                      VARCHAR(20) NOT NULL,
  max_time_min              INT,           -- NULL = finish goal / catchall (must be last row per type)
  peak_km_per_week          FLOAT,         -- NULL for non-running types
  plan_total_weeks          INT NOT NULL,
  min_runs_per_week         SMALLINT NOT NULL DEFAULT 4,
  max_runs_per_week         SMALLINT NOT NULL DEFAULT 6,
  quality_sessions_per_week SMALLINT NOT NULL DEFAULT 2,
  mesocycle_weeks           SMALLINT NOT NULL DEFAULT 4,
  -- 4 = standard 3:1 (3 loading + 1 cutback); younger/elite athletes
  -- 3 = compressed 2:1 (2 loading + 1 cutback); older/recreational athletes
  -- [22] TrainingPeaks: mesocycle length should match athlete recovery capacity
  UNIQUE (plan_type_key, tier)
);

-- ── Phase structure per plan type + tier ──────────────────────────────────
-- Defines Base / Build / Peak / Taper fractions and intensity targets.
-- Adding a new event type = INSERT rows. No code change.
CREATE TABLE plan_type_phases (
  id                 SERIAL PRIMARY KEY,
  plan_type_key      VARCHAR(50) NOT NULL REFERENCES plan_types(plan_type_key),
  tier               VARCHAR(20) NOT NULL,
  phase              VARCHAR(10) NOT NULL,
  phase_fraction     FLOAT NOT NULL,   -- fraction of total plan weeks
  easy_pct           FLOAT NOT NULL,   -- minimum Z1–Z2 fraction of total volume
  quality_sessions   SMALLINT NOT NULL,
  strength_phase_key VARCHAR(20),      -- FK to strength_phase_catalog
  UNIQUE (plan_type_key, tier, phase)
);

-- ── Session type catalog ───────────────────────────────────────────────────
-- Defines each session type. The recommendation algorithm is generic — it reads
-- zone, duration, and recovery from here regardless of sport.
-- Adding a new session type (e.g. swim_intervals) = INSERT, no code change.
CREATE TABLE session_type_catalog (
  type_key          VARCHAR(50) PRIMARY KEY,
  display_name      VARCHAR(100) NOT NULL,
  min_zone          SMALLINT NOT NULL,
  max_zone          SMALLINT NOT NULL,
  duration_min_lo   INT NOT NULL,
  duration_min_hi   INT NOT NULL,
  recovery_days     SMALLINT NOT NULL DEFAULT 0,
  max_per_week      SMALLINT NOT NULL DEFAULT 1,
  purpose           TEXT,
  structure_note    TEXT,           -- injected into narrative context
  applicable_phases TEXT[] NOT NULL
);

-- ── Weekly session templates ───────────────────────────────────────────────
-- Maps (plan_type, tier, phase, quality_count, week_parity, day_of_week) → session type.
-- Day-of-week assignments live here, not in application code.
-- Adding a new plan type's weekly schedule = INSERT rows. No code change.
CREATE TABLE plan_session_templates (
  id               SERIAL PRIMARY KEY,
  plan_type_key    VARCHAR(50)  NOT NULL REFERENCES plan_types(plan_type_key),
  tier             VARCHAR(20)  NOT NULL,
  phase            VARCHAR(10)  NOT NULL,
  quality_count    SMALLINT     NOT NULL,
  week_parity      VARCHAR(5)   NOT NULL DEFAULT 'any'
                     CHECK (week_parity IN ('any','odd','even')),
  day_of_week      SMALLINT     NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  session_type_key VARCHAR(50)  NOT NULL REFERENCES session_type_catalog(type_key),
  UNIQUE (plan_type_key, tier, phase, quality_count, week_parity, day_of_week)
);

-- Enforce parity exclusivity: a given (plan_type_key, tier, phase, quality_count,
-- day_of_week) slot must use EITHER 'any' OR the pair ('odd','even') — never both.
-- The UNIQUE constraint above does not catch this because 'any' and 'odd' are distinct
-- values, so both rows would pass uniqueness while the query
--   WHERE week_parity = 'any' OR week_parity = 'odd'
-- would return two rows for the same slot on an odd week.
CREATE OR REPLACE FUNCTION plan_session_templates_parity_check()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.week_parity = 'any' THEN
    IF EXISTS (
      SELECT 1 FROM plan_session_templates
      WHERE plan_type_key  = NEW.plan_type_key
        AND tier           = NEW.tier
        AND phase          = NEW.phase
        AND quality_count  = NEW.quality_count
        AND day_of_week    = NEW.day_of_week
        AND week_parity   IN ('odd', 'even')
        AND id            != COALESCE(NEW.id, -1)
    ) THEN
      RAISE EXCEPTION
        'plan_session_templates parity conflict: cannot insert week_parity=''any'' '
        'when an odd/even row already exists for (%, %, %, %, dow=%)',
        NEW.plan_type_key, NEW.tier, NEW.phase, NEW.quality_count, NEW.day_of_week;
    END IF;
  ELSIF NEW.week_parity IN ('odd', 'even') THEN
    IF EXISTS (
      SELECT 1 FROM plan_session_templates
      WHERE plan_type_key  = NEW.plan_type_key
        AND tier           = NEW.tier
        AND phase          = NEW.phase
        AND quality_count  = NEW.quality_count
        AND day_of_week    = NEW.day_of_week
        AND week_parity    = 'any'
        AND id            != COALESCE(NEW.id, -1)
    ) THEN
      RAISE EXCEPTION
        'plan_session_templates parity conflict: cannot insert week_parity=''%'' '
        'when an ''any'' row already exists for (%, %, %, %, dow=%)',
        NEW.week_parity,
        NEW.plan_type_key, NEW.tier, NEW.phase, NEW.quality_count, NEW.day_of_week;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_plan_session_templates_parity
  BEFORE INSERT OR UPDATE ON plan_session_templates
  FOR EACH ROW EXECUTE FUNCTION plan_session_templates_parity_check();

-- Seeding convention (enforced by trigger above):
-- Use 'any' when a slot's session type does not vary by week number.
-- Use 'odd'/'even' only when alternating (e.g. long run on Sat odd weeks, medium-long on Sat even).
-- Never seed both an 'any' row and an 'odd' or 'even' row for the same slot.

-- ── Strength phase catalog ─────────────────────────────────────────────────
CREATE TABLE strength_phase_catalog (
  phase_key       VARCHAR(20) PRIMARY KEY,   -- 'gpp' | 'spp' | 'power' | 'maintenance'
  display_label   VARCHAR(100),
  sessions_pw     SMALLINT NOT NULL,
  sets_range      VARCHAR(10),
  reps_range      VARCHAR(10),
  load_pct_range  VARCHAR(20),
  plyometrics     BOOLEAN NOT NULL DEFAULT FALSE,
  plyo_note       TEXT,
  scheduling_note TEXT,
  rationale       TEXT
);
-- Seed rows — valid phase_key values and their structural parameters.
-- These four phases map directly to the running periodization phases in §14.4/§14.8.
INSERT INTO strength_phase_catalog
  (phase_key, display_label, sessions_pw, sets_range, reps_range, load_pct_range, plyometrics, scheduling_note, rationale)
VALUES
  ('gpp', 'General Physical Preparation', 2, '3–5', '8–15', '50–70%',
   FALSE,
   'Schedule on non-quality-run days; minimum 24h from running session.',
   'Builds work capacity and connective tissue. Bilateral compound movements, high volume. No plyometrics — joints not yet conditioned.'),
  ('spp', 'Specific Physical Preparation', 2, '3–4', '6–10', '65–80%',
   FALSE,
   'Schedule on non-quality-run days; minimum 24h from threshold or interval sessions.',
   'Transitions to unilateral, running-specific movements. Plyometrics introduced conservatively (box jumps, split jumps) — plyometrics flag FALSE; add as accessory only via strength_phase_exercises entries.'),
  ('power', 'Power / Peak Phase', 2, '2–4', '3–6', '75–90%',
   TRUE,
   'Final strength session ≥ 5 days before A-race. Lower CNS budget than gpp/spp — explosive work is costly.',
   'Low volume, maximal intensity, full plyometrics. Preserves peak neuromuscular sharpness while reducing fatigue accumulation into taper.'),
  ('maintenance', 'In-Season Maintenance', 1, '1–2', '5–8', '70–85%',
   FALSE,
   'One session per week, never within 48h of race or long run.',
   'Neural activation only — two sets sufficient for strength retention. [17] Häkkinen et al. 2004.');

-- Exercises for each strength phase reference the existing exercises table (797 entries).
-- priority: 1 = must-include; 5 = optional given recovery / freshness constraints.
CREATE TABLE strength_phase_exercises (
  id          SERIAL PRIMARY KEY,
  phase_key   VARCHAR(20) NOT NULL REFERENCES strength_phase_catalog(phase_key),
  exercise_id INT NOT NULL REFERENCES exercises(exercise_id),
  priority    SMALLINT NOT NULL DEFAULT 5,
  notes       TEXT,
  UNIQUE (phase_key, exercise_id)
);

-- ── Training plan instances ────────────────────────────────────────────────
-- One active plan per user (partial unique index). Historical plans preserved.
CREATE TABLE training_plans (
  plan_id         SERIAL PRIMARY KEY,
  user_id         INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  competition_id  INT REFERENCES competitions(competition_id) ON DELETE SET NULL,
  plan_type_key   VARCHAR(50) NOT NULL REFERENCES plan_types(plan_type_key),
  tier            VARCHAR(20),
  target_time_min INT,
  plan_start_date DATE NOT NULL,
  race_date       DATE,
  peak_volume_km  FLOAT,
  weakness_focus  TEXT[],    -- e.g. ARRAY['threshold','hills']; shifts quality type priority in base phase
  plan_mode       VARCHAR(20) NOT NULL DEFAULT 'race_anchored'
                    CHECK (plan_mode IN ('race_anchored','open_ended')),
  -- race_anchored: base→build→peak→taper anchored to competition_id.race_date
  -- open_ended: rolling base→build mesocycle, no peak/taper, no race anchor
  training_state  VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (training_state IN ('active','injured','cross_training','return_to_run')),
  status          VARCHAR(10) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','completed','abandoned')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX training_plans_one_active_per_user
  ON training_plans (user_id) WHERE status = 'active';

CREATE TABLE training_plan_weeks (
  week_id            SERIAL PRIMARY KEY,
  plan_id            INT NOT NULL REFERENCES training_plans(plan_id) ON DELETE CASCADE,
  week_number        INT NOT NULL,
  week_start_date    DATE NOT NULL,
  week_end_date      DATE NOT NULL,
  phase              VARCHAR(10) NOT NULL,
  target_volume_km   FLOAT,
  easy_pct           FLOAT,
  quality_sessions   SMALLINT NOT NULL,
  long_run_km        FLOAT,
  strength_sessions  SMALLINT NOT NULL DEFAULT 2,
  strength_phase_key VARCHAR(20) REFERENCES strength_phase_catalog(phase_key),
  cutback_week       BOOLEAN NOT NULL DEFAULT FALSE,
  status             VARCHAR(10) NOT NULL DEFAULT 'scheduled'
                       CHECK (status IN ('scheduled','active','completed','skipped')),
  notes              TEXT,
  UNIQUE (plan_id, week_number)
);

-- ── Strength goal per training plan ───────────────────────────────────────
-- Drives exercise selection, CNS budget, and loading in §7.0.
-- DEFAULT 'sport_support': safest default for a concurrent athlete — minimal CNS
-- interference with endurance training.
ALTER TABLE training_plans
  ADD COLUMN IF NOT EXISTS strength_goal VARCHAR(20) NOT NULL DEFAULT 'sport_support'
    CHECK (strength_goal IN ('strength','hypertrophy','sport_support','combination')),
  ADD COLUMN IF NOT EXISTS goal_weights  JSONB;
  -- Required when strength_goal = 'combination'.
  -- Shape: {"strength": 0.4, "hypertrophy": 0.3, "sport_support": 0.3}
  -- Values must sum to 1.0 ± 0.01. Keys must be subset of {'strength','hypertrophy','sport_support'}.
  -- Validated at plan creation endpoint. NULL when strength_goal != 'combination'.
  -- NEVER read goal_weights without first checking strength_goal == 'combination'.
```

---

## 3. Signal Computation

### 3.1 Signal registry

Every signal has a defined **source**, **compute trigger**, **storage**, and **null rule**.

| Signal | Source table / col | Computed by | Stored in | Trigger | Null when |
|--------|-------------------|-------------|-----------|---------|-----------|
| `trimp` | `workouts.avg_hr`, `.duration_min` | `compute_trimp()` | `workouts.trimp` | Post Garmin sync | No HR data |
| `atl` | `workouts.trimp` | `compute_load_metrics()` | `training_load_daily` | Post sync | < 3 sessions |
| `ctl` | `workouts.trimp` | same | `training_load_daily` | Post sync | < 3 sessions |
| `tsb` | derived | same | `training_load_daily` | Post sync | CTL null |
| `acwr` | derived | same | `training_load_daily` | Post sync | CTL < 1 |
| `ramp_rate` | derived | same | `training_load_daily` | Post sync | < 14 days data |
| `hrv_z` | `sleep_sessions.overnight_hrv` | `compute_hrv_status()` | In-memory at request | Request time | < 14 HRV readings |
| `sleep_readiness` | `sleep_sessions` | `compute_sleep_readiness()` | In-memory at request | Request time | No sleep data today |
| `muscle_freshness` | `strength_sets` | `muscle_freshness_map()` | In-memory at request | Request time | No sets in 14 days |
| `biomechanics_fatigue_index` | `workout_metrics` | `compute_fatigue_index()` | `workouts.fatigue_index` | Post sync (if metrics present) | No baseline for terrain |
| `terrain_type` | `workout_metrics.gradient_pct` | `classify_terrain()` | `workouts.terrain_type` | Post sync | < 10 gradient readings |
| `zone_speeds` | `workouts`, `workout_metrics` | `compute_zone_speeds()` | `user_profile.zone_speeds` | Monthly cron | < 5 qualifying runs per zone |
| `max_hr` | `workout_metrics.heart_rate` | `compute_max_hr()` | `user_profile.max_hr` | Quarterly cron | < 90 days running records |
| `estimated_1rm` | `strength_sets` | `epley_1rm()` | `user_1rm_cache` | Post new set insert | No sets with reps ≤ 10 |
| `hr_rpe_ratio` | `workouts.avg_hr`, `workout_reflection.session_rpe` | `compute_hr_rpe_ratio()` | In-memory at request | Request time | < 10 same-sport sessions |
| `cycle_phase` | `menstrual_cycles` | `estimate_cycle_phase()` | In-memory at request | Request time | No record < 60 days old |
| `hr_stability_last_10min` | `workout_metrics.heart_rate` | `compute_hr_stability()` | `workouts.hr_stability_last_10min` | Post Garmin sync | < 10 HR readings in final 10 min |
| `pattern_fatigue_residuals` | `pattern_fatigue_ledger` | `compute_pattern_fatigue_residuals()` | In-memory at request | Request time | No ledger rows in past 7 days (returns all-zero residuals — solver still runs) |
| `exercise_history_recency` | `exercise_session_log` | `compute_exercise_recency()` | In-memory at request | Request time | No session log rows (all exercises treated as equally fresh) |

**`hr_stability_last_10min` computation:** Post-sync job. Slice `workout_metrics` rows for the final 10 minutes of each session; compute the coefficient of variation (CV) of `heart_rate` values in that slice. CV < 0.05 (< 5%) indicates a stable steady-state HR — used by `compute_zone_speeds()` to filter out intervals and surges that would distort zone speed calibration.

```python
def compute_hr_stability(hr_series: list[int]) -> float | None:
    # hr_series: heart_rate values from final 10 min of session, chronological
    if len(hr_series) < 10:
        return None
    mean_hr = mean(hr_series)
    return stdev(hr_series) / mean_hr if mean_hr > 0 else None
```

Add column `hr_stability_last_10min FLOAT` to `workouts` via migration.

**Relationship between `muscle_freshness` and `pattern_fatigue_residuals`:** These signals track strength fatigue through different mechanisms and serve distinct purposes — neither is deprecated. `muscle_freshness` (§3.6) operates at muscle-group level, computed directly from raw `strength_sets` volume (weight × reps × sets × involvement), available from day 1 with no ledger dependency. It drives the dashboard freshness heatmap and provides a cold-start approximation when the pattern ledger is thin. `pattern_fatigue_residuals` (§7.0.2) operates at movement-pattern level, uses CNS-weighted cost units (`cns_cost + local_fatigue_cost`), and requires `pattern_fatigue_ledger` rows written by `update_pattern_fatigue_ledger()` post-session. The CSP solver (§7.0.4) uses `pattern_fatigue_residuals` as its primary fatigue signal. **Cold-start rule (HEURISTIC):** when `pattern_fatigue_ledger` has fewer than **5 session entries** for a given pattern, the solver approximates the residual from `muscle_freshness` by mapping the pattern's primary muscle groups to their freshness scores: `residual_approx = (1 − mean(freshness[primary_muscles])) × 3.0`. Above 5 sessions, `muscle_freshness` is used only for the dashboard heatmap and is not fed into the solver.

---

### 3.2 TRIMP

```python
def compute_trimp(
    duration_min: float,
    avg_hr:       float,
    resting_hr:   float,   # 7-day median of sleep_sessions.min_hr
    max_hr:       float,   # user_profile.max_hr
    sex:          str,     # 'male' | 'female' | 'prefer_not_to_say'
) -> float:
    HRr = (avg_hr - resting_hr) / (max_hr - resting_hr)
    HRr = max(0.0, min(1.0, HRr))
    k, y = (0.86, 1.67) if sex == 'female' else (0.64, 1.92)
    return duration_min * HRr * k * exp(y * HRr)
# [1] Banister 1991 — sex-specific coefficients
```

Store in `workouts.trimp` (add column via migration if absent).

---

### 3.3 ATL / CTL / TSB / ACWR

```python
def compute_load_metrics(
    trimp_series: list[tuple[date, float]],   # (date, trimp), sorted asc, last 90 days
    today:        date,
) -> dict:
    TAU_ATL, TAU_CTL = 7.0, 42.0
    atl = ctl = 0.0
    prev = trimp_series[0][0] if trimp_series else today

    for session_date, trimp in trimp_series:
        gap  = (session_date - prev).days
        atl  = atl * exp(-gap / TAU_ATL) + trimp * (1 - exp(-1 / TAU_ATL))
        ctl  = ctl * exp(-gap / TAU_CTL) + trimp * (1 - exp(-1 / TAU_CTL))
        prev = session_date

    tsb  = ctl - atl
    acwr = round(atl / ctl, 3) if ctl >= 1.0 else None

    ctl_7d = _ctl_at_offset(trimp_series, today, days=7)
    ramp   = ((ctl - ctl_7d) / max(ctl_7d, 1.0)) * 100 if ctl_7d is not None else None

    return {'atl': atl, 'ctl': ctl, 'tsb': tsb, 'acwr': acwr, 'ramp_rate': ramp}
# [2] Morton et al. 1990; [3] Clarke & Skiba 2012
```

**ACWR thresholds** — used by safety gates:

| `acwr` | Label | Gate action |
|--------|-------|-------------|
| `None` | no_data | Skip gate |
| < 0.8 | under_training | Flag only |
| 0.8 – 1.3 | optimal | None |
| 1.3 – 1.5 | caution | Gate 2 fires |
| > 1.5 | danger | Gate 1 fires |
| > 1.8 | critical | Gate 0 fires |

**Ramp rate threshold:** > 10 %/week → caution; > 15 %/week → volume cap gate fires.
`[4] Soligard et al. 2016`

---

### 3.4 HRV Status

**Design principle:** the baseline is per-athlete and stored, not computed from a rolling
window. A rolling window derived from the current series is contaminated by the training
stress it is trying to measure — suppressed HRV during a heavy block shifts the mean down,
making genuinely bad days appear normal.

**Baseline construction:** only readings that follow a rest day or low-load session are
included. This allows continuous accumulation across the training year without requiring a
dedicated baseline week. A reading is "clean" when the preceding day's TRIMP is `None`
(rest day) or `≤ easy_threshold` (≈ 60–70 min Z2). Hard sessions and their next-day
suppressed readings are excluded, so the stored baseline reflects true resting HRV, not
training-stressed HRV.

```python
def establish_hrv_baseline(
    hrv_series:      list[float],
    preceding_trimp: list[float | None],  # None = rest day; aligned 1:1 with hrv_series
    easy_threshold:  float = 50.0,        # ≈ 60–70 min easy Z2
    min_clean:       int   = 14,
) -> tuple[float, float] | None:
    """
    Compute personal HRV baseline from clean (post-rest/easy) readings only.

    Accumulates continuously across the training year — no dedicated baseline week needed.
    Stores (mean, sd) → user_profile.hrv_baseline_mean / hrv_baseline_sd.
    Returns None if fewer than min_clean readings qualify, or if sd < 0.5 ms.
    """
    if len(hrv_series) != len(preceding_trimp):
        return None
    clean = [h for h, t in zip(hrv_series, preceding_trimp)
             if t is None or t <= easy_threshold]
    if len(clean) < min_clean:
        return None
    m, s = mean(clean), stdev(clean)
    return (round(m, 2), round(s, 2)) if s >= 0.5 else None


def compute_hrv_status(
    hrv_series:    list[float],   # overnight_hrv sorted asc by date, most recent last
    personal_mean: float,          # user_profile.hrv_baseline_mean
    personal_sd:   float,          # user_profile.hrv_baseline_sd
) -> dict:
    """
    Compares today's HRV against the stored per-athlete baseline.
    Returns 'no_data' when personal_sd < 0.5 (baseline not established).
    """
    if len(hrv_series) < 2 or personal_sd < 0.5:
        return {'status': 'no_data', 'z': None, 'consecutive_suppressed': 0}

    z      = (hrv_series[-1] - personal_mean) / personal_sd
    consec = sum(1 for _ in takewhile(
        lambda v: (v - personal_mean) / personal_sd < -1.0,
        reversed(hrv_series[:-1])
    ))

    status = ('elevated'       if z >  1.0 else
              'normal'         if z > -1.0 else
              'suppressed'     if z > -1.5 else
              'very_suppressed')

    return {'status': status, 'z': round(z, 2), 'consecutive_suppressed': consec}
# [5] Plews et al. 2012; [6] Kiviniemi et al. 2007
```

**Signal assembly:** `build_recommendation()` calls `compute_hrv_status(hrv_series,
personal_mean, personal_sd)` at step 0 and injects the result into the signals dict before
any gate or readiness logic runs. Callers pass `hrv_series`, `personal_hrv_mean`, and
`personal_hrv_sd`; they do not pre-compute `hrv_status`.

---

### 3.5 Sleep Readiness

**Do not use regression.** Notebook 06 finding: Ridge R² = −0.009 (sleep metrics do not
linearly predict next-day HRV z-score).

```python
def compute_sleep_readiness(
    sleep_score:      int   | None,   # sleep_sessions.sleep_score
    hrv_z:            float | None,   # from compute_hrv_status()
    body_battery:     int   | None,   # sleep_sessions.body_battery_change_during_sleep
    sleep_duration_h: float | None,   # sleep_sessions.total_sleep_seconds / 3600
) -> str:   # 'high' | 'moderate' | 'low' | 'no_data'

    available = [x for x in [sleep_score, hrv_z, body_battery] if x is not None]
    if not available:
        return 'no_data'

    score = 0
    if sleep_score      is not None: score += (2 if sleep_score  >= 75 else 1 if sleep_score  >= 55 else 0)
    if hrv_z            is not None: score += (2 if hrv_z        >  0.0 else 1 if hrv_z        > -1.0 else 0)
    if body_battery     is not None: score += (2 if body_battery >= 60  else 1 if body_battery >= 35  else 0)
    if sleep_duration_h is not None: score += (1 if sleep_duration_h >= 7.5 else -1 if sleep_duration_h < 6.0 else 0)

    max_score = 2 * len(available) + (1 if sleep_duration_h is not None else 0)
    ratio     = score / max(max_score, 1)
    result    = 'high' if ratio >= 0.60 else 'moderate' if ratio >= 0.30 else 'low'

    # Hard cap: < 6h sleep cannot produce 'high' readiness regardless of other signals.
    # The -1 ratio penalty alone is insufficient when sleep_score, hrv_z, and body_battery
    # are all excellent (e.g. a 5h night with score=80, HRV up, battery=70 → ratio=0.71).
    # Short sleep fundamentally limits cognitive and physical recovery capacity.
    if sleep_duration_h is not None and sleep_duration_h < 6.0 and result == 'high':
        result = 'moderate'
    return result
```

---

### 3.6 Muscle Freshness

**Decay constants — initial defaults, then personalised.**

```python
# Cold-start defaults: hours for fatigue to decay to 1/e of initial load.
# Source: Willardson 2006 (48–72h lower body, 24–48h upper body); Häkkinen et al. 1988.
# Treat as priors, not ground truth. Personalised after ≥ 5 load_feel observations.
DECAY_DEFAULTS_H: dict[str, float] = {
    'quads': 60, 'hamstrings': 72, 'glutes': 60, 'calves': 48,
    'chest': 48, 'back': 48, 'shoulders': 36,
    'biceps': 36, 'triceps': 36, 'core': 24, 'forearms': 24,
}

def personalise_decay(muscle: str, load_feel_history: list[dict]) -> float:
    """
    Adjusts τ ± 30% from default based on load_feel the day after training
    that muscle group. Requires ≥ 5 relevant observations.
    """
    default   = DECAY_DEFAULTS_H.get(muscle, 48)
    relevant  = [r for r in load_feel_history if r['muscle_group'] == muscle]
    if len(relevant) < 5:
        return default
    avg_feel  = mean(r['load_feel'] for r in relevant)
    factor    = max(0.70, min(1.30, 1.0 - avg_feel * 0.10))
    return default * factor

def muscle_freshness_map(
    strength_sets:     list,      # last 14 days of strength_sets rows
    now:               datetime,
    load_feel_history: list[dict],
    rolling_max:       dict[str, float],   # per-muscle max fatigue over last 30 days
) -> dict[str, float]:            # muscle → freshness [0.0, 1.0]
    fatigue = {m: 0.0 for m in DECAY_DEFAULTS_H}
    for s in strength_sets:
        hours_ago = (now - s.performed_at).total_seconds() / 3600
        for muscle, involvement in s.muscles.items():   # from exercises table
            tau            = personalise_decay(muscle, load_feel_history)
            session_load   = s.sets * s.reps * s.weight_kg * involvement
            fatigue[muscle] += session_load * exp(-hours_ago / tau)
    return {
        m: round(max(0.0, 1.0 - fatigue[m] / max(rolling_max.get(m, 1.0), 1.0)), 3)
        for m in fatigue
    }
```

**`rolling_max` computation:** Computed in-request, not stored. For each muscle group, iterate all `strength_sets` in the 30-day look-back window and compute peak accumulated fatigue (the same exponential decay sum, but take the per-day maximum across the window rather than only today's value). This normalises freshness to the athlete's own peak load, preventing the score from reading 0.0 on a low-volume week simply because the current raw fatigue is low.

```python
def compute_rolling_max(
    strength_sets:     list,
    load_feel_history: list[dict],
    window_days:       int = 30,
) -> dict[str, float]:
    now = datetime.utcnow()
    cutoff = now - timedelta(days=window_days)
    peak: dict[str, float] = {}
    # Sample one snapshot per day in the window
    for day_offset in range(window_days):
        snap_time = now - timedelta(days=day_offset)
        snap_sets = [s for s in strength_sets if s.performed_at <= snap_time
                     and s.performed_at >= cutoff]
        snap = muscle_freshness_map(snap_sets, snap_time, load_feel_history,
                                     rolling_max={m: 1.0 for m in DECAY_DEFAULTS_H})
        for m, freshness in snap.items():
            raw_fatigue = 1.0 - freshness   # freshness = 1 - fatigue/max → raw ≈ fatigue
            peak[m] = max(peak.get(m, 0.0), raw_fatigue)
    return peak
```

> **REFACTOR FLAG:** `compute_rolling_max` recovers raw accumulated fatigue by passing `rolling_max=1.0` to `muscle_freshness_map` and inverting the result. With `rolling_max=1.0` the freshness formula reduces to `1 - fatigue / 1.0 = 1 - fatigue`, so the inversion `1.0 - freshness` gives back fatigue exactly — the `≈` in the comment should be `=`. The round-trip is mathematically correct but genuinely confusing: a reader has to trace through the algebra to see it's not circular.
>
> **Recommended fix:** extract `compute_raw_muscle_fatigue(sets, snap_time, load_feel_history) -> dict[str, float]` containing only the decay accumulation loop (lines currently inside `muscle_freshness_map` before the normalisation step). Both `muscle_freshness_map` and `compute_rolling_max` call this helper. `muscle_freshness_map` divides by `rolling_max`; `compute_rolling_max` takes the per-day maximum directly. The intent becomes obvious without algebra.
>
> Priority: low — correctness is not in question. Do it when next touching the muscle fatigue module, not as a standalone task.

Freshness < 0.4 → block that muscle group from heavy loading (> 80% 1RM).

---

### 3.7 Terrain Classification

```python
def classify_terrain(gradient_series: list[float]) -> str:
    # gradient_series: workout_metrics.gradient_pct values for the session
    if len(gradient_series) < 10:
        return 'unknown'
    pct_graded  = sum(1 for g in gradient_series if abs(g) > 3) / len(gradient_series)
    grad_range  = max(gradient_series) - min(gradient_series)
    return 'trail' if (pct_graded > 0.25 or grad_range > 15) else 'road'
```

Store in `workouts.terrain_type` (VARCHAR(10), add via migration).
**Biomechanics anomaly detection is always terrain-stratified. Pooling road and trail
produces false-positive fatigue flags.** (Confirmed in notebooks 01–04: trail increases
GCT +12–18%, reduces cadence −8–12 spm vs road at identical HR effort.)

---

### 3.8 Biomechanics Fatigue Index

Computed post-sync. Requires `biomechanics_baselines` row for the athlete and terrain.
Store result in `workouts.fatigue_index` (FLOAT, nullable; add via migration).

```python
def compute_fatigue_index(
    records_df: DataFrame,   # workout_metrics for this session:
                             #   columns: distance_km, stance_time_ms,
                             #            cadence_rpm, vertical_ratio
    baseline:   Row | None,  # biomechanics_baselines row (terrain-matched)
) -> tuple[float | None, dict]:

    if baseline is None or len(records_df) < 20:
        return None, {}

    # Stance time drift — most sensitive signal (notebook finding)
    slope, *_ = linregress(records_df.distance_km, records_df.stance_time_ms)
    stance_drift = slope / max(baseline.gct_mean_ms, 1)   # normalised

    # Cadence CV: second half vs first half
    n    = len(records_df)
    cv1  = records_df[:n//2].cadence_rpm.std() / max(records_df[:n//2].cadence_rpm.mean(), 1)
    cv2  = records_df[n//2:].cadence_rpm.std() / max(records_df[n//2:].cadence_rpm.mean(), 1)
    cv_r = cv2 / max(cv1, 0.001)

    # Vertical ratio deviation from personal baseline
    vr_z = ((records_df.vertical_ratio.mean() - baseline.vertical_ratio_mean)
            / max(baseline.vertical_ratio_sd, 0.001))

    # Weighted composite (stance drift most sensitive → highest weight)
    index = abs(stance_drift) * 0.50 + (cv_r - 1.0) * 0.30 + abs(vr_z) * 0.20
    return round(index, 3), {
        'stance_drift': round(stance_drift, 4),
        'cadence_cv_ratio': round(cv_r, 3),
        'vertical_ratio_z': round(vr_z, 3),
    }
```

**Fatigue index → next-session running modifier:**

| `fatigue_index` | Next-session modifier |
|-----------------|-----------------------|
| `None` | None (no baseline) |
| < 0.5 | None |
| 0.5 – 1.0 | `duration_min × 0.90` |
| 1.0 – 1.5 | `duration_min × 0.80`; cap zone at Z2 |
| > 1.5 | `duration_min × 0.75`; cap zone at Z2; add biomechanics alert |

---

### 3.9 MAX_HR

```python
def compute_max_hr(
    run_records_hr: list[float],   # all heart_rate values from running workout_metrics
    age:            int,           # from date_of_birth
) -> tuple[int, str]:             # (max_hr, source)
    formula_hr = round(211 - 0.64 * age)   # Tanaka et al. 2001
    if len(run_records_hr) < 500:           # < ~90 days of running data
        return formula_hr, 'tanaka_formula'
    data_hr = int(percentile(run_records_hr, 99))
    if data_hr >= formula_hr - 10:
        return data_hr, 'data_99th_pct'
    return formula_hr, 'tanaka_formula'
# Notebook finding: Tanaka overestimates for trained runners in our dataset.
# Data-driven estimate preferred when ≥ 90 days of records are available.
```

---

### 3.10 Zone Speeds

```python
def compute_zone_speeds(
    workouts:      list,   # workouts with avg_hr, avg_speed, terrain_type
    user_max_hr:   int,
    terrain:       str,    # 'road' | 'trail'
    min_runs:      int = 5,
) -> dict:   # {'z1':'6:30–7:30', 'z2':'5:45–6:30', ...} or {}

    zone_speeds = {z: [] for z in range(1, 6)}
    for w in workouts:
        if w.terrain_type != terrain or w.avg_speed is None:
            continue
        z = hr_to_zone(w.avg_hr, user_max_hr)
        if w.hr_stability_last_10min < 0.05:          # stable-HR condition
            zone_speeds[z].append(w.avg_speed)

    result = {}
    for z, speeds in zone_speeds.items():
        if len(speeds) >= min_runs:
            lo = ms_to_pace(percentile(speeds, 25))   # slower end
            hi = ms_to_pace(percentile(speeds, 75))   # faster end
            result[f'z{z}'] = f'{hi}–{lo}'
    return result
```

Stored per terrain in `user_profile.zone_speeds`. Recompute monthly or after `max_hr` update.

---

### 3.11 1RM Estimation

```python
def epley_1rm(weight_kg: float, reps: int) -> float | None:
    if not (1 <= reps <= 10):
        return None
    return weight_kg if reps == 1 else weight_kg * (1 + reps / 30)

def get_best_1rm(exercise_id: int, user_id: int, strength_sets: list) -> float | None:
    estimates = [
        epley_1rm(s.weight_kg, s.reps)
        for s in strength_sets
        if s.exercise_id == exercise_id and s.reps <= 10 and s.weight_kg > 0
    ]
    estimates = [e for e in estimates if e is not None]
    return max(estimates, default=None)
```

Cache result in `user_1rm_cache`. Invalidate on any new `strength_sets` insert for that
`(user_id, exercise_id)`.

---

### 3.12 HR:RPE Dissociation

```python
def compute_hr_rpe_ratio(
    avg_hr:           float,
    session_rpe:      int,
    baseline_ratios:  list[float],   # last 30 sessions of same sport (avg_hr / session_rpe)
) -> dict:
    if session_rpe <= 0 or len(baseline_ratios) < 10:
        return {'status': 'no_data', 'z': None}
    ratio  = avg_hr / session_rpe
    mean_b, sd_b = mean(baseline_ratios), std(baseline_ratios)
    if sd_b < 0.1:
        return {'status': 'no_data', 'z': None}
    z = (ratio - mean_b) / sd_b
    return {
        'status': ('rpe_elevated' if z < -1.5 else   # HR low, RPE high → fatigue
                   'hr_elevated'  if z >  1.5 else   # HR high, RPE low → illness/heat
                   'normal'),
        'z': round(z, 2),
    }
# [7] Halson 2014 — dissociation between internal and external load signals overreaching
```

---

### 3.13 Cycle Phase Estimation (female athletes only)

```python
def estimate_cycle_phase(
    latest_cycle: dict | None,   # most recent menstrual_cycles row
    today:        date,
) -> str | None:
    # Returns None when: no data, hormonal_contraception is None, or record > 60 days old.
    # NEVER assume phase. Apply zero modifiers when phase is None.
    if latest_cycle is None:
        return None
    if (today - latest_cycle['start_date']).days > 60:
        return None
    cycle_len = latest_cycle.get('predicted_cycle_length') or 28
    day       = (today - latest_cycle['start_date']).days + 1
    if   day <= 5:                          return 'menstruation'
    elif day <= round(cycle_len * 0.46):    return 'follicular'
    elif day <= round(cycle_len * 0.57):    return 'ovulation'
    elif day <= round(cycle_len * 0.82):    return 'early_luteal'
    else:                                   return 'late_luteal'

def cycle_modifier_scale(hormonal_contraception: bool | None) -> float:
    return {True: 0.5, False: 1.0, None: 0.0}[hormonal_contraception]
# None → no modifiers. NEVER default to 1.0 without explicit user data.
# Combined OCP attenuates phase effects → 0.5 scale. [8] Sims & Heather 2018.
# hormonal_contraception sourced from:
#   (1) Garmin export: DI_CONNECT/DI-Connect-Wellness/*_MenstrualCycles.json .hormonalContraception
#   (2) Onboarding form (shown only when sex == 'female')
#   (3) Default: NULL → scale = 0.0
```

---

## 4. Safety Gates

Execute **in order** before any session selection logic.
First gate that fires wins. Return value shape is fixed — see §9 output contract.

```python
def _gate(
    gate_id:           str,
    force_sport:       str | None,    # None = no sport override (engine picks)
    alert_tier:        str,           # populates alerts[].tier in output contract
    message:           str,           # populates alerts[].message
    *,
    blocks:            bool  = False, # True → blocks all intensity escalation today
    max_zone:          int   = 5,     # zone cap applied to recommendation.zone
    max_strength_pct:  float = 1.0,   # cap on strength load as fraction of prescribed
    volume_cap_pct:    float | None = None,  # cap on duration_min (% of planned)
    volume_multiplier: float | None = None,  # applied to duration_min if set
    no_strength:       bool  = False, # True → strength_block.include = False
    disclaimer:        bool  = False, # True → disclaimer string emitted in output
) -> dict:
    return {
        'gate_id':          gate_id,
        'force_sport':      force_sport,
        'alert_tier':       alert_tier,
        'message':          message,
        'blocks':           blocks,
        'max_zone':         max_zone,
        'max_strength_pct': max_strength_pct,
        'volume_cap_pct':   volume_cap_pct,
        'volume_multiplier':volume_multiplier,
        'no_strength':      no_strength,
        'disclaimer':       disclaimer,
    }
```

`_gate()` return dict is consumed by `build_recommendation()`: `force_sport` overrides session selection; `max_zone` caps `recommendation.zone`; `blocks=True` prevents any quality session suggestion; `disclaimer=True` populates `Recommendation.disclaimer` with a standard safety message.

```python
def apply_safety_gates(s: dict) -> dict | None:
    """
    s: all signals dict (acwr, ramp_rate, hrv_status, readiness_scores, etc.)
    Returns gate_result or None.
    """
    acwr    = s.get('acwr')
    consec  = s.get('hrv_consecutive_suppressed', 0)
    ramp    = s.get('ramp_rate')
    joint   = s.get('readiness_scores', {}).get('joint_feel', 5)
    overall = s.get('readiness_scores', {}).get('overall_feel', 5)
    comp_d  = s.get('days_to_competition')
    comp_p  = s.get('competition_priority')

    # Gate 0 — ACWR critical                                     [4] Soligard 2016
    if acwr is not None and acwr > 1.8:
        return _gate('acwr_critical', 'rest', 'non_functional_overreaching_risk',
            "Acute load is >80% above chronic base. Rest or Z1 only. "
            "Continuing hard training at this ratio significantly increases injury risk.",
            disclaimer=True, blocks=True)

    # Gate 1 — ACWR danger                                       [4] Soligard 2016
    if acwr is not None and acwr > 1.5:
        return _gate('acwr_danger', None, 'overreaching_caution',
            "Load ceiling reached. No intensity escalation today.",
            max_zone=2, max_strength_pct=0.70, blocks=False)

    # Gate 2 — HRV 5-day consecutive suppression                 [9] Meeusen 2012
    if consec >= 5:
        return _gate('hrv_5d_suppressed', 'rest', 'consult_professional',
            "HRV suppressed 5+ consecutive days. Rest today. "
            "Persistent suppression may indicate illness or non-functional overreaching. "
            "Consider consulting a healthcare provider.",
            disclaimer=True, blocks=True)

    # Gate 3 — Ramp rate                                         [4] Soligard 2016
    if ramp is not None and ramp > 15:
        return _gate('ramp_rate_exceeded', None, 'ramp_rate_exceeded',
            f"CTL increased {ramp:.0f}% this week. Volume capped at last week's level.",
            volume_cap_pct=100, blocks=False)

    # Gate 4 — Pre-competition taper                             [10] Weldon 2021
    if comp_d is not None and comp_p == 'A':
        if comp_d <= 2:
            return _gate('pre_comp_48h', None, 'taper',
                "A-race in 48h. No strength training. Z1–Z2 run only.",
                max_zone=2, no_strength=True, blocks=False)
        if comp_d <= 7:
            return _gate('pre_comp_week', None, 'taper',
                f"A-race in {comp_d} days. Volume at 60%.",
                volume_multiplier=0.60, blocks=False)

    # Gate 5 — Injury / joint signal
    if joint <= 2 or overall == 1:
        return _gate('injury_signal', 'mobility', 'injury_flag',
            "Joint discomfort flagged. High-impact activity not recommended. "
            "If pain persists, consult a physiotherapist.",
            disclaimer=True, blocks=True)

    return None   # no gate fired
```

**Overtraining severity tiers** (used in alert labels): `[9] Meeusen et al. 2012`

| Tier | Signals | Label |
|------|---------|-------|
| Acute fatigue | ACWR 1.3–1.5 + HRV z < −1.0 | `acute_fatigue` |
| Functional OR | ACWR > 1.5 + 2–3 suppressed days | `functional_overreaching` |
| Non-functional OR | ACWR > 1.8 + 5+ suppressed days | `non_functional_overreaching` |
| OTS risk | All above + HR:RPE dissociation | `overtraining_syndrome_risk` → mandatory disclaimer |

---

## 5. Session Selection Logic

### 5.1 Readiness aggregation

> **Scale:** `daily_readiness` fields (`overall_feel`, `legs_feel`, `upper_feel`) are stored
> on a **1–10 scale** in the DB. The formula uses 5.5 as the neutral midpoint and a
> coefficient of 0.35 so the subjective contribution spans −2…+2 — identical range to the
> old 1–5 formula. Mapping: {1–2 → −2, 3–4 → −1, 5–6 → 0, 7–8 → +1, 9–10 → +2}.

```python
def aggregate_readiness(
    hrv_status:       str,           # from compute_hrv_status()
    sleep_readiness:  str,           # from compute_sleep_readiness()
    daily_readiness:  dict | None,   # daily_readiness row — 1–10 scale DB values
    tsb:              float | None,
) -> str:   # 'peak' | 'good' | 'moderate' | 'low' | 'rest'

    score = 0
    score += {'elevated':4,'normal':2,'suppressed':0,'very_suppressed':-2,'no_data':1}[hrv_status]
    score += {'high':2,'moderate':1,'low':-1,'no_data':0}[sleep_readiness]

    if daily_readiness:
        # 1–10 scale; 5.5 = neutral midpoint; coefficient 0.35 → range −2…+2
        subj = mean([daily_readiness.get('overall_feel', 5.5),
                     daily_readiness.get('legs_feel',    5.5),
                     daily_readiness.get('upper_feel',   5.5)])
        score += round((subj - 5.5) * 0.35)

    if tsb is not None:
        score += (1 if tsb > 15 else -1 if tsb < -20 else 0)

    return ('peak' if score>=5 else 'good' if score>=2 else
            'moderate' if score>=0 else 'low' if score>=-2 else 'rest')
```

### 5.2 Session type decision matrix

| Readiness | TSB | → Session type |
|-----------|-----|----------------|
| peak | > 5 | Quality: intervals / threshold / heavy strength |
| good | ≥ −5 | Moderate: tempo / aerobic / moderate strength |
| good | < −5 | Aerobic base + light strength maintenance |
| moderate | any | Z2 + light strength only |
| low | any | Z1 active recovery or rest |
| rest | any | Rest |

### 5.3 Concurrent training rules

**Replace existing date-only `yesterday` check with timestamp-based logic.**
Schumann et al. 2022: interference is within-session (3h window), not next-day.

```python
def build_concurrent_blocks(
    todays_sessions:    list[dict],   # sessions with start_time (datetime) logged today
    yesterdays_session: dict | None,
    goal:               str,
) -> dict[str, str]:   # {sport_or_type → reason_str}

    blocks = {}
    now    = datetime.utcnow()

    for s in todays_sessions:
        h_ago = (now - s['start_time']).total_seconds() / 3600
        if s['sport'] in ('running','cycling','swimming','trail_run'):
            if h_ago < 3.0 and goal in ('athlete','strength'):
                blocks['gym_power'] = (
                    f"Aerobic session {h_ago:.1f}h ago — explosive strength "
                    "attenuated within 3h. Substitute: hypertrophy or endurance work."
                )
            # > 3h: interference resolved [11] Schumann 2022

    if yesterdays_session:
        yt = yesterdays_session.get('session_type')
        if yt == 'lower':
            blocks['run']       = "Lower gym yesterday — leg recovery priority"
            blocks['trail_run'] = "Lower gym yesterday — leg recovery priority"
            blocks['gym_lower'] = "Lower session yesterday — 48h required between lower sessions"
        if yt == 'upper':
            blocks['climb']     = "Upper gym yesterday — shoulder/elbow recovery"
            blocks['gym_upper'] = "Upper session yesterday — 48h required between upper sessions"

    return blocks
```

**Why two different time granularities are intentional:**

The 3h same-session rule (`todays_sessions` check) targets the acute within-session interference window identified by Schumann et al. `[11]` — neuromuscular substrate competition that resolves within hours. Timestamp precision is required here because the gap matters: 1h vs 4h produces a qualitatively different interference outcome.

The `yesterdays_session` check targets muscle group recovery, not substrate competition. A 14h gap and a 20h gap both land in the same physiological window for lower-body strength (48h minimum recovery `[21]`). Timestamp precision adds no information — the blocking rule is the same either way. Using day-level simplifies the query and avoids false distinctions (e.g. blocking a morning run because a gym session was at 11pm "yesterday" when the actual gap is 8h). If precision matters for a specific sport (e.g. two-a-day policy), that is handled by the `todays_sessions` timestamp check, not the previous-day check.

### 5.4 Volume autoregulation

```python
def autoregulate_volume(
    base_sets: int,
    base_reps: int,
    load_feel: int | None,   # workout_reflection.load_feel (-2..+2); None = no data
) -> tuple[int, int]:
    if load_feel is None:
        return base_sets, base_reps
    factor = {-2:1.20, -1:1.10, 0:1.00, 1:0.90, 2:0.80}[max(-2, min(2, load_feel))]
    return max(1, round(base_sets * factor)), max(4, round(base_reps * factor))
# [12] Halperin et al. 2021 — athletes under-predict RIR by ~1 rep (I²=97.9%);
# load_feel is a more reliable autoregulation signal than rep count.
# [13] Silva et al. 2022 — 15–30% velocity loss is the evidence-based fatigue zone;
# load_feel is its subjective proxy.
```

### 5.5 Primary sport selection

When no gate fires with a `force_sport`, the engine picks today's primary sport from the
user's `user_profile.primary_sports` JSONB (keys = sport slugs, values = priority weights
in the range 0.0–1.0). Sports blocked by `build_concurrent_blocks()` or by weather are
excluded before ranking.

```python
OUTDOOR_SPORTS = {'running', 'trail_run', 'cycling', 'hiking'}

def select_primary_sport(
    priority_weights:    dict[str, float],   # user_profile.primary_sports JSONB
    concurrent_blocks:   dict[str, str],     # from build_concurrent_blocks()
    gate_force_sport:    str | None,         # gate_result['force_sport'] if gate fired
    readiness_level:     str,                # from aggregate_readiness()
    weather_ok_outdoor:  bool = True,        # False when rain / extreme heat
) -> str | None:

    if gate_force_sport is not None:
        return gate_force_sport

    if readiness_level == 'rest':
        return 'rest'

    if not priority_weights:
        return None

    candidates = {
        sport: w
        for sport, w in priority_weights.items()
        if sport not in concurrent_blocks
    }

    if not weather_ok_outdoor:
        candidates = {s: w for s, w in candidates.items() if s not in OUTDOOR_SPORTS}

    if not candidates:
        return None

    return max(candidates, key=candidates.get)
```

**Weight semantics:** weights are relative preferences, not probabilities — they are never
normalised or summed. `{'running': 0.8, 'cycling': 0.4, 'strength': 0.6}` means running is
the primary sport; cycling is the least preferred. The engine always picks the single
highest-weight available sport per day. Multi-sport days (e.g. brick sessions) are not
generated by the daily engine — they come from the plan generator (§14–§16).

---

## 6. Female Athlete Protocol

Only active when `user_profile.sex == 'female'`.
`cycle_modifier_scale()` returns 0.0 when `hormonal_contraception IS NULL` → no modifiers.

### 6.1 Phase modifiers

```python
PHASE_MODIFIERS = {
    'menstruation': {
        'intensity_scale':  0.80,   # -20% intensity
        'block_heavy_lower': True,
        'note': 'Menstruation — reduced intensity; avoid heavy lower body',
    },
    'follicular': {
        'intensity_scale':  1.00,   # no reduction; best adaptation window
        'strength_priority': True,
        'note': 'Follicular — peak strength adaptation window; prioritise quality sessions',
    },
    'ovulation': {
        'intensity_scale':  1.00,
        'acl_flag': True,
        'note': 'Ovulation — peak performance; ACL awareness flag active',
    },
    'early_luteal': {
        'intensity_scale':  0.90,   # -10% volume
        'hydration_note':    True,
        'note': 'Early luteal — slight volume reduction; hydration priority',
    },
    'late_luteal': {
        'intensity_scale':  0.75,   # -25% intensity; no new maximal efforts
        'block_max_effort':  True,
        'note': 'Late luteal — recovery priority; no maximal efforts',
    },
}
# [14] McNulty et al. 2020 (meta-analysis) — follicular = peak adaptation
# [15] Williams et al. 2011 — elevated ACL laxity at ovulation

def apply_cycle_modifiers(rec: dict, phase: str | None, scale: float) -> dict:
    if phase is None or scale == 0.0:
        return rec
    mods = PHASE_MODIFIERS[phase]
    rec  = dict(rec)
    rec['duration_min']  = round(rec.get('duration_min', 60) * (1 - (1 - mods['intensity_scale']) * scale))
    rec['cycle_note']    = mods['note']
    if mods.get('acl_flag') and scale > 0.0:
        rec.setdefault('flags', []).append({
            'type': 'acl_risk_awareness',
            'message': (
                "You're near your ovulation window. Research indicates elevated knee "
                "laxity at this phase (Williams et al. 2011). Prioritise a dynamic "
                "warm-up and focus on landing mechanics during high-impact movements."
            ),
        })
    return rec
```

---

## 7. Strength Prescription

### 7.0 Exercise Ontology & Session Builder

Sections §7.1–§7.4 prescribe load, rep, and set parameters for a given exercise. Exercise selection itself — deciding *which* exercises populate a session — is governed by the constraint satisfaction system defined here. The output of the session builder is an ordered list of `(exercise_id, slot_index)` pairs; each pair is then passed individually to `prescribe_load_for_goal()` (§7.2). The LLM (Claude API) is never involved in selection decisions — all logic is deterministic, testable, and explainable.

#### 7.0.1 Movement Pattern Taxonomy

Every exercise has exactly one `primary_pattern` and zero or more `secondary_patterns`. Fatigue is tracked and decayed at the `primary_pattern` level only for residual computation; secondary pattern overlap is checked as a stacking constraint (§7.0.4 soft constraint 3). `[28]`

| Pattern | Description | Canonical examples | fatigue_decay_tau_h | goal_primary_for | goal_deprioritized |
|---------|-------------|-------------------|---------------------|-----------------|-------------------|
| `POWER_FULL_BODY` | Full-body explosive movements | Power clean, hang snatch, KB swing | 72 | sport_support | hypertrophy |
| `HIP_HINGE` | Posterior chain via hip extension | Deadlift, RDL, good morning | 60 | strength, sport_support | — |
| `KNEE_DOMINANT` | Quad-led via knee flexion/extension | Squat, front squat, BSS | 60 | strength, hypertrophy, sport_support | — |
| `HORIZONTAL_PUSH` | Horizontal press | Bench press, push-up, DB press | 48 | strength, hypertrophy | sport_support* |
| `HORIZONTAL_PULL` | Horizontal pull towards body | Barbell row, cable row, DB row | 48 | strength, hypertrophy | — |
| `VERTICAL_PUSH` | Overhead press | OHP, push press, Arnold press | 48 | strength, hypertrophy | sport_support* |
| `VERTICAL_PULL` | Vertical pull towards body | Pull-up, lat pulldown, pullover | 48 | strength, sport_support | — |
| `CARRY_BRACE` | Loaded carries and anti-rotation | Farmer carry, suitcase carry, Pallof press | 36 | sport_support | strength, hypertrophy |
| `ISOLATION` | Single-joint, single-muscle | Bicep curl, tricep ext, leg curl | 24 | hypertrophy | strength, sport_support |

\*`sport_support` deprioritizes `HORIZONTAL_PUSH` and `VERTICAL_PUSH` as **primary** slots only — they remain eligible as secondary/accessory slots.

**Combination goals:** For `strength_goal = 'combination'`, `goal_primary_for` and `goal_deprioritized` are blended proportionally by `goal_weights`. A pattern that is primary for `strength` (weight 0.4) and deprioritized for `hypertrophy` (weight 0.3) has a net priority score = 0.4 − 0.3 = +0.1 — included but not given top priority.

#### 7.0.2 Fatigue Residual Computation

```python
def compute_pattern_fatigue_residuals(
    query_datetime: datetime,
    ledger_rows:    list[dict],       # {pattern_key, session_date, fatigue_units} — past 7 days
    tau_map:        dict[str, float], # pattern_key → fatigue_decay_tau_h from movement_patterns
) -> dict[str, float]:                # pattern_key → residual (0.0 if no rows for that pattern)
    # HEURISTIC — tau values in movement_patterns table; calibrate per-athlete after ≥ 20 sessions
    residuals = {p: 0.0 for p in tau_map}
    for row in ledger_rows:
        # Treat session as completed at noon — conservative midday assumption
        session_dt    = datetime.combine(row['session_date'], time(12, 0))
        hours_elapsed = (query_datetime - session_dt).total_seconds() / 3600
        if hours_elapsed < 0:
            continue
        tau = tau_map.get(row['pattern_key'], 48.0)
        residuals[row['pattern_key']] += row['fatigue_units'] * exp(-hours_elapsed / tau)
    return {k: round(v, 3) for k, v in residuals.items()}
```

**Residual thresholds** (HEURISTIC):

| Residual | Label | Solver behavior |
|----------|-------|----------------|
| < 1.5 | fresh | No constraint |
| 1.5 – 3.0 | fatigued | Deprioritize; prefer substitute |
| > 3.0 | depleted | Hard exclude from session |

#### 7.0.3 Exercise Recency

```python
def compute_exercise_recency(
    log_rows:      list[dict],   # exercise_session_log rows for this user
    lookback_days: int = 14,
) -> dict[int, int | None]:      # exercise_id → days_since_last_used (None if not in window)
    today   = date.today()
    recency: dict[int, int] = {}
    for row in log_rows:
        eid  = row['exercise_id']
        days = (today - row['session_date']).days
        if eid not in recency or days < recency[eid]:
            recency[eid] = days
    return recency   # missing key = not used in lookback window → treated as None (eligible)
```

Minimum recency gap enforced by solver: 3 days for exercises with `cns_cost >= 4.0`; 1 day for all others. `None` (not used in window) = eligible.

#### 7.0.4 CSP Session Builder

`build_strength_session()` is a constraint satisfaction function. **Variables** = exercise slots (count determined by `session_type`, `strength_phase_key`, and `strength_goal`). **Domain** per slot = exercises filtered to valid candidates. Constraints are **hard** (must satisfy — violation excludes candidate) or **soft** (prefer to satisfy — used for ranking among valid candidates).

**Slot allocation by session type and goal:**

| session_type | strength slots | hypertrophy slots | sport_support slots |
|--------------|---------------|-------------------|---------------------|
| `upper` | 2 compound + 2 accessory | 2 compound + 3 accessory | 1 power + 2 compound + 1 accessory |
| `lower` | 2 compound + 1 accessory | 2 compound + 3 accessory | 1 power + 2 compound + 1 accessory |
| `full_body` | 3 compound + 2 accessory | 3 compound + 4 accessory | 2 power + 2 compound + 2 accessory |

Compound slot = `primary_pattern` in `goal_primary_for`, `skill_level >= 2`.
Accessory slot = any eligible pattern, `skill_level >= 1`.
Power slot = `primary_pattern == POWER_FULL_BODY` (`sport_support` only; requires `skill_level >= 2`).
For `combination`: blend slot counts by rounding the weighted average.

```python
def build_strength_session(
    session_type:        str,           # 'upper' | 'lower' | 'full_body'
    strength_phase_key:  str,           # from strength_phase_catalog
    readiness_level:     str,           # from aggregate_readiness()
    pattern_residuals:   dict,          # from compute_pattern_fatigue_residuals()
    exercise_recency:    dict,          # from compute_exercise_recency()
    available_equipment: list[str],     # from user_profile or session input
    athlete_skill_level: int,           # 1–3
    gate_result:         dict | None,   # if no_strength=True → return empty list
    cycle_phase:         str | None,    # female athlete: 'menstruation' blocks heavy lower
    strength_goal:       str,           # 'strength'|'hypertrophy'|'sport_support'|'combination'
    goal_weights:        dict | None,   # required if strength_goal == 'combination'
) -> list[dict]:                        # ordered list of exercise slots
```

**`strength_phase_key` role in slot selection:** The phase key has two effects on candidate scoring and eligibility. Valid keys: `'gpp'`, `'spp'`, `'power'`, `'maintenance'` (see §2 seed rows for full parameters).

1. **Exercise candidacy preference:** `strength_phase_exercises` maps each phase to a prioritized exercise list. Exercises with `priority = 1` (must-include) for the current phase receive a +3.0 score bonus in soft constraint ranking; `priority = 5` (optional) exercises are eligible but receive no bonus. Exercises absent from the phase's `strength_phase_exercises` rows are **not** hard-excluded — the full `exercises` table is the candidate pool; the phase list is a preference filter, not a gate.

2. **Plyometric eligibility:** if `strength_phase_catalog.plyometrics = FALSE` for the current phase (`gpp`, `spp`, `maintenance`), exercises tagged `'plyometric'` are hard-excluded from primary compound slots. Phase `power` enables plyometrics (`plyometrics = TRUE`). `spp` keeps the flag `FALSE` — plyometric accessories for `spp` are seeded explicitly in `strength_phase_exercises` with `priority = 5` and accessed as accessory slots only.

**Hard constraints** (violating any = candidate excluded from slot):

1. `equipment_available`: `exercise.equipment` intersects `available_equipment` (or includes `'BODYWEIGHT'`)
2. `skill_eligible`: `exercise.skill_level <= athlete_skill_level`
3. `pattern_not_depleted`: `pattern_residuals[primary_pattern] <= 3.0`
4. `recency_gap`: `days_since_last_used >= min_gap` (3d if `cns_cost >= 4.0` else 1d; `None` = eligible)
5. `session_type_match`: upper session excludes `KNEE_DOMINANT` and `HIP_HINGE` as primary slots (eligible as accessory); lower excludes `HORIZONTAL_PUSH`, `HORIZONTAL_PULL`, `VERTICAL_PUSH`, `VERTICAL_PULL` as primary slots
6. `no_heavy_lower_if_flagged`: if `cycle_phase in ('menstruation', 'late_luteal')` and `primary_pattern in ('KNEE_DOMINANT', 'HIP_HINGE')` → exclude high-load slots (`skill_level >= 2` and `cns_cost >= 3.5`)
7. `no_strength_gate`: if `gate_result` and `gate_result['no_strength']` → return `[]`
8. `goal_pattern_exclusion`: if pattern is in `goal_deprioritized` for the current goal **and** `pattern_residuals[primary_pattern] > 1.0` (fatigued) → hard-exclude from primary slots. At residual ≤ 1.0 (fresh), pattern remains eligible — freshness overrides deprioritization. For `combination`: exclude from primary slots only if blended net priority score < −0.2 **and** residual > 1.0.

**Soft constraints** (used for candidate ranking score within a slot):

1. `pattern_freshness_preference`: lower residual → higher score
2. `cns_budget`: total session `cns_cost` sum should not exceed `CNS_BUDGET[strength_goal][readiness_level]`; candidates that would exceed remaining budget are penalized (not excluded)
3. `no_secondary_pattern_stacking`: if a prior slot already exercises a pattern matching this candidate's `secondary_patterns` → penalize
4. `exercise_variety`: prefer exercises not used in the last 7 days
5. `goal_pattern_affinity`: rank candidates higher when their `primary_pattern` appears in `goal_primary_for` for the current goal. Score contribution: +2.0 for direct match. For `combination`: contribution = `sum(weight × 2.0)` for each component goal where the pattern is primary.
6. `goal_cns_preference`: for `strength` and `sport_support`, rank higher-`cns_cost` exercises higher within a pattern (prefer explosive/heavy variants). For `hypertrophy`, rank lower-`cns_cost`, higher-volume exercises higher. For `combination`: `cns_preference_score = strength_w × cns_cost + hypertrophy_w × (6.0 − cns_cost) + sport_support_w × cns_cost`.

```python
# HEURISTIC — strength gets higher CNS budget because maximal recruitment requires
# higher neural drive; hypertrophy is volume-driven, not CNS-limited. [28][29]
CNS_BUDGET: dict[str, dict[str, float]] = {
    'strength': {
        'peak': 22.0, 'good': 18.0, 'moderate': 13.0, 'low': 9.0, 'rest': 6.0
    },
    'hypertrophy': {
        'peak': 14.0, 'good': 11.0, 'moderate': 8.0, 'low': 6.0, 'rest': 4.0
    },
    'sport_support': {
        'peak': 18.0, 'good': 14.0, 'moderate': 10.0, 'low': 7.0, 'rest': 5.0
    },
}
# 'combination': blend budgets proportionally by goal_weights at call time.
```

**Sequencing:** After slot selection, order results by `SEQUENCE_PRIORITY` (§7.3). `POWER_FULL_BODY` exercises always go to `slot_index=0`. `[28]`

**Ledger update:** After session completion, the caller inserts one row into `pattern_fatigue_ledger` per pattern exercised, with `fatigue_units = sum(cns_cost + local_fatigue_cost)` across all sets for exercises in that pattern. Done by `update_pattern_fatigue_ledger()` — called by the post-session sync job, not by `build_strength_session()`. `[29]`

#### 7.0.5 Permanent Fixtures

Some exercises appear in every session regardless of CSP solver output. They are appended after solver output, after sequencing. `exercises.permanent_fixture = TRUE` (added via migration — see §2). Permanent fixtures are exempt from recency and pattern depletion checks but still subject to the `no_strength` gate.

Current permanent fixture: **face_pull** (`tags: ['shoulder_health']`). Appended to every `upper` and `full_body` session as the final slot.

---

### 7.1 Loading zones `[16] Kraemer & Ratamess 2004`

| Variable | Athlete (concurrent) | Strength | Hypertrophy |
|----------|---------------------|----------|-------------|
| Load | 75–85% 1RM | 85–95% 1RM | 65–80% 1RM |
| Sets | 2–4 | 3–6 | 3–5 |
| Reps | 6–10 | 3–6 | 8–12 |
| Rest | 120–180 s | 180–300 s | 60–90 s |
| Velocity cue | Controlled concentric | Maximal concentric intent | 2s ECC / 1s CON |

In-season athlete (maintenance): 2 sets × 6–8 reps × 80–85% 1RM; 1–2×/week per muscle.
`[17] Häkkinen et al. 2004`

### 7.2 Load prescription

```python
LOAD_PCT: dict[str, dict[str, tuple]] = {
    'athlete':     {'peak':(0.80,0.85),'good':(0.75,0.80),'moderate':(0.65,0.70),'low':(0.55,0.65),'rest':(0.50,0.60)},
    'strength':    {'peak':(0.90,0.95),'good':(0.85,0.90),'moderate':(0.75,0.80),'low':(0.65,0.75),'rest':(0.60,0.65)},
    'hypertrophy': {'peak':(0.75,0.80),'good':(0.70,0.75),'moderate':(0.60,0.65),'low':(0.50,0.60),'rest':(0.45,0.55)},
}
# 'rest' row: used only when strength_block.include=True despite rest readiness level
# (e.g. injury_signal gate fires but cross_training_ok=True). Prescribes very light
# maintenance load — movement pattern only, no progressive overload intent.
REST_S: dict[str, int] = {'athlete': 150, 'strength': 240, 'hypertrophy': 75}

def prescribe_load(
    estimated_1rm:  float | None,
    goal:           str,
    readiness_level: str,
) -> dict:
    if estimated_1rm is None:
        return {'load_kg_range': None, 'load_pct_1rm': None,
                'note': 'No 1RM data — work to a challenging weight for the rep range'}
    lo, hi = LOAD_PCT[goal][readiness_level]
    return {
        'load_kg_range': [round(estimated_1rm * lo, 1), round(estimated_1rm * hi, 1)],
        'load_pct_1rm':  f'{round(lo*100)}–{round(hi*100)}%',
        'rest_s':         REST_S[goal],
        'note': '',
    }

def prescribe_load_for_goal(
    estimated_1rm:   float | None,
    strength_goal:   str,
    goal_weights:    dict | None,
    readiness_level: str,
) -> dict:
    # Routes to prescribe_load() for single goals.
    # For 'combination', blends load ranges proportionally by goal_weights.
    # Replace all prescribe_load() calls in the strength subsystem with this wrapper.
    if strength_goal != 'combination':
        goal_key = 'athlete' if strength_goal == 'sport_support' else strength_goal
        return prescribe_load(estimated_1rm, goal_key, readiness_level)

    if estimated_1rm is None:
        return {'load_kg_range': None, 'load_pct_1rm': None,
                'note': 'No 1RM data — work to a challenging weight for the rep range'}
    blended_lo = blended_hi = 0.0
    for g, w in goal_weights.items():
        goal_key    = 'athlete' if g == 'sport_support' else g
        lo, hi      = LOAD_PCT[goal_key][readiness_level]
        blended_lo += lo * w
        blended_hi += hi * w

    rest_blended = round(sum(
        REST_S['athlete' if g == 'sport_support' else g] * w
        for g, w in goal_weights.items()
    ))
    return {
        'load_kg_range': [round(estimated_1rm * blended_lo, 1),
                          round(estimated_1rm * blended_hi, 1)],
        'load_pct_1rm':  f'{round(blended_lo*100)}–{round(blended_hi*100)}%',
        'rest_s':         rest_blended,
        'note':           f'Blended prescription: {goal_weights}',
    }
```

### 7.3 Exercise sequencing

```python
SEQUENCE_PRIORITY = {
    'power': 1, 'strength_compound': 2, 'strength_isolation': 3,
    'hypertrophy_compound': 4, 'hypertrophy_isolation': 5,
    'stability': 6, 'mobility': 7,
}
# Sort exercise suggestions by this priority before returning.
# Rule: multi-joint before single-joint; large muscle before small;
# explosive before strength. [16] Kraemer & Ratamess 2004
```

### 7.4 Progress evaluation thresholds `[18] Swinton et al. 2021`

**Do not use Cohen's d. Use S&C-specific SMD thresholds.**

| Label | SMD | Interpretation |
|-------|-----|----------------|
| Trivial | < 0.12 | Within noise; do not count as adaptation |
| Small | 0.12 | Meaningful but modest |
| Medium | 0.43 | Clear training effect |
| Large | 0.78 | Strong adaptation |

Thresholds shift up for: trained athletes, males; shift down for: untrained, female athletes,
longer observation periods.

---

## 8. Running Prescription

```python
ZONE_DURATION_CAPS = {1: 60, 2: 90, 3: 60, 4: 50, 5: 40}   # minutes
ZONE_LABELS        = {1:'active_recovery', 2:'aerobic_base',
                      3:'aerobic_threshold', 4:'threshold', 5:'vo2max'}

def prescribe_run(
    readiness_level:         str,
    tsb:                     float | None,
    gate_max_zone:           int   | None,   # from safety gate, if fired
    time_available_min:      int,
    terrain:                 str,
    zone_speeds:             dict,
    fatigue_index:           float | None,   # from last run
    hr_decoupling_recent:    float | None,   # % from last Z2 run
) -> dict:

    base = {'peak':4,'good':3,'moderate':2,'low':1,'rest':1}[readiness_level]
    zone = base

    if tsb is not None and tsb < -5 and zone >= 3:
        zone = 2

    if gate_max_zone is not None:
        zone = min(zone, gate_max_zone)

    # Biomechanics modifier (notebook finding)
    if fatigue_index is not None and fatigue_index > 1.0:
        zone = min(zone, 2)

    # Aerobic decoupling threshold (Friel 2009: > 5% = aerobic system under stress)
    if hr_decoupling_recent is not None and hr_decoupling_recent > 5.0:
        zone = min(zone, 2)

    duration    = min(time_available_min, ZONE_DURATION_CAPS[zone])
    pace_range  = zone_speeds.get(terrain, {}).get(f'z{zone}')   # None = output zone only

    return {
        'zone':         zone,
        'duration_min': duration,
        'pace_range':   pace_range,
        'session_type': ZONE_LABELS[zone],
        'terrain':      terrain,
    }
```

---

## 8b. Strength Block Timing

`strength_block.timing` in the output contract signals when the athlete should do their
strength work relative to today's aerobic session.

```python
def compute_strength_timing(
    todays_sessions:    list[dict],   # sessions already started or completed today
                                      # each has {'sport': str, 'start_time': datetime}
    primary_sport:      str | None,   # from select_primary_sport()
) -> str | None:
    """
    Returns:
      'after_run_3h_min' — aerobic session today (done or planned); do strength 3h+ after
      'anytime'          — no aerobic session today; sequence freely
      None               — strength_block.include is False; field not populated
    """
    AEROBIC_SPORTS = {'running', 'trail_run', 'cycling', 'swimming', 'rowing'}

    already_aerobic = any(s['sport'] in AEROBIC_SPORTS for s in todays_sessions)
    planned_aerobic = primary_sport in AEROBIC_SPORTS if primary_sport else False

    if already_aerobic or planned_aerobic:
        return 'after_run_3h_min'
    return 'anytime'
```

**Why 3h:** `build_concurrent_blocks()` blocks `gym_power` within 3h of an aerobic session
(§5.3). The timing field communicates the same constraint in the forward direction — the
user is told to wait 3h, not just that power work is blocked. The 3h window is derived from
Schumann et al. 2022 `[11]`.

---

## 9. Output Contract

Every `build_recommendation()` call returns this shape.
**No field is omitted. Missing data = `null`, not absent key.**

```typescript
interface Recommendation {
  date:              string;           // ISO 8601
  readiness_level:   'peak'|'good'|'moderate'|'low'|'rest';
  confidence:        number;           // 0.0–1.0

  recommendation: {
    primary_sport:   string | null;
    session_type:    string | null;
    zone:            number | null;    // 1–5
    duration_min:    number | null;
    pace_range:      string | null;    // "5:45–6:30 /km" or null
    intensity_note:  string | null;
    terrain:         string | null;
  };

  strength_block: {
    include:       boolean;
    timing:        string | null;      // "after_run_3h_min" | "anytime" | null
    session_type:  'upper'|'lower'|'full_body' | null;
    goal:          string | null;
    strength_goal: 'strength'|'hypertrophy'|'sport_support'|'combination';
    goal_weights:  Record<string, number> | null;  // null unless combination
    slot_allocation: {                // actual slots used this session
      power:     number;
      compound:  number;
      accessory: number;
    };
    exercises: Array<{
      name:             string;
      sets:             number;
      reps:             number | null;
      load_kg_range:    [number, number] | null;
      load_pct_1rm:     string | null;
      rest_s:           number;
      velocity_cue:     string;
      note:             string;
      exercise_id:      number;           // FK to exercises table
      primary_pattern:  string;           // e.g. "POWER_FULL_BODY"
      slot_index:       number;           // 0-indexed position in session
      selected_by:      'csp_solver' | 'permanent_fixture' | 'user_override';
      pattern_residual: number | null;    // residual at time of selection (for transparency)
    }>;
    sequencing_note:  string | null;
    cns_budget_used:  number | null;    // total CNS cost of selected exercises
    cns_budget_cap:   number | null;    // CNS_BUDGET[strength_goal][readiness_level]
    ontology_version: string | null;    // semver of exercise ontology; for cache invalidation
  };

  modifiers_applied: {
    acwr:                   number | null;
    hrv_status:             string;
    sleep_readiness:        string;
    load_feel_yesterday:    number | null;
    biomechanics_fatigue:   number | null;
    cycle_phase:            string | null;
    cycle_modifier_active:  boolean;
    hr_rpe_status:          string | null;
    pattern_fatigue:        Record<string, number> | null;
    // dict of pattern_key → residual for all 9 patterns; null if no ledger data
  };

  alerts:    Array<{ tier: string; message: string }>;
  flags:     Array<{ type: string; message: string }>;
  blocks:    Array<{ target: string; reason: string }>;
  disclaimer: string | null;

  load_context: {
    atl:       number | null;
    ctl:       number | null;
    tsb:       number | null;
    acwr:      number | null;
    ramp_rate: number | null;
  };
}
```

### Confidence score

```python
def compute_confidence(signals: dict) -> float:
    c = 1.0
    if signals.get('max_hr_source') == 'tanaka_formula':          c -= 0.10
    if signals.get('hrv_data_days', 0) < 14:                      c -= 0.15
    if not signals.get('has_readiness_checkin'):                   c -= 0.10
    if signals.get('biomechanics_baseline') is None:               c -= 0.10
    if not signals.get('has_zone_speeds'):                         c -= 0.05
    if signals.get('ctl') is None:                                 c -= 0.15
    if (signals.get('cycle_phase') and
        signals.get('hormonal_contraception') is None):            c -= 0.05
    return round(max(0.10, c), 2)
```

When `confidence < 0.5` display: *"Limited data available — recommendation is less
personalised than usual. Accuracy improves as more sessions are logged."*

---

## 10. Degradation / Null Handling

| Signal null | Behaviour |
|-------------|-----------|
| `acwr` | Skip ACWR gates (0, 1) |
| `hrv_status == 'no_data'` | Use sleep_readiness + subjective only |
| `sleep_readiness == 'no_data'` | Use HRV + subjective only |
| No `daily_readiness` today | Use yesterday's `load_feel` + sleep only |
| `zone_speeds` empty | Output zone label only; no pace range |
| No 1RM for exercise | Output rep range + "work to a challenging weight" note |
| No `biomechanics_baselines` | Skip fatigue index modifier; no running zone cap |
| `cycle_phase == None` | No cycle modifiers applied |
| No `competitions` row | Skip pre-competition gate |
| `ctl == None` | Skip ACWR; skip TSB contribution to readiness |

### What the engine outputs under each degraded state

**`training_load_daily` has < 3 rows (CTL and ACWR are null):**
`readiness_level` is derived from `hrv_status` + `sleep_readiness` + `daily_readiness` only. All ACWR and ramp-rate gates are skipped. `recommendation.zone` defaults to Z2. `load_context` fields are all `null`. `confidence` score is reduced by 0.15 (from the `ctl == None` penalty in `compute_confidence()`). The output is valid and complete — no keys are absent — but pace ranges are absent when `zone_speeds` is also empty, and the narrative disclaimer reads: *"Training load history is too short to compute fitness metrics. Recommendation defaults to easy aerobic work."*

**No sleep data (sleep not synced or no Garmin sleep record):**
`sleep_readiness = 'no_data'`. `readiness_level` uses HRV + `daily_readiness` only. If HRV is also absent, `readiness_level` is set to `'moderate'` as a conservative default (neither suppresses nor amplifies intensity). `confidence` is reduced by 0.10 from the missing `has_readiness_checkin` penalty if no `daily_readiness` row exists either.

**`biomechanics_baselines` absent (< 10 terrain-matched runs):**
`biomechanics_fatigue_index` is `null`. No running zone cap is applied from biomechanics signals. `compute_confidence()` deducts 0.10. Zone selection proceeds from `readiness_level` alone. The output field `modifiers_applied.biomechanics_fatigue` is `null`, not absent.

---

## 11. Cold Start

### Data thresholds for feature activation

| Feature | Minimum required |
|---------|-----------------|
| ATL | 3 sessions |
| CTL + ACWR | 42 sessions (~6 weeks) |
| HRV z-score | 14 HRV readings (14 nights) |
| Zone speeds | 5 qualifying runs per zone per terrain |
| Biomechanics baseline | 10 runs, same terrain type |
| 1RM estimate | 2 sets with reps ≤ 10 |
| Muscle decay personalisation | 5 `load_feel` observations per muscle |
| Cycle phase | 1 `menstrual_cycles` row < 60 days old |

### Default loading for new users `[16] Kraemer & Ratamess 2004`

- Strength: 2 sets × 15 reps × 40–50% estimated 1RM (or bodyweight-scaled)
- Running: Z1–Z2 only for first 2 weeks
- All gates except injury signal suppressed until CTL > 0

### Required onboarding fields

```
training_status       untrained | recreational | trained | elite
goal                  athlete | strength | hypertrophy
sex                   male | female | prefer_not_to_say
date_of_birth         date
gym_days_week         int (2–6)
primary_sports        JSONB

# Shown only when sex == 'female':
hormonal_contraception  Yes (TRUE) | No (FALSE) | Prefer not to say (NULL)
```

---

## 11b. Test Scenarios

These are the minimum acceptance tests for the recommendation engine. Each scenario specifies input state and asserts required output behaviour. Pass all before shipping any priority level.

| # | Scenario | Key inputs | Required output |
|---|----------|-----------|-----------------|
| T1 | New user, 0 sessions | `ctl=None`, `acwr=None`, no sleep | `readiness_level='moderate'`, `recommendation.zone=2`, `disclaimer` contains cold-start message, `confidence < 0.6` |
| T2 | ACWR critical | `acwr=1.9` | Gate 0 fires, `recommendation.zone≤1`, `blocks=True`, `disclaimer` set |
| T3 | HRV 5-day suppressed | `hrv_consecutive_suppressed=5` | Gate 2 fires, `force_sport='rest'`, `strength_block.include=False`, `disclaimer` set |
| T4 | Quality session, good readiness | `readiness_level='good'`, no gates | `recommendation.zone ∈ {3,4,5}`, pace range present if zone_speeds populated |
| T5 | Lower gym yesterday | `yesterdays_session={session_type:'lower'}`, `goal='athlete'` | `blocks['run']` set, no running session recommended |
| T6 | Aerobic session 2h ago | `todays_sessions=[{sport:'running', start_time: now-2h}]`, `goal='athlete'` | `blocks['gym_power']` set |
| T7 | Aerobic session 4h ago | Same but `start_time: now-4h` | `blocks` does not contain `gym_power` |
| T8 | Injury — moderate, cross_training_ok=True | `training_state='injured'`, `injury.severity='moderate'` | Session source = `cross_training`, only non-impact activities recommended |
| T9 | Return to run — week 1 | `training_state='return_to_run'`, week 1 | Only `easy_run` or `active_recovery` suggested, no Z3+ |
| T10 | Open-ended plan, Z2 TID drift | `easy_pct_actual=0.55`, `easy_pct_target=0.80` | TID guardrail fires, quality session downgraded to easy run |
| T11 | Female, late luteal | `cycle_phase='late_luteal'`, `hormonal_contraception=False` | `intensity_scale=0.75` applied, `block_max_effort=True` in modifiers |
| T12 | Null sleep only | `sleep_readiness='no_data'`, `hrv_status='elevated'` | `readiness_level` derived from HRV alone; output contract complete, no missing keys |
| T13 | No biomechanics baseline | `biomechanics_baseline=None` | `modifiers_applied.biomechanics_fatigue=null`, no running zone cap, `confidence` deducted 0.10 |
| T14 | Pre-competition 48h, A-race | `days_to_competition=1`, `competition_priority='A'` | Gate 4 fires, `no_strength=True`, `max_zone=2` |
| T15 | Plan week — missed quality session Tuesday | Mid-week, no quality logged Mon/Tue, `today=Wednesday` | Catch-up logic inserts missed quality session today if `readiness_level ∈ {'good','peak'}` |

---

## 12. Background Jobs

| Job | Trigger | Function | Stores to | Max runtime |
|-----|---------|----------|-----------|-------------|
| TRIMP per session | Post Garmin sync | `compute_trimp()` | `workouts.trimp` | < 1s |
| ATL/CTL/TSB/ACWR | Post Garmin sync | `compute_load_metrics()` | `training_load_daily` | < 2s |
| Terrain classification | Post Garmin sync | `classify_terrain()` | `workouts.terrain_type` | < 1s |
| Biomechanics fatigue index | Post Garmin sync | `compute_fatigue_index()` | `workouts.fatigue_index` | < 5s |
| 1RM cache update | Post new `strength_sets` insert | `get_best_1rm()` | `user_1rm_cache` | < 1s |
| Biomechanics baseline | Weekly cron (if ≥ 10 new sessions) | Aggregate from `workout_metrics` | `biomechanics_baselines` | < 30s |
| Zone speed recomputation | Monthly cron | `compute_zone_speeds()` | `user_profile.zone_speeds` | < 10s |
| MAX_HR recomputation | Quarterly cron | `compute_max_hr()` | `user_profile.max_hr` | < 5s |
| Menstrual cycle ingest | Post Garmin sync | Parse JSON export | `menstrual_cycles` | < 1s |
| Open-ended plan auto-extension | Weekly cron (Sunday night) | `generate_open_ended_plan()` | `training_plan_weeks` | < 5s |
| Plan revision on HRV suppression | Post ATL/CTL/TSB job (if Gate 2 triggered) | `compute_resume_phase()` + shift plan weeks | `training_plan_weeks` | < 3s |
| CTL decay during injury | Daily cron while `training_state = 'injured'` | `pre_injury_ctl * exp(-days / 42.0)` → cached | `training_plans` | < 1s |

**Open-ended auto-extension:** When the active open-ended plan's last `training_plan_weeks` row falls within 2 weeks, the job generates the next 16-week rolling cycle anchored to current CTL. Volume ceiling stays at 80% of tier peak. No user interaction required.

**Plan revision on HRV suppression:** Gate 2 (5+ consecutive suppressed HRV days) triggers a plan revision: the remaining weeks in the current mesocycle are flagged `cutback_week = TRUE` and their target volumes reduced by 20%. Quality session counts drop by 1. The revision is recorded in `training_plan_weeks.notes`. After Gate 2 clears, the next mesocycle resumes at pre-suppression volume.

**CTL decay tracking during injury:** The daily job caches `decayed_ctl` on `training_plans` so `compute_return_volume()` always has an up-to-date decay value, even if the user clears the injury weeks after onset. Formula: `decayed_ctl = pre_injury_ctl × exp(−injury_days / 42.0)`.

---

## 13. Build Order

| Priority | Task |
|----------|------|
| **P1** | Run all schema migrations (§2) |
| **P1** | `compute_load_metrics()` → write to `training_load_daily` post-sync |
| **P1** | Surface ACWR in `recommend.py` and dashboard |
| **P1** | Safety gates (§4) — replace existing ad-hoc blocks |
| **P1** | Concurrent training timestamp check (§5.3) — replace date-only check |
| **P1** | `compute_sleep_readiness()` multi-threshold (§3.5) |
| **P1** | Full output contract (§9) — typed, no missing keys |
| **P2** | Terrain classification → `workouts.terrain_type` |
| **P2** | Biomechanics fatigue index post-sync (§3.8) |
| **P2** | `aggregate_readiness()` wired into `build_recommendation()` (§5.1) |
| **P2** | `user_1rm_cache` invalidation on new strength_sets |
| **P2** | Female athlete protocol — Garmin menstrual JSON ingest + phase estimation (§6) |
| **P2** | `confidence` score (§9) |
| **P2** | Onboarding questionnaire additions |
| **P2 (ontology)** | `movement_patterns` catalog table + seed data (§7.0.1) |
| **P2 (ontology)** | `exercises` table extension — `ALTER TABLE` for ontology columns (§2) |
| **P2 (ontology)** | `exercise_relationships` table (§2) |
| **P2 (ontology)** | `pattern_fatigue_ledger` table (§2) |
| **P2 (ontology)** | `exercise_session_log` table (§2) |
| **P2 (ontology)** | `training_plans` schema extension — `strength_goal`, `goal_weights` columns (§2) |
| **P2 (ontology)** | `goal_weights` validation logic in plan creation endpoint (values sum to 1.0 ± 0.01; keys valid) |
| **P2 (ontology)** | `compute_pattern_fatigue_residuals()` (§7.0.2) |
| **P2 (ontology)** | `compute_exercise_recency()` (§7.0.3) |
| **P2 (ontology)** | `build_strength_session()` CSP solver — hard + soft constraints (§7.0.4) |
| **P2 (ontology)** | `prescribe_load_for_goal()` wrapper — routes and blends for `combination` (§7.2) |
| **P2 (ontology)** | Goal-stratified `CNS_BUDGET` constants (§7.0.4) |
| **P2 (ontology)** | `goal_pattern_affinity` and `goal_cns_preference` soft constraints in solver (§7.0.4) |
| **P2 (ontology)** | `update_pattern_fatigue_ledger()` post-session job (§7.0.4) |
| **P2 (ontology)** | Output contract extension — new fields in `strength_block` and `modifiers_applied` (§9) |
| **P3** | Zone speed computation job (§3.10) |
| **P3** | Pre-competition gate UI — competition calendar form |
| **P3** | Swinton effect size thresholds on progress page (§7.4) |
| **P3** | HR:RPE dissociation (§3.12) |
| **P3** | Muscle decay personalisation from `load_feel` history (§3.6) |
| **P3** | MAX_HR quarterly recomputation job |
| **P4** | Bayesian IR model (requires 60+ sessions + P_t proxy) |
| **P2 (plan)** | Catalog seed migrations — `plan_types`, `plan_goal_tiers`, `plan_type_phases`, `session_type_catalog`, `plan_session_templates`, `strength_phase_catalog`, `strength_phase_exercises` |
| **P2 (plan)** | `classify_goal(db, plan_type_key, target_time_min)` — reads from `plan_goal_tiers`; no hardcoded logic |
| **P2 (plan)** | `compute_phase_schedule(db, plan_type_key, tier, total_weeks)` — reads from `plan_type_phases` |
| **P2 (plan)** | `POST /api/v1/training/plan` — plan creation endpoint; validates goal tier, computes phase schedule, writes `training_plans` + `training_plan_weeks` |
| **P3 (plan)** | `get_week_pattern()` — session template engine reading `plan_session_templates`; catch-up logic for missed quality sessions |
| **P3 (plan)** | TID guardrail (`check_weekly_tid()`) wired into `build_recommendation()` |
| **P3 (plan)** | `plan_context` included in dashboard and recommendation output |
| **P3 (plan)** | Injury API — `POST /api/v1/injuries`, `PATCH /api/v1/injuries/{id}/clear`, `GET /api/v1/injuries`; state machine transitions |
| **P4 (plan)** | `weakness_focus` priority weighting in session selection |
| **P4 (plan)** | Multi-race macrocycle — `competitions` table, A/B/C race priority, plan chaining |
| **P4 (plan)** | Plan revision triggers — automatic volume reduction on Gate 2; plan shift on unexpected CTL drop |
| **P4 (plan)** | Injury CTL projection UI — show athlete where their fitness will be on projected return date |

---

## 14. Training Plan System

### 14.0 Architecture and Design Principles

**Catalog + instantiation pattern:**

| Layer | Tables | Mutated by |
|-------|--------|-----------|
| Catalog | `plan_types`, `plan_goal_tiers`, `plan_type_phases`, `session_type_catalog`, `plan_session_templates`, `strength_phase_catalog`, `strength_phase_exercises` | Seed migrations only (INSERT, no ALTER) |
| Instance | `training_plans`, `training_plan_weeks` | Plan creation API + revision triggers |
| Daily | Signal tables + recommendation output | Per-request computation |

**Extension protocol:** Adding triathlon in V2 = INSERT rows into catalog tables. No application code change required.

**Universal principles — all athlete tiers:**

Session types are **athlete-tier agnostic**. A 5:30/km beginner and a 3:00/km elite marathon runner work from the same session type catalog. The training principles are identical across all levels. What scales by tier is volume, duration, and frequency — not session type availability. A beginner doing threshold intervals does 2 × 8 min; an elite does 5 × 12 min. The session type, its TID contribution, its safety gate thresholds, and its position in the periodization structure are identical. `[26][27]`

| Changes by tier | Mechanism |
|----------------|-----------|
| Weekly volume | `plan_goal_tiers.peak_km_per_week` |
| Quality session count per week | `plan_goal_tiers.quality_sessions_per_week` |
| Mesocycle length | `plan_goal_tiers.mesocycle_weeks` |
| Total plan weeks | `plan_goal_tiers.plan_total_weeks` |

| Does NOT change by tier |
|------------------------|
| Session type availability (strides, hill sprints, fartlek — all tiers, all base phases) |
| TID principles and targets (80/20 applies most critically to beginners) |
| Periodization phase structure (base → build → peak → taper for everyone) |
| Safety gate thresholds |
| Female athlete protocol |

This is especially important for beginner athletes. They drift into the moderate-intensity trap most severely. Applying TID principles rigorously to beginners produces the largest performance gains. `[24][25]`

**Linear + adaptive = nonlinear in practice:**

Plan templates implement **linear periodization** `[26]` (Lydiard, Pfitzinger) — clean phase separation with shifting emphasis. Predictable, teachable, easy to template in a DB.

The daily signal-adaptive layer (HRV, readiness, TID guardrail, safety gates) makes the system behave like **nonlinear periodization** `[26]` (Canova, Hudson) in practice — emphasis shifts day-to-day based on actual athlete state, not just phase prescription. This is intentional: structural phases for volume planning, adaptive daily layer for injury prevention and load management.

---

### 14.1 Training Intensity Distribution (TID)

All plan logic is anchored to TID. The engine monitors actual TID continuously and guards against the moderate-intensity trap.

**80/20 as population optimum — not a law:** `[24][25]`

The evidence-based target range is **75–85% low intensity (Z1–Z2)**, with 80% as the starting default. Individual athletes calibrate within this band over time. There is no evidence of extreme outliers who respond poorly to 80/20 training. The place to start is always 80/20.

**TID is measured in time (minutes), not session count.** Measuring by session count overstates the high-intensity proportion because quality sessions are longer than easy runs. `[24]`

Operational session-count proxy: ~1 in 3 sessions at moderate or high intensity. Communicable to athletes; converts approximately to the time-based targets below.

**Phase-specific TID targets:** TID shifts from pyramidal (base) to polarized (competition). `[24]`

| Phase | Z1–Z2 target | Z3 (moderate) | Z4–Z5 (high) | Distribution type |
|-------|-------------|---------------|--------------|------------------|
| Base | 80–85% | 10–15% | < 5% (brief neuromuscular only) | Pyramidal |
| Build | 75–80% | 5–10% | 15–20% | Transitional |
| Peak | 75–80% | < 5% | 20–25% | Polarized |
| Taper | 80–85% | < 5% | 15–20% (short, sharp) | Polarized |

Note: Z4–Z5 in the base phase is **neuromuscular work only** — strides (20–30s) and hill sprints (8–12s). These are too brief to produce sustained aerobic stress but train the CNS. They do not violate pyramidal TID — they are structurally analogous to plyometric work. `[27]`

**TID guardrail:**

```python
def check_weekly_tid(
    completed_this_week: list[dict],   # workouts: duration_min, avg_zone
    easy_pct_target:     float,        # from training_plan_weeks.easy_pct
) -> dict:
    total_min = sum(w['duration_min'] for w in completed_this_week)
    easy_min  = sum(w['duration_min'] for w in completed_this_week
                    if w.get('avg_zone', 3) <= 2)
    if total_min < 30:
        return {'status': 'insufficient_data', 'easy_pct_actual': None}
    actual = easy_min / total_min
    delta  = actual - easy_pct_target
    return {
        'status':          ('on_track'  if abs(delta) <= 0.10 else
                            'too_easy'  if delta > 0.10 else
                            'too_hard'),
        'easy_pct_actual': round(actual, 3),
        'easy_pct_target': easy_pct_target,
    }
# If status == 'too_hard': next planned quality session downgrades to easy_run.
```

---

### 14.2 Long-Range Plan

Before generating week-by-week targets, the system produces a **Long-Range Plan (LRP)** — a strategic season overview. `[23]`
The LRP is NOT a day-by-day schedule. It defines phase start/end dates, TID shape, and how training specificity increases as race day approaches.

**Bookends principle:** `[23]`
Race-specific training closest to race day. Least race-specific (highest intensity, shortest duration) earliest in season. All intensities addressed throughout — no phase completely zeros out a stimulus.

| Event | Early season emphasis | Final 6–8 weeks |
|-------|-----------------------|----------------|
| Marathon | Aerobic base + VO2max intervals | Threshold intervals + race-pace reps |
| Half marathon | VO2max intervals + tempo | Threshold + race-pace |
| 10k | VO2max intervals + hill repeats | Race-pace + tempo |
| 5k | VO2max + hill sprints | Race-pace + strides |
| Trail 50k | VO2max intervals + hill repeats | Endurance runs + steady-state at race effort |

Trail ultras follow the bookends principle most strictly: race effort is sustained moderate intensity for 24–48h, making VO2max intervals the *least* race-specific stimulus. Endurance volume and steady-state are the *most* specific. `[23]`

**Strengths and weaknesses positioning:** `[23]`
Weakness-focused training early (maximum development time). Strength-focused training in peak (maintain competitive advantage; no time to atrophy). Stored in `training_plans.weakness_focus TEXT[]` — used to shift quality type priority when populating `plan_session_templates` for the base phase.

---

### 14.3 Goal Taxonomy

`classify_goal()` reads from `plan_goal_tiers`. No hardcoded tier logic in application code.

```python
async def classify_goal(
    db:              AsyncSession,
    plan_type_key:   str,
    target_time_min: int | None,
) -> dict:
    rows = await db.execute(
        """SELECT * FROM plan_goal_tiers
           WHERE plan_type_key = $1
           ORDER BY max_time_min ASC NULLS LAST""",
        plan_type_key)
    for row in rows:
        if row.max_time_min is None or target_time_min is None \
                or target_time_min <= row.max_time_min:
            return dict(row)
    raise ValueError(f'No tier found for {plan_type_key} / {target_time_min}')
```

**V1 seed — marathon (full catalog in `migrations/seed_plan_catalog.sql`):**

| Tier | max_time_min | peak km/wk | plan_weeks | quality/wk | mesocycle_weeks |
|------|-------------|-----------|-----------|-----------|----------------|
| `elite_amateur` | 150 (2:30) | 100 | 20 | 2 | 5 |
| `well_trained` | 180 (3:00) | 80 | 18 | 2 | 4 |
| `trained` | 210 (3:30) | 65 | 16 | 2 | 4 |
| `recreational` | 240 (4:00) | 50 | 16 | 1 | 3 |
| `beginner` | NULL | 35 | 14 | 1 | 3 |

**Mesocycle length rationale:** `[22][26]`
- 3 weeks (2:1): beginner/recreational — more frequent cutbacks; limited recovery capacity
- 4 weeks (3:1): trained/well-trained — standard; 3 loading + 1 cutback
- 5 weeks (4:1): elite — sustained overload; validated recovery capacity required

**Volume anchor to current CTL:**

```python
def safe_start_volume_km(current_ctl: float, peak_km: float) -> float:
    # CTL ≈ TRIMP/day; 1 easy km ≈ 9 TRIMP
    ctl_implied_weekly_km = (current_ctl * 7) / 9.0
    # Never start > 60% of tier peak; never jump > 120% of current implied volume
    return round(min(ctl_implied_weekly_km * 1.20, peak_km * 0.60), 1)
```

---

### 14.4 Periodization Phase Definitions

Phase schedule computed from catalog; no hardcoded fractions in application code.

```python
async def compute_phase_schedule(
    db:            AsyncSession,
    plan_type_key: str,
    tier:          str,
    total_weeks:   int,
) -> list[dict]:
    rows = await db.execute(
        """SELECT phase, phase_fraction, easy_pct, quality_sessions, strength_phase_key
           FROM plan_type_phases
           WHERE plan_type_key = $1 AND tier = $2
           ORDER BY CASE phase WHEN 'base' THEN 1 WHEN 'build' THEN 2
                               WHEN 'peak' THEN 3 WHEN 'taper' THEN 4 END""",
        plan_type_key, tier)
    phases, acc = [], 0
    for row in rows:
        w = max(1, round(total_weeks * row.phase_fraction))
        phases.append({**dict(row), 'weeks': w, 'start_week': acc + 1})
        acc += w
    return phases
```

**V1 seed — phase fractions (same across tiers within an event type):**

| Event | Base | Build | Peak | Taper |
|-------|------|-------|------|-------|
| Marathon | 0.40 | 0.30 | 0.15 | 0.15 |
| Half marathon | 0.35 | 0.35 | 0.15 | 0.15 |
| 10k | 0.30 | 0.40 | 0.15 | 0.15 |
| 5k | 0.25 | 0.45 | 0.20 | 0.10 |
| Trail 50k | 0.45 | 0.30 | 0.10 | 0.15 |

**Phase characteristics:**

| Phase | Primary stimulus | TID target | Strength phase |
|-------|-----------------|-----------|---------------|
| Base | Aerobic base, connective tissue, neuromuscular foundation | 80–85% Z1–Z2 | `gpp` |
| Build | LT2, VO2max ceiling, running economy | 75–80% Z1–Z2 | `spp` |
| Peak | Race-specific adaptation, neuromuscular sharpening | 75–80% polarised | `power` |
| Taper | CNS freshness, race readiness | 80–85% Z1–Z2 | `maintenance` |

**Volume assignment — mesocycle-aware:**

```python
def assign_weekly_volumes(
    phases:          list[dict],
    start_volume_km: float,
    peak_volume_km:  float,
    mesocycle_weeks: int,       # 3, 4, or 5 from plan_goal_tiers
) -> list[float]:
    volumes = []
    load_weeks = mesocycle_weeks - 1   # 2, 3, or 4 loading weeks before cutback
    current    = start_volume_km

    for phase in phases:
        if phase['phase'] == 'taper':
            # Linear drop regardless of mesocycle_weeks
            for j in range(phase['weeks']):
                volumes.append(round(peak_volume_km * (0.80 - 0.15 * j), 1))
            continue
        for w in range(phase['weeks']):
            if w % mesocycle_weeks < load_weeks:   # loading week
                v = min(current * 1.12, peak_volume_km)
                volumes.append(round(v, 1))
                current = v
            else:                                   # cutback week
                volumes.append(round(current * 0.70, 1))
                # current unchanged; next loading block resumes from here

    # Hard cap: no week > 10% above prior week [4]
    for i in range(1, len(volumes)):
        if volumes[i] > volumes[i - 1] * 1.10:
            volumes[i] = round(volumes[i - 1] * 1.10, 1)
    return volumes
```

**Long run progression (applied within the weekly volume allocation):**
Long run grows approximately +1.5 km every 1–2 weeks. Independent cutback every 4–5 long-run cycles (coordinate with mesocycle cutback where possible). `[27]`

---

### 14.5 Base Phase — Three Distinct Goals

Base training has three goals that apply to **every athlete tier without exception**. A beginner's base and an elite's base share the same structure; absolute volume is the only difference. `[27]`

| Goal | Method | TID zone |
|------|--------|---------|
| **1. Endurance** | High mileage + long run + aerobic workouts (progression runs, tempo) every 7–14 days | Z1–Z2 (80–85% of time) |
| **2. Neuromuscular fitness** | Strides 2–3×/week + hill sprints 1–2×/week + fartlek every 10–14 days | Z4–Z5 brief (< 5% of time; present every week) |
| **3. Muscular strength** | GPP strength block (§14.8) | N/A |

**Base training is not just slow running.** Fast work is always present. The distinction: speed without sustained metabolic stress. Strides (20–30s) and hill sprints (8–12s) are too brief to drive aerobic adaptation but they train CNS neuromuscular coordination — keeping fast-twitch recruitment patterns active during high-volume aerobic base. Without them, a runner builds aerobic capacity but loses neuromuscular efficiency; the training debt compounds into the build phase. `[27]`

*Bob Kennedy:* "I think that the phase of training is defined by what you are focusing on during that phase. But you always do a little of all of those things." `[27]`

**Aerobic workouts in base** (every 7–14 days, alternating with fartlek — NOT every week):
- Progression run: Z2 throughout, builds to ~Z3 over final 15–20 min
- Steady tempo (short): 15–20 min continuous Z3; shorter than build-phase threshold work

These are the only true "quality" sessions in the base phase. For beginners (1 quality/week): one of these every 10–14 days. For trained+ (2 quality/week): one aerobic workout + one hill repeat or fartlek.

---

### 14.6 Session Type Library

Twelve session types for V1. All stored in `session_type_catalog`. The recommendation algorithm operates generically on catalog rows — no session-type-specific logic in Python.

**Key additions vs prior version:**
- `hill_sprints` (new): 8–12s explosive uphill, neuromuscular, base and build phases `[27]`
- `fartlek` (new): unstructured aerobic variety with surges, base and build phases `[27]`
- `progression_run` (new): bridges easy and aerobic workout; base and build
- `strides`: now includes base phase (previously missing; corrected per `[27]`)

**Full V1 session type catalog:**

| type_key | min/max zone | duration (min) | recovery_days | phases | max/wk |
|----------|-------------|----------------|--------------|--------|--------|
| `active_recovery` | 1/1 | 20–40 | 0 | all | 2 |
| `easy_run` | 1/2 | 30–70 | 0 | all | 5 |
| `long_run` | 2/2 | 60–150 | 1 | all | 1 |
| `medium_long_run` | 2/2 | 50–85 | 0 | base, build | 1 |
| `hill_sprints` | 4/5 | 20–35 | 0 | base, build | 2 |
| `strides` | 4/5 | 20–35 | 0 | base, build, peak, taper | 2 |
| `fartlek` | 2/4 | 35–55 | 1 | base, build | 1 |
| `progression_run` | 2/3 | 35–55 | 1 | base, build | 1 |
| `tempo_run` | 3/3 | 35–55 | 1 | base, build | 1 |
| `threshold_intervals` | 4/4 | 50–75 | 2 | build, peak | 1 |
| `vo2max_intervals` | 5/5 | 50–70 | 2 | build, peak | 1 |
| `race_pace_reps` | 3/4 | 55–80 | 1 | peak | 1 |
| `hill_repeats` | 4/5 | 40–60 | 2 | base, build | 1 |

**Critical distinctions:**

| Type | Duration | Stimulus | Phase | Do not confuse with |
|------|----------|---------|-------|---------------------|
| `hill_sprints` | 8–12s | Neuromuscular, power, economy | Base, build | `hill_repeats` |
| `hill_repeats` | 45–90s | Aerobic strength, LT adjacent | Base, build | `hill_sprints` |
| `fartlek` | 1–3 min surges, unstructured | Aerobic variety, mental engagement | Base, build | `tempo_run` |
| `tempo_run` | 20–30 min continuous Z3 | Sustained lactate clearance | Base, build | `fartlek` |
| `strides` | 20–30s controlled acceleration | CNS activation, stride efficiency | All phases | `vo2max_intervals` |

**Target pace computation:**

```python
RACE_DISTANCES_KM = {
    'marathon': 42.195, 'half_marathon': 21.097,
    '10k': 10.0, '5k': 5.0, 'trail_50k': 50.0,
}

def target_pace_min_per_km(target_time_min: int, plan_type_key: str) -> float:
    return round(target_time_min / RACE_DISTANCES_KM[plan_type_key], 2)
```

---

### 14.7 Weekly Template Engine

Reads day-of-week assignments from `plan_session_templates`. No sport-specific logic in Python. Adding a new plan type's weekly structure = INSERT rows, no code change.

```python
async def get_week_pattern(
    db:            AsyncSession,
    plan_type_key: str,
    tier:          str,
    phase:         str,
    quality_count: int,
    week_number:   int,
) -> dict[int, str]:
    parity = 'even' if week_number % 2 == 0 else 'odd'
    rows = await db.execute(
        """SELECT day_of_week, session_type_key
           FROM plan_session_templates
           WHERE plan_type_key = $1 AND tier = $2 AND phase = $3
             AND quality_count = $4 AND (week_parity = 'any' OR week_parity = $5)
           ORDER BY day_of_week""",
        plan_type_key, tier, phase, quality_count, parity)
    return {r.day_of_week: r.session_type_key for r in rows}
```

**Hard sequencing rules (enforced in seed data; validated at plan generation):**
- No two quality (Z3+) sessions on consecutive days
- Long run never adjacent to a quality session
- Lower body strength not on quality run days (concurrent training rule §5.3)
- At least one full rest day per week
- Hill sprints and strides appended to easy run days or standalone; never on quality session days

**V1 seed — marathon base phase, trained tier, 2 quality sessions/week (odd weeks):**

| Day (0=Mon) | Session | Notes |
|-------------|---------|-------|
| 0 | `easy_run` + `strides` | Neuromuscular goal 1; post-weekend flush |
| 1 | `progression_run` | Quality 1 (aerobic workout) |
| 2 | `easy_run` | |
| 3 | `hill_sprints` | Neuromuscular goal 2 |
| 4 | `easy_run` | |
| 5 | `long_run` | Weekly cornerstone |
| 6 | `rest` | |

Even-week variant: Day 3 = `fartlek` (alternates for neuromuscular variety without hill_sprints fatigue accumulation).

**Beginner base, 1 quality session/week:**

| Day | Session | Notes |
|-----|---------|-------|
| 0 | `easy_run` | |
| 1 | `easy_run` + `strides` | Neuromuscular — same principle, lower reps |
| 2 | `progression_run` | Quality 1 (every other week; fartlek on alternate) |
| 3 | `easy_run` | |
| 4 | `rest` | |
| 5 | `long_run` | |
| 6 | `active_recovery` | |

**Missed session recovery:**

```python
def get_planned_session_for_today(
    pattern:             dict[int, str],
    completed_this_week: list[dict],
    today_weekday:       int,
    readiness_level:     str,
    gate_max_zone:       int | None,
    session_catalog:     dict[str, dict],
) -> dict | None:
    session_key = pattern.get(today_weekday, 'rest')
    if session_key == 'rest':
        return None
    spec = dict(session_catalog[session_key])

    # Mon–Thu only: catch up on missed quality session
    if today_weekday <= 3 and spec['max_zone'] < 3:
        planned_quality = sum(1 for d, s in pattern.items()
                              if d < today_weekday and session_catalog[s]['max_zone'] >= 3)
        done_quality    = sum(1 for w in completed_this_week if w.get('avg_zone', 0) >= 3)
        if done_quality < planned_quality:
            missed = next(
                (s for d, s in sorted(pattern.items())
                 if d < today_weekday
                 and session_catalog[s]['max_zone'] >= 3
                 and not any(w.get('session_type_key') == s for w in completed_this_week)),
                None)
            if missed:
                spec = dict(session_catalog[missed])

    # Readiness downgrade
    if readiness_level in ('low', 'rest'):
        spec = dict(session_catalog['easy_run'])
    elif readiness_level == 'moderate' and spec['max_zone'] >= 5:
        spec = dict(session_catalog['tempo_run'])

    if gate_max_zone is not None and spec['max_zone'] > gate_max_zone:
        spec = dict(session_catalog['easy_run'])

    return spec
```

---

### 14.8 Complementary Strength Blocks per Phase

Reads from `strength_phase_catalog` and `strength_phase_exercises` (referencing `exercises.exercise_id`). Exercise selection additionally filtered by muscle freshness (§3.6).

**Phase-to-strength mapping:**

| Running phase | Strength phase | Focus | Sessions/week |
|--------------|---------------|-------|--------------|
| Base | `gpp` | Bilateral compound, connective tissue, high volume | 2 |
| Build | `spp` | Unilateral, running-specific, introduce plyometrics | 2 |
| Peak | `power` | Low volume, explosive/heavy, full plyometrics | 2 |
| Taper | `maintenance` | 1–2 sets, neural activation only | 1 |

This applies to **all tiers** — a beginner in GPP does bodyweight Romanian deadlifts; an elite does heavy bar. Progression is in absolute load and complexity, not in exercise category access. `[27]`

Last strength session in Taper ≥ 5 days before A-race. Two sets sufficient for strength maintenance in-season. `[17]`

---

### 14.9 Standalone Goal Programs

Users with `goal = 'strength'` or `goal = 'hypertrophy'` and no racing intent. No running plan generated. Mesocycle structure applies regardless of tier.

```python
def get_standalone_mesocycle_params(
    mesocycle_week:  int,    # 1-indexed within cycle; final week = deload
    goal:            str,    # 'strength' | 'hypertrophy'
    mesocycle_weeks: int,    # from plan_goal_tiers (3, 4, or 5)
) -> dict:
    if mesocycle_week >= mesocycle_weeks:
        return {'phase': 'deload', 'sets': 2, 'load_pct': '50–60% 1RM',
                'reps': {'strength': '5', 'hypertrophy': '12'}[goal]}
    scale = round((0.70 + (mesocycle_week - 1) * 0.08) * 100)
    return {'phase':    'accumulation',
            'sets':     3 + mesocycle_week,
            'reps':     {'strength': '3–6', 'hypertrophy': '8–12'}[goal],
            'load_pct': f'{scale}–{scale + 8}% 1RM'}
```

**Default splits by `gym_days_week`:**

| Days/week | Split | Pattern |
|-----------|-------|---------|
| 2 | Full body | Mon, Thu |
| 3 | Full body | Mon, Wed, Fri |
| 4 | Upper/Lower | Mon=Lower, Tue=Upper, Thu=Lower, Fri=Upper |
| 5 | U/L + Full body | Mon=L, Tue=U, Wed=FB, Fri=L, Sat=U |
| 6 | PPL | Mon=Push, Tue=Pull, Wed=Legs, Thu=Push, Fri=Pull, Sat=Legs |

---

### 14.10 Plan-to-Actual Daily Integration

```python
async def build_recommendation(
    user_id:             int,
    today:               date,
    signals:             dict,
    plan_context:        dict | None,
    completed_this_week: list[dict],
    gate_result:         dict | None,
) -> Recommendation:

    # 1. Safety gates always win
    if gate_result and gate_result.get('blocks'):
        return build_gate_response(gate_result, signals)

    flags = []

    if plan_context:
        week    = plan_context['week']
        catalog = plan_context['session_catalog']   # preloaded from session_type_catalog
        pattern = await get_week_pattern(
            db, plan_context['plan_type_key'], plan_context['tier'],
            week['phase'], week['quality_sessions'], week['week_number'])

        # TID guardrail
        tid    = check_weekly_tid(completed_this_week, week['easy_pct'])
        gate_z = gate_result.get('max_zone') if gate_result else None
        if tid['status'] == 'too_hard':
            gate_z = min(gate_z or 2, 2)
            flags.append({'type': 'tid_override',
                          'message': (f"Weekly high-intensity budget exceeded "
                                      f"({tid['easy_pct_actual']:.0%} easy vs "
                                      f"{tid['easy_pct_target']:.0%} target). "
                                      "Quality session deferred.")})

        spec = get_planned_session_for_today(
            pattern, completed_this_week, today.weekday(),
            signals['readiness_level'], gate_z, catalog)
    else:
        spec = derive_adhoc_session_type(signals)   # §5.2 fallback

    session = adapt_session_to_signals(spec, signals)

    if signals.get('cycle_phase') and signals.get('cycle_modifier_scale', 0.0) > 0:
        session = apply_cycle_modifiers(session, signals['cycle_phase'],
                                        signals['cycle_modifier_scale'])

    strength = await build_strength_block(plan_context, signals, today)

    return assemble_recommendation(session, strength, signals, gate_result,
                                   plan_context, flags)
```

**Duration scaling by readiness:**

```python
def adapt_session_to_signals(spec: dict | None, signals: dict) -> dict:
    if spec is None:
        return {'session_type_key': 'rest', 'zone': None, 'duration_min': None}
    scale    = {'peak': 1.10, 'good': 1.00, 'moderate': 0.85, 'low': 0.70}[
                signals.get('readiness_level', 'moderate')]
    lo, hi   = spec['duration_min_lo'], spec['duration_min_hi']
    duration = int(max(lo, min(hi, ((lo + hi) / 2) * scale)))
    zone     = spec['max_zone']
    if signals.get('fatigue_index') and signals['fatigue_index'] > 1.0:
        zone = min(zone, 2)
    if signals.get('hr_decoupling_recent') and signals['hr_decoupling_recent'] > 5.0:
        zone = min(zone, 2)
    return {'session_type_key': spec['type_key'], 'zone': zone,
            'duration_min': duration,
            'structure_note': spec.get('structure_note', ''),
            'purpose': spec.get('purpose', '')}
```

**Plan context addendum to §9 output contract:**

```typescript
plan_context: {
  active:            boolean;
  plan_type_key:     string | null;
  phase:             'base'|'build'|'peak'|'taper' | null;
  week_number:       number | null;
  weeks_to_race:     number | null;
  target_volume_km:  number | null;
  volume_done_km:    number | null;
  easy_pct_actual:   number | null;
  easy_pct_target:   number | null;
  quality_done:      number | null;
  quality_target:    number | null;
  today_planned:     string | null;   // session_type_key
  strength_phase:    string | null;
} | null;
```

---

### 14.11 Plan Lifecycle

**Creation:** `POST /api/v1/training/plan`

```python
class CreatePlanRequest(BaseModel):
    competition_id:   int
    target_time_min:  int | None       # None = finish goal
    plan_start_date:  date | None      # None = today
    weakness_focus:   list[str] | None # shifts quality type priority in base phase

class PlanResponse(BaseModel):
    plan_id:  int
    summary:  str       # "18-week marathon plan: Base 7w → Build 5w → Peak 3w → Taper 3w"
    lrp:      list[dict]   # Long-Range Plan: one entry per phase with TID targets
    weeks:    list[dict]   # training_plan_weeks rows
```

**Revision triggers (automated, background):**

| Trigger | Action |
|---------|--------|
| Race date changes | Recalculate remaining phase weeks; preserve phase fractions |
| HRV suppressed ≥ 3 consecutive days in build/peak | Insert recovery week; notify user |
| `injury_note` in `daily_readiness` | Pause plan; prompt manual resume |
| New plan created | Auto-abandon previous active plan (history preserved) |

**Multi-race macrocycle (V2 note):** `competitions` already stores A/B/C priority races. V2 sequences multiple training peaks across the season. No additional tables needed; the schema supports it.

---

## 15. Race-Free (Open-Ended) Training Mode

When a user has no planned race (`competition_id IS NULL` or no A-priority `competitions` row), the plan runs in `open_ended` mode. The architecture is identical — the session source, TID guardrail, safety gates, and strength blocks are unchanged. What differs is the **phase structure**: there is no peak or taper. The athlete cycles through a perpetual base → build mesocycle until they set a race goal.

### 15.1 Open-Ended Plan Structure

```python
def generate_open_ended_plan(
    tier:            str,
    mesocycle_weeks: int,    # from plan_goal_tiers
    start_volume_km: float,
    peak_volume_km:  float,
    goal:            str,    # 'athlete' | 'strength' | 'hypertrophy'
) -> dict:
    # Generate 16 weeks of rolling base→build, repeating indefinitely.
    # The plan auto-extends: when the last week is consumed, generate the next 16.
    phases = [
        {'phase': 'base',  'weeks': 8, 'easy_pct': 0.82, 'quality_sessions': 1 if tier in ('beginner','recreational') else 2},
        {'phase': 'build', 'weeks': 8, 'easy_pct': 0.77, 'quality_sessions': 2},
    ]
    # No peak. No taper. Cycle repeats.
    volumes = assign_weekly_volumes(phases, start_volume_km, peak_volume_km * 0.80, mesocycle_weeks)
    # Volume ceiling: 80% of tier's peak_km. Athletes without a race goal
    # should not attempt peak-phase volumes without a race to absorb them.
    return {'phases': phases, 'volumes': volumes, 'plan_mode': 'open_ended'}
```

**Open-ended TID targets (no polarized peak phase):**

| Phase | Z1–Z2 | Z3 | Z4–Z5 |
|-------|-------|----|-------|
| Base (rolling) | 80–85% | 10–15% | < 5% neuromuscular |
| Build (rolling) | 75–80% | 5–10% | 15–20% |

Volume ceiling at 80% of tier peak prevents athletes from accumulating race-phase loads without the structured taper that absorbs them. The system flags if CTL approaches the ceiling and the athlete has no race scheduled, recommending they either set a goal race or hold volume.

### 15.2 Transitioning to Race-Anchored Mode

When the user adds an A-priority race:
1. Compute `weeks_to_race = (event_date - today).days // 7`
2. Determine what phase the athlete should be in given remaining time (work backward from race date using phase fractions)
3. If the athlete's current volume is below the appropriate phase's target: the plan enters an accelerated base phase to close the gap, subject to the 10%/week ramp cap `[4]`
4. Generate a full `race_anchored` plan; auto-abandon the open-ended plan

```python
def transition_to_race_anchored(
    current_ctl:     float,
    weeks_to_race:   int,
    plan_type_key:   str,
    tier:            str,
    target_time_min: int | None,
) -> dict:
    tier_data    = classify_goal(plan_type_key, target_time_min)
    plan_weeks   = min(weeks_to_race, tier_data['plan_total_weeks'])
    start_volume = safe_start_volume_km(current_ctl, tier_data['peak_km_per_week'])
    phases       = compute_phase_schedule(plan_type_key, tier, plan_weeks)
    volumes      = assign_weekly_volumes(phases, start_volume,
                                         tier_data['peak_km_per_week'],
                                         tier_data['mesocycle_weeks'])
    return {'plan_mode': 'race_anchored', 'phases': phases, 'volumes': volumes}
```

### 15.3 No Plan at All (Cold Start or Explicit Choice)

Some users never want a structured plan. The ad-hoc path (§5.2) remains fully functional without any `training_plans` row. The daily recommendation is driven entirely by HRV + readiness + CTL/TSB. This is a valid mode — not a degraded state. Surface it clearly in the UI: "You're in free-training mode. Add a race goal to get a structured plan."

---

## 16. Injury Management Protocol

**Legal reminder (§0):** The system does not diagnose injuries or provide medical advice. All injury-state recommendations are load-management framing. Any session involving pain requires medical assessment.

### 16.1 Injury States

Injury is modelled as a state machine on `training_plans.training_state`. Transitions are user-initiated (logging injury, clearing it) or signal-triggered (Gate 5 fire for ≥ 3 consecutive days).

```
active ──► injured ──► cross_training ──► return_to_run ──► active
               │                                                 ▲
               └─────────────── (severe: skip cross_training) ──┘
```

| State | Description | Session source |
|-------|-------------|----------------|
| `active` | Normal training | Plan template or ad-hoc (§5, §14) |
| `injured` | Acute phase; no weight-bearing on affected area | Mobility only (Gate 5 extended) |
| `cross_training` | Sub-acute; weight-bearing cleared; aerobic alternative | Cross-training session catalog |
| `return_to_run` | Cleared to run; progressive volume rebuild | Return protocol (§16.4) |

### 16.2 Injury Severity Classification

```python
INJURY_SEVERITY_PARAMS: dict[str, dict] = {
    'minor': {
        'min_rest_days':      2,
        'cross_training_ok':  True,
        'return_protocol':    'accelerated',   # 4-week rebuild
        'volume_return_pct':  0.60,            # start at 60% of pre-injury volume
    },
    'moderate': {
        'min_rest_days':      7,
        'cross_training_ok':  True,
        'return_protocol':    'standard',      # 6-week rebuild
        'volume_return_pct':  0.50,
    },
    'severe': {
        'min_rest_days':      14,
        'cross_training_ok':  False,           # no aerobic alternative — full rest
        'return_protocol':    'conservative',  # 8-week rebuild
        'volume_return_pct':  0.40,
    },
}

def classify_injury(
    severity:            str,           # user-reported: 'minor' | 'moderate' | 'severe'
    affected_activities: list[str],     # user-reported: ['running'] or ['running','cycling']
    cross_training_ok:   bool,
) -> dict:
    params = INJURY_SEVERITY_PARAMS[severity]
    params['cross_training_ok'] = cross_training_ok and params['cross_training_ok']
    return params
```

Severity is **user-reported** at injury logging. The system does not infer severity from signals — that would be medical assessment. The user selects from: "Minor (soreness/tightness)", "Moderate (pain during activity)", "Severe (pain at rest / can't bear weight)".

### 16.3 Cross-Training Session Types

Add the following to `session_type_catalog` for the `cross_training` state. These share the same zone framework — the recommendation engine works identically.

| type_key | min/max zone | duration (min) | recovery_days | notes |
|----------|-------------|----------------|--------------|-------|
| `pool_running` | 1/3 | 30–60 | 0 | Aqua jogging — zero impact; preserves aerobic fitness fully |
| `cycling_easy` | 1/2 | 30–75 | 0 | Low impact; aerobic base maintenance |
| `cycling_tempo` | 3/4 | 40–60 | 1 | Moderate impact; threshold maintenance |
| `elliptical` | 1/3 | 30–60 | 0 | Moderate impact; closer to running mechanics than cycling |
| `mobility_only` | 1/1 | 15–30 | 0 | Gate 5 state or severe injury; no aerobic load |

**Activity selection by injury type (default mapping; user can override):**

```python
CROSS_TRAINING_ACTIVITY_MAP: dict[str, list[str]] = {
    # injury_type keyword → recommended cross-training session types
    'achilles':    ['pool_running', 'cycling_easy'],
    'knee':        ['pool_running', 'cycling_easy', 'elliptical'],
    'shin_splints':['pool_running', 'cycling_easy'],
    'stress_fx':   ['pool_running'],                # cycling contraindicated for femur/tibia
    'hip':         ['pool_running', 'cycling_easy'],
    'ankle':       ['pool_running', 'cycling_easy'],
    'hamstring':   ['pool_running', 'cycling_easy'],
    'back':        ['pool_running', 'elliptical'],
    'upper_body':  ['easy_run', 'tempo_run'],        # no running blocks; full running allowed
}
# Default (unknown injury_type): pool_running + cycling_easy
```

When `training_state == 'cross_training'`, `get_planned_session_for_today()` draws from this map instead of `plan_session_templates`. The TID guardrail, readiness scaling, and safety gates apply unchanged.

### 16.4 Return-to-Running Protocol

Triggered when the user marks the injury as cleared (`injuries.cleared_by_user = TRUE`). The system:

1. Computes how much CTL has decayed during the injury period
2. Sets `return_volume_pct` as the starting volume
3. Generates a return sub-plan (no race-phase sessions; base only until CTL recovers)

```python
def compute_return_volume(
    pre_injury_ctl:   float,
    injury_days:      int,
    return_protocol:  str,   # 'accelerated' | 'standard' | 'conservative'
) -> dict:
    TAU_CTL = 42.0
    # CTL decays exponentially during injury (no TRIMP input)
    decayed_ctl = pre_injury_ctl * exp(-injury_days / TAU_CTL)
    pct = INJURY_SEVERITY_PARAMS[{
        'accelerated': 'minor',
        'standard':    'moderate',
        'conservative':'severe',
    }[return_protocol]]['volume_return_pct']

    return_volume_km = (decayed_ctl * 7 / 9.0) * pct   # CTL-implied × return fraction
    return {
        'decayed_ctl':       round(decayed_ctl, 1),
        'return_volume_km':  round(return_volume_km, 1),
        'return_protocol':   return_protocol,
        'rebuild_weeks':     {'accelerated': 4, 'standard': 6, 'conservative': 8}[return_protocol],
    }
```

**Return protocol rules:**
- Only `easy_run`, `active_recovery`, and `strides` (week 3+ only) during the rebuild period
- Volume increases at 10% per week maximum (same Soligard cap `[4]`)
- No quality sessions (Z3+) until decayed CTL recovers to ≥ 70% of pre-injury CTL
- No strength (lower body) in the first two return weeks; upper body allowed
- After rebuild weeks: `training_state` → `active`; resume plan from current phase (do not attempt to "catch up" to where the plan would have been)

**CTL recovery threshold:**

```python
def is_ready_for_quality(current_ctl: float, pre_injury_ctl: float) -> bool:
    return current_ctl >= pre_injury_ctl * 0.70
```

### 16.5 Plan Adaptation on Return

**Skipped weeks during injury:** When an injury is logged (`training_state → 'injured'`), all `training_plan_weeks` rows whose `week_start_date` falls on or after the injury start date are marked `status = 'skipped'`. They are **not deleted** — the history is preserved for plan analytics and retrospective review. The `UNIQUE (plan_id, week_number)` constraint is not violated because no new rows are inserted at this point.

When `PATCH /api/v1/injuries/{id}/clear` fires, the return sub-plan weeks are inserted with new `week_number` values that continue from the last `scheduled` or `completed` week. The date range of the return weeks begins from today, which means there is no date overlap with the skipped weeks (skipped weeks have past dates; return weeks start now). Queries for the current week should always filter `status != 'skipped'` to avoid ambiguity.

```sql
-- Correct query: active week for today
SELECT * FROM training_plan_weeks
WHERE plan_id = :plan_id
  AND week_start_date <= :today
  AND week_end_date   >= :today
  AND status != 'skipped'
ORDER BY week_number DESC
LIMIT 1;
```

After the return rebuild, the plan does not resume from the original scheduled phase. It resumes from the phase appropriate for the athlete's **actual current CTL**, computed identically to the initial plan generation:

```python
def compute_resume_phase(
    current_ctl:   float,
    race_date:     date | None,
    plan_type_key: str,
    tier:          str,
) -> str:
    if race_date is None:
        return 'base'   # open-ended always returns to base
    weeks_remaining = (race_date - date.today()).days // 7
    phases = compute_phase_schedule(plan_type_key, tier, weeks_remaining)
    # Return the phase that the weeks_remaining maps to
    for p in reversed(phases):
        if weeks_remaining >= p['start_week']:
            return p['phase']
    return 'base'
```

If `weeks_remaining < 4` (race within 4 weeks): surface alert to user — insufficient time to properly taper given current CTL. Recommend downgrading to B-race participation or deferring.

### 16.6 Injury API

**New endpoints:**

```
POST /api/v1/injuries                  — log a new injury
PATCH /api/v1/injuries/{id}/clear      — mark injury resolved; triggers return_to_run
GET  /api/v1/injuries                  — list injury history
```

```python
class LogInjuryRequest(BaseModel):
    injury_type:         str              # free text: 'achilles tendinopathy', etc.
    severity:            Literal['minor','moderate','severe']
    affected_activities: list[str] | None  # None = system infers from injury_type
    notes:               str | None

class ClearInjuryRequest(BaseModel):
    end_date: date   # date cleared by user (may be retrospective)
```

On `POST /api/v1/injuries`:
- Insert into `injuries` table
- Set `training_plans.training_state = 'injured'` (or `'cross_training'` if severity != 'severe')
- Pause active plan (plan is not abandoned — weeks resume on clearance)
- Emit alert: injury logged, plan paused, cross-training recommendations active

On `PATCH /api/v1/injuries/{id}/clear`:
- Set `injuries.cleared_by_user = TRUE`, `injuries.end_date = today`
- Compute `return_volume_pct` via `compute_return_volume()`
- Set `training_plans.training_state = 'return_to_run'`
- Generate return sub-plan weeks and prepend them to the existing `training_plan_weeks`

### 16.7 Recommendation Behaviour by Training State

```python
def get_session_source(
    training_state: str,
    plan_context:   dict | None,
    injury:         dict | None,
) -> str:   # 'plan' | 'open_ended' | 'cross_training' | 'return_to_run' | 'ad_hoc'

    if training_state == 'injured':
        return 'cross_training' if injury and injury['cross_training_ok'] else 'mobility_only'
    if training_state == 'cross_training':
        return 'cross_training'
    if training_state == 'return_to_run':
        return 'return_to_run'
    if plan_context and plan_context.get('plan_mode') == 'race_anchored':
        return 'plan'
    if plan_context and plan_context.get('plan_mode') == 'open_ended':
        return 'open_ended'
    return 'ad_hoc'
```

All sources feed into the same `adapt_session_to_signals()` and `build_recommendation()` pipeline. The source determines *what session type is proposed*. The adaptation logic, TID guardrail, safety gates, and output contract are identical for every source.

---

## Appendix — Scientific References

| # | Citation | Used in |
|---|----------|---------|
| 1 | Banister, E.W. (1991). Modeling elite athletic performance. *Physiological Testing of Elite Athletes.* Human Kinetics. | TRIMP sex coefficients |
| 2 | Morton, R.H. et al. (1990). Modeling human performance in running. *J Appl Physiol*, 69(3), 1171–1177. | IR model; τ priors |
| 3 | Clarke, D.C. & Skiba, P.F. (2012). Rationale for teaching IR modeling. *Adv Physiol Educ*, 37, 134–152. | ATL/CTL/TSB as operational approximation |
| 4 | Soligard, T. et al. (2016). IOC consensus on load and injury risk. *Br J Sports Med*, 50, 1030–1041. | ACWR thresholds; ramp rate |
| 5 | Plews, D.J. et al. (2012). HRV in elite triathletes. *Eur J Appl Physiol*, 112, 3729. | HRV z-score thresholds |
| 6 | Kiviniemi, A.M. et al. (2007). Individual-guided training by HRV. *Eur J Appl Physiol*, 101, 743. | HRV classification |
| 7 | Halson, S.L. (2014). Monitoring training load to understand fatigue. *Sports Med*, 44(S2), 139–147. | HR:RPE dissociation; signal inventory |
| 8 | Sims, S.T. & Heather, A.K. (2018). Myths and methodologies: OCP and athlete performance. *Exp Physiol*, 103(9), 1177–1179. | OCP attenuation of phase effects |
| 9 | Meeusen, R. et al. (2012). Overtraining Syndrome. *ECSS/ACSM Consensus.* | Alert severity tiers |
| 10 | Weldon, A. et al. (2021). S&C practices in professional soccer. *Biology of Sport*, 38(3), 377–390. | 48h pre-competition rule; elite benchmarks |
| 11 | Schumann, M. et al. (2022). Concurrent training. SportRxiv preprint. | 3h same-session rule; SMD −0.28 |
| 12 | Halperin, I. et al. (2021). RIR accuracy meta-analysis. SportRxiv. | Autoregulation via load_feel |
| 13 | Silva, D.G. et al. (2022). Bar velocity loss perception. SportRxiv. | VBT 15–30% zone; load_feel as proxy |
| 14 | McNulty, K.L. et al. (2020). Menstrual cycle and exercise performance. *Sports Med*, 50, 1813. | Phase modifiers; follicular = peak |
| 15 | Williams, T. et al. (2011). ACL risk across menstrual cycle. Review. | Ovulation ACL flag |
| 16 | Kraemer, W.J. & Ratamess, N.A. (2004). Fundamentals of resistance training. *Med Sci Sports Exerc*, 36(4), 674. | 8 acute variables; loading zones; sequencing |
| 17 | Häkkinen, K. et al. (2004). Neuromuscular adaptations — in-season strength maintenance. | 2 sets sufficient for maintenance |
| 18 | Swinton, P.A. et al. (2021). Bayesian S&C effect sizes. SportRxiv DOI:10.51224/SRXIV.9. | SMD thresholds replacing Cohen's d |
| 19 | Tanaka, H. et al. (2001). Age-predicted max HR revisited. *JACC*, 37(1), 153. | MAX_HR formula |
| 20 | Willardson, J.M. (2006). Rest interval length review. *J Strength Cond Res*, 20(4), 978. | Muscle group recovery time ranges |
| 21 | Häkkinen, K. & Häkkinen, A. (1988). Neuromuscular adaptations in trained athletes. *J Sports Sci*, 6(2). | Lower body recovery; hormonal responses |
| 22 | Holmes, C. (2023). Macrocycles, mesocycles, and microcycles. *TrainingPeaks.com*. | Periodization phase structure; mesocycle length guidance |
| 23 | Koop, J. (2022). Long-range planning for ultrarunning. *TrainRight / CTS*. | Bookends principle; VO2max placement in base; ultra-specific build emphasis |
| 24 | Sperlich, B. & Stöggl, T. (2015). The training intensity distribution among well-trained and elite endurance athletes. *Front Physiol*, 6, 295. | 75–85% Z1–Z2 target range; time-based TID measurement; pyramidal vs polarized shift |
| 25 | Fitzgerald, M. (2014). *80/20 Running*. Rodale. | 80/20 as population optimum; moderate-intensity trap; beginner TID importance |
| 26 | Fitzgerald, J. (2019). Periodization for runners: how to use mesocycles to train smarter. *StrengthRunning.com*. | Linear vs nonlinear models; mesocycle 4–6 week range; Lydiard/Canova; tier-agnostic session types |
| 27 | Fitzgerald, J. (2018). The three goals of base training. *StrengthRunning.com*. | Endurance + neuromuscular + GPP triad; strides as base-phase tool; hill sprints in base |
| 28 | Tsatsouline, P. & Contreras, B. (2014). Neuroscience, motor learning, and strength training. *Strength & Cond J*, 36(5), 100–104. | CNS cost concept; explosive movement sequencing first |
| 29 | Damas, F. et al. (2016). Resistance training-induced changes in integrated myofibrillar protein synthesis. *J Physiol*, 594(18), 5209. | Local fatigue cost distinct from CNS cost; muscle damage peaks at novel/eccentric exercises |
| 30 | Kumar, T.K. (1992). Multivariate analysis in constraint satisfaction. *IEEE Trans SMC*. | CSP framing reference for exercise selection system |
