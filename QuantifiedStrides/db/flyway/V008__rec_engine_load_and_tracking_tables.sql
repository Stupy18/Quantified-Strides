-- Rec Engine v2.0 Schema Foundation — Part 3
-- Precomputed load, competition calendar, menstrual cycles, biomechanics
-- baselines, 1RM cache, exercise relationships, pattern fatigue ledger,
-- exercise session log, training plans, and training plan weeks.
-- Frozen: do NOT edit after first apply. Add V009+ for future changes.

-- ── Precomputed training load (one row per user per day) ──────────────────────
CREATE TABLE IF NOT EXISTS training_load_daily (
  load_id     SERIAL PRIMARY KEY,
  user_id     INT  NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  load_date   DATE NOT NULL,
  atl         FLOAT NOT NULL,
  ctl         FLOAT NOT NULL,
  tsb         FLOAT NOT NULL,
  acwr        FLOAT,
  ramp_rate   FLOAT,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, load_date)
);

-- ── Competition calendar ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS competitions (
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

-- ── Menstrual cycle log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menstrual_cycles (
  cycle_id               SERIAL PRIMARY KEY,
  user_id                INT      NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  start_date             DATE     NOT NULL,
  predicted_cycle_length SMALLINT,
  actual_cycle_length    SMALLINT,
  source                 VARCHAR(10) NOT NULL DEFAULT 'manual'
    CHECK (source IN ('garmin','manual','predicted')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, start_date)
);

-- ── Per-athlete biomechanics baselines (terrain-stratified) ──────────────────
CREATE TABLE IF NOT EXISTS biomechanics_baselines (
  baseline_id          SERIAL PRIMARY KEY,
  user_id              INT         NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  terrain_type         VARCHAR(10) NOT NULL CHECK (terrain_type IN ('road','trail')),
  cadence_slope        FLOAT,
  cadence_intercept    FLOAT,
  cadence_r2           FLOAT,
  gct_mean_ms          FLOAT,
  gct_sd_ms            FLOAT,
  vertical_ratio_mean  FLOAT,
  vertical_ratio_sd    FLOAT,
  sessions_used        SMALLINT,
  computed_at          DATE NOT NULL,
  UNIQUE (user_id, terrain_type)
);

-- ── 1RM estimate cache ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_1rm_cache (
  cache_id      SERIAL PRIMARY KEY,
  user_id       INT   NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  exercise_id   INT   NOT NULL REFERENCES exercises(exercise_id) ON DELETE CASCADE,
  estimated_1rm FLOAT NOT NULL,
  source_weight FLOAT NOT NULL,
  source_reps   SMALLINT NOT NULL,
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, exercise_id)
);

-- ── Exercise relationship graph ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exercise_relationships (
  relationship_id   SERIAL PRIMARY KEY,
  exercise_a_id     INT NOT NULL REFERENCES exercises(exercise_id),
  exercise_b_id     INT NOT NULL REFERENCES exercises(exercise_id),
  relationship_type VARCHAR(30) NOT NULL
    CHECK (relationship_type IN ('SUBSTITUTES','PROGRESSES_TO','REGRESSES_TO','FATIGUES_SAME','ANTAGONIST')),
  notes             TEXT,
  UNIQUE (exercise_a_id, exercise_b_id, relationship_type)
);

-- ── Pattern fatigue ledger ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pattern_fatigue_ledger (
  ledger_id     SERIAL PRIMARY KEY,
  user_id       INT  NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  pattern_key   VARCHAR(30) NOT NULL REFERENCES movement_patterns(pattern_key),
  session_date  DATE NOT NULL,
  fatigue_units FLOAT NOT NULL,
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, pattern_key, session_date)
);

-- ── Exercise session log ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exercise_session_log (
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

-- ── Training plan instances ───────────────────────────────────────────────────
-- strength_goal and goal_weights included inline to avoid two DDL ops on a new table.
CREATE TABLE IF NOT EXISTS training_plans (
  plan_id         SERIAL PRIMARY KEY,
  user_id         INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  competition_id  INT REFERENCES competitions(competition_id) ON DELETE SET NULL,
  plan_type_key   VARCHAR(50) NOT NULL REFERENCES plan_types(plan_type_key),
  tier            VARCHAR(20),
  target_time_min INT,
  plan_start_date DATE NOT NULL,
  race_date       DATE,
  peak_volume_km  FLOAT,
  weakness_focus  TEXT[],
  plan_mode       VARCHAR(20) NOT NULL DEFAULT 'race_anchored'
                    CHECK (plan_mode IN ('race_anchored','open_ended')),
  training_state  VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (training_state IN ('active','injured','cross_training','return_to_run')),
  status          VARCHAR(10) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','completed','abandoned')),
  strength_goal   VARCHAR(20) NOT NULL DEFAULT 'sport_support'
                    CHECK (strength_goal IN ('strength','hypertrophy','sport_support','combination')),
  goal_weights    JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active plan per user.
CREATE UNIQUE INDEX IF NOT EXISTS training_plans_one_active_per_user
  ON training_plans (user_id) WHERE status = 'active';

-- ── Training plan weeks ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_plan_weeks (
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
