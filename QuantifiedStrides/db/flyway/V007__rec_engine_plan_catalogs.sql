-- Rec Engine v2.0 Schema Foundation — Part 2
-- Plan type catalog, goal tiers, phase structure, session type catalog,
-- weekly templates (with parity trigger), and strength phase catalog.
-- Frozen: do NOT edit after first apply. Add V009+ for future changes.

-- ── Plan type catalog ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_types (
  plan_type_key  VARCHAR(50) PRIMARY KEY,
  display_name   VARCHAR(100) NOT NULL,
  sport_category VARCHAR(30)  NOT NULL,
  enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  notes          TEXT
);

-- ── Goal tier parameters ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_goal_tiers (
  id                        SERIAL PRIMARY KEY,
  plan_type_key             VARCHAR(50) NOT NULL REFERENCES plan_types(plan_type_key),
  tier                      VARCHAR(20) NOT NULL,
  max_time_min              INT,
  peak_km_per_week          FLOAT,
  plan_total_weeks          INT NOT NULL,
  min_runs_per_week         SMALLINT NOT NULL DEFAULT 4,
  max_runs_per_week         SMALLINT NOT NULL DEFAULT 6,
  quality_sessions_per_week SMALLINT NOT NULL DEFAULT 2,
  mesocycle_weeks           SMALLINT NOT NULL DEFAULT 4,
  UNIQUE (plan_type_key, tier)
);

-- ── Strength phase catalog ────────────────────────────────────────────────────
-- Must precede plan_type_phases FK reference.
CREATE TABLE IF NOT EXISTS strength_phase_catalog (
  phase_key       VARCHAR(20) PRIMARY KEY,
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
   'Neural activation only — two sets sufficient for strength retention. [17] Häkkinen et al. 2004.')
ON CONFLICT (phase_key) DO NOTHING;

-- ── Phase structure per plan type + tier ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_type_phases (
  id                 SERIAL PRIMARY KEY,
  plan_type_key      VARCHAR(50) NOT NULL REFERENCES plan_types(plan_type_key),
  tier               VARCHAR(20) NOT NULL,
  phase              VARCHAR(10) NOT NULL,
  phase_fraction     FLOAT NOT NULL,
  easy_pct           FLOAT NOT NULL,
  quality_sessions   SMALLINT NOT NULL,
  strength_phase_key VARCHAR(20) REFERENCES strength_phase_catalog(phase_key),
  UNIQUE (plan_type_key, tier, phase)
);

-- ── Session type catalog ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_type_catalog (
  type_key          VARCHAR(50) PRIMARY KEY,
  display_name      VARCHAR(100) NOT NULL,
  min_zone          SMALLINT NOT NULL,
  max_zone          SMALLINT NOT NULL,
  duration_min_lo   INT NOT NULL,
  duration_min_hi   INT NOT NULL,
  recovery_days     SMALLINT NOT NULL DEFAULT 0,
  max_per_week      SMALLINT NOT NULL DEFAULT 1,
  purpose           TEXT,
  structure_note    TEXT,
  applicable_phases TEXT[] NOT NULL
);

-- ── Weekly session templates ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_session_templates (
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

-- Enforce parity exclusivity: a slot uses EITHER 'any' OR the odd/even pair, never both.
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

-- ── Strength phase exercises ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS strength_phase_exercises (
  id          SERIAL PRIMARY KEY,
  phase_key   VARCHAR(20) NOT NULL REFERENCES strength_phase_catalog(phase_key),
  exercise_id INT NOT NULL REFERENCES exercises(exercise_id),
  priority    SMALLINT NOT NULL DEFAULT 5,
  notes       TEXT,
  UNIQUE (phase_key, exercise_id)
);
