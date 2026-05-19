-- Rec Engine v2.0 Schema Foundation — Part 1
-- User profile extensions, workout signal columns, movement patterns,
-- exercise ontology, and injuries extensions.
-- Frozen: do NOT edit after first apply. Add V007+ for future changes.

-- ── user_profile additions ────────────────────────────────────────────────────
ALTER TABLE user_profile
  ADD COLUMN IF NOT EXISTS training_status  VARCHAR(20) NOT NULL DEFAULT 'recreational'
    CHECK (training_status IN ('untrained','recreational','trained','elite')),
  ADD COLUMN IF NOT EXISTS sex              VARCHAR(20) NOT NULL DEFAULT 'prefer_not_to_say'
    CHECK (sex IN ('male','female','prefer_not_to_say')),
  ADD COLUMN IF NOT EXISTS date_of_birth    DATE,
  ADD COLUMN IF NOT EXISTS max_hr           SMALLINT CHECK (max_hr BETWEEN 100 AND 230),
  ADD COLUMN IF NOT EXISTS max_hr_source    VARCHAR(20)
    CHECK (max_hr_source IN ('data_99th_pct','tanaka_formula','manual')),
  ADD COLUMN IF NOT EXISTS zone_speeds      JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS hormonal_contraception BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hrv_baseline_mean FLOAT,
  ADD COLUMN IF NOT EXISTS hrv_baseline_sd   FLOAT;

-- ── Workout signal columns ────────────────────────────────────────────────────
ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS trimp                   FLOAT,
  ADD COLUMN IF NOT EXISTS terrain_type            VARCHAR(10),
  ADD COLUMN IF NOT EXISTS fatigue_index           FLOAT,
  ADD COLUMN IF NOT EXISTS hr_stability_last_10min FLOAT;

-- ── Movement pattern catalog ──────────────────────────────────────────────────
-- Must precede exercises.primary_pattern FK reference.
CREATE TABLE IF NOT EXISTS movement_patterns (
  pattern_key         VARCHAR(30) PRIMARY KEY,
  display_name        VARCHAR(100),
  fatigue_decay_tau_h FLOAT NOT NULL DEFAULT 48.0,
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
  ('ISOLATION',       'Isolation',         24.0)
ON CONFLICT (pattern_key) DO NOTHING;

-- ── Exercise ontology columns ─────────────────────────────────────────────────
-- equipment, skill_level, bilateral already exist in V001; IF NOT EXISTS skips them.
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS primary_pattern     VARCHAR(30)
    REFERENCES movement_patterns(pattern_key),
  ADD COLUMN IF NOT EXISTS secondary_patterns  VARCHAR(30)[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS equipment           VARCHAR(20)[] NOT NULL DEFAULT '{}',
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

-- ── Injuries extensions ───────────────────────────────────────────────────────
-- severity already exists in V001; IF NOT EXISTS skips it.
ALTER TABLE injuries
  ADD COLUMN IF NOT EXISTS severity            VARCHAR(10)
    CHECK (severity IN ('minor','moderate','severe')),
  ADD COLUMN IF NOT EXISTS affected_activities TEXT[],
  ADD COLUMN IF NOT EXISTS cross_training_ok   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS cleared_by_user     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS return_volume_pct   FLOAT;
