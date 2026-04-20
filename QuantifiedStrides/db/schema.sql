-- QuantifiedStrides PostgreSQL Schema
-- Run against a fresh database:
--   Get-Content schema.sql | docker exec -i quantifiedstrides_db psql -U quantified -d quantifiedstrides

-- Required extension for RAG embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- Users & Auth
-- ---------------------------------------------------------------------------

CREATE TABLE users (
    user_id            SERIAL PRIMARY KEY,
    name               VARCHAR(100),
    date_of_birth      DATE,
    email              VARCHAR(255) UNIQUE,
    password_hash      VARCHAR(255),
    email_verified     BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(255),
    created_at         TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_profile (
    user_id          INT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    goal             VARCHAR(20) NOT NULL DEFAULT 'athlete' CHECK (goal IN (
                         'athlete', 'strength', 'hypertrophy',
                         'bodybuilding', 'powerlifting')),
    gym_days_week    INT NOT NULL DEFAULT 3 CHECK (gym_days_week BETWEEN 2 AND 6),
    primary_sports   JSONB DEFAULT '{}',
    garmin_email     VARCHAR(255),
    garmin_password  VARCHAR(255)
);

-- ---------------------------------------------------------------------------
-- Workouts (core fields only; bio, power, and zone data in satellite tables)
-- ---------------------------------------------------------------------------

CREATE TABLE workouts (
    workout_id                  SERIAL PRIMARY KEY,
    user_id                     INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    sport                       VARCHAR(50),
    start_time                  TIMESTAMP,
    end_time                    TIMESTAMP,
    workout_type                VARCHAR(100),
    calories_burned             INT,
    avg_heart_rate              INT,
    max_heart_rate              INT,
    vo2max_estimate             FLOAT,
    lactate_threshold_bpm       INT,
    distance_m                  FLOAT,
    avg_cadence                 FLOAT,
    location                    VARCHAR(100),
    start_latitude              FLOAT,
    start_longitude             FLOAT,
    workout_date                DATE,
    elevation_gain              FLOAT,
    elevation_loss              FLOAT,
    aerobic_training_effect     FLOAT,
    anaerobic_training_effect   FLOAT,
    total_steps                 INT,
    garmin_activity_id          BIGINT,
    primary_benefit             VARCHAR(50),
    training_load_score         FLOAT,
    avg_respiration_rate        FLOAT,
    max_respiration_rate        FLOAT,
    UNIQUE (user_id, start_time)
);

CREATE UNIQUE INDEX idx_workouts_garmin_id
    ON workouts(garmin_activity_id)
    WHERE garmin_activity_id IS NOT NULL;

CREATE INDEX idx_workouts_user_date
    ON workouts(user_id, workout_date DESC);

-- ---------------------------------------------------------------------------
-- HR zones (normalised; supports 3–6 zone configs)
-- ---------------------------------------------------------------------------

CREATE TABLE workout_hr_zones (
    workout_id  INT NOT NULL REFERENCES workouts(workout_id) ON DELETE CASCADE,
    zone        SMALLINT NOT NULL CHECK (zone BETWEEN 1 AND 6),
    seconds     INT,
    PRIMARY KEY (workout_id, zone)
);

-- ---------------------------------------------------------------------------
-- Running biomechanics (running/trail_running workouts only)
-- ---------------------------------------------------------------------------

CREATE TABLE workout_run_biomechanics (
    workout_id               INT PRIMARY KEY
        REFERENCES workouts(workout_id) ON DELETE CASCADE,
    avg_vertical_oscillation FLOAT,
    avg_stance_time          FLOAT,
    avg_stride_length        FLOAT,
    avg_vertical_ratio       FLOAT,
    avg_running_cadence      FLOAT,
    max_running_cadence      FLOAT
);

-- ---------------------------------------------------------------------------
-- Power summary (cycling / power-meter workouts)
-- ---------------------------------------------------------------------------

CREATE TABLE workout_power_summary (
    workout_id            INT PRIMARY KEY
        REFERENCES workouts(workout_id) ON DELETE CASCADE,
    normalized_power      FLOAT,
    avg_power             FLOAT,
    max_power             FLOAT,
    training_stress_score FLOAT
);

-- ---------------------------------------------------------------------------
-- Workout metrics (time-series)
-- ---------------------------------------------------------------------------

CREATE TABLE workout_metrics (
    metric_id                SERIAL PRIMARY KEY,
    workout_id               INT NOT NULL REFERENCES workouts(workout_id) ON DELETE CASCADE,
    metric_timestamp         TIMESTAMP,
    heart_rate               INT,
    pace                     FLOAT,
    cadence                  FLOAT,
    vertical_oscillation     FLOAT,
    vertical_ratio           FLOAT,
    stance_time              FLOAT,
    power                    FLOAT,
    latitude                 FLOAT,
    longitude                FLOAT,
    altitude                 FLOAT,
    distance                 FLOAT,
    gradient_pct             FLOAT,
    stride_length            FLOAT,
    grade_adjusted_pace      FLOAT,
    body_battery             FLOAT,
    vertical_speed           FLOAT,
    speed_ms                 FLOAT,
    grade_adjusted_speed_ms  FLOAT,
    performance_condition    SMALLINT,
    respiration_rate         FLOAT,
    UNIQUE (workout_id, metric_timestamp)
);

CREATE INDEX idx_wm_workout_id ON workout_metrics(workout_id);

-- ---------------------------------------------------------------------------
-- Environment
-- ---------------------------------------------------------------------------

CREATE TABLE environment_data (
    env_id           SERIAL PRIMARY KEY,
    workout_id       INT REFERENCES workouts(workout_id) ON DELETE SET NULL,
    record_datetime  TIMESTAMP,
    record_date      DATE GENERATED ALWAYS AS (record_datetime::date) STORED,
    location         VARCHAR(100),
    temperature      FLOAT,
    wind_speed       FLOAT,
    wind_direction   FLOAT,
    humidity         FLOAT,
    precipitation    FLOAT,
    grass_pollen     FLOAT,
    tree_pollen      FLOAT,
    weed_pollen      FLOAT,
    uv_index         FLOAT,
    subjective_notes TEXT
);

CREATE INDEX idx_env_date     ON environment_data(record_date);
CREATE INDEX idx_env_datetime ON environment_data(record_datetime);

-- ---------------------------------------------------------------------------
-- Sleep
-- ---------------------------------------------------------------------------

CREATE TABLE sleep_sessions (
    sleep_id             SERIAL PRIMARY KEY,
    user_id              INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    sleep_date           DATE,
    duration_minutes     INT,
    sleep_score          FLOAT,
    hrv                  FLOAT,
    rhr                  INT,
    time_in_deep         INT,
    time_in_light        INT,
    time_in_rem          INT,
    time_awake           INT,
    avg_sleep_stress     FLOAT,
    sleep_score_feedback VARCHAR(100),
    sleep_score_insight  VARCHAR(100),
    overnight_hrv        FLOAT,
    hrv_status           VARCHAR(50),
    body_battery_change  INT,
    UNIQUE (user_id, sleep_date)
);

-- ---------------------------------------------------------------------------
-- Daily check-ins
-- ---------------------------------------------------------------------------

CREATE TABLE daily_readiness (
    readiness_id      SERIAL PRIMARY KEY,
    user_id           INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    entry_date        DATE NOT NULL,
    overall_feel      INT CHECK (overall_feel BETWEEN 1 AND 10),
    legs_feel         INT CHECK (legs_feel BETWEEN 1 AND 10),
    upper_body_feel   INT CHECK (upper_body_feel BETWEEN 1 AND 10),
    joint_feel        INT CHECK (joint_feel BETWEEN 1 AND 10),
    injury_note       TEXT,
    time_available    VARCHAR(10) CHECK (time_available IN ('short', 'medium', 'long')),
    going_out_tonight BOOLEAN,
    UNIQUE (user_id, entry_date)
);

CREATE TABLE workout_reflection (
    reflection_id   SERIAL PRIMARY KEY,
    user_id         INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    entry_date      DATE NOT NULL,
    session_rpe     INT CHECK (session_rpe BETWEEN 1 AND 10),
    session_quality INT CHECK (session_quality BETWEEN 1 AND 10),
    notes           TEXT,
    load_feel       SMALLINT CHECK (load_feel BETWEEN -2 AND 2),
    workout_id      INT REFERENCES workouts(workout_id) ON DELETE SET NULL,
    UNIQUE (user_id, entry_date)
);

-- ---------------------------------------------------------------------------
-- Exercise knowledge base (defined before strength_exercises so the FK works)
-- ---------------------------------------------------------------------------

CREATE TABLE exercises (
    exercise_id       SERIAL PRIMARY KEY,
    name              VARCHAR(200) NOT NULL UNIQUE,
    source            VARCHAR(20) DEFAULT 'wger' CHECK (source IN ('wger', 'custom')),
    movement_pattern  VARCHAR(20) CHECK (movement_pattern IN (
                          'push_h', 'push_v', 'pull_h', 'pull_v',
                          'hinge', 'squat', 'carry', 'rotation',
                          'plyo', 'isolation', 'stability')),
    quality_focus     VARCHAR(20) CHECK (quality_focus IN (
                          'power', 'strength', 'hypertrophy',
                          'endurance', 'stability')),
    primary_muscles   TEXT[],
    secondary_muscles TEXT[],
    equipment         TEXT[],
    skill_level       VARCHAR(15) CHECK (skill_level IN ('beginner', 'intermediate', 'advanced')),
    bilateral         BOOLEAN DEFAULT TRUE,
    contraction_type  VARCHAR(15) CHECK (contraction_type IN ('explosive', 'controlled', 'isometric', 'mixed')),
    systemic_fatigue  INT CHECK (systemic_fatigue BETWEEN 1 AND 5),
    cns_load          INT CHECK (cns_load BETWEEN 1 AND 5),
    joint_stress      JSONB DEFAULT '{}',
    sport_carryover   JSONB DEFAULT '{}',
    goal_carryover    JSONB DEFAULT '{}',
    notes             TEXT
);

CREATE TABLE exercise_progressions (
    progression_id   SERIAL PRIMARY KEY,
    from_exercise_id INT NOT NULL REFERENCES exercises(exercise_id),
    to_exercise_id   INT NOT NULL REFERENCES exercises(exercise_id),
    progression_type VARCHAR(10) CHECK (progression_type IN ('harder', 'easier', 'lateral')),
    goal_branch      VARCHAR(20) CHECK (goal_branch IN (
                         'power', 'strength', 'hypertrophy',
                         'endurance', 'stability')),
    notes            TEXT,
    UNIQUE (from_exercise_id, to_exercise_id, goal_branch)
);

-- ---------------------------------------------------------------------------
-- Strength training
-- ---------------------------------------------------------------------------

CREATE TABLE strength_sessions (
    session_id   SERIAL PRIMARY KEY,
    user_id      INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    session_date DATE NOT NULL,
    session_type VARCHAR(10) CHECK (session_type IN ('upper', 'lower')),
    raw_notes    TEXT,
    UNIQUE (user_id, session_date)
);

CREATE TABLE strength_exercises (
    exercise_id     SERIAL PRIMARY KEY,
    session_id      INT NOT NULL REFERENCES strength_sessions(session_id) ON DELETE CASCADE,
    exercise_order  INT NOT NULL,
    name            VARCHAR(200) NOT NULL,
    notes           TEXT,
    exercise_ref_id INT REFERENCES exercises(exercise_id) ON DELETE SET NULL
);

CREATE INDEX idx_str_ex_session_id
    ON strength_exercises(session_id);

CREATE INDEX idx_str_ex_ref_id
    ON strength_exercises(exercise_ref_id)
    WHERE exercise_ref_id IS NOT NULL;

CREATE TABLE strength_sets (
    set_id              SERIAL PRIMARY KEY,
    exercise_id         INT NOT NULL REFERENCES strength_exercises(exercise_id) ON DELETE CASCADE,
    set_number          INT NOT NULL,
    reps                INT,
    reps_min            INT,
    reps_max            INT,
    duration_seconds    INT,
    weight_kg           FLOAT,
    is_bodyweight       BOOLEAN DEFAULT FALSE,
    band_color          VARCHAR(50),
    per_hand            BOOLEAN DEFAULT FALSE,
    per_side            BOOLEAN DEFAULT FALSE,
    plus_bar            BOOLEAN DEFAULT FALSE,
    weight_includes_bar BOOLEAN DEFAULT FALSE,
    total_weight_kg     FLOAT
);

-- ---------------------------------------------------------------------------
-- Journal entries
-- ---------------------------------------------------------------------------

CREATE TABLE journal_entries (
    entry_id   SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, entry_date)
);

-- ---------------------------------------------------------------------------
-- RAG knowledge base (pgvector)
-- ---------------------------------------------------------------------------

CREATE TABLE knowledge_chunks (
    chunk_id   SERIAL PRIMARY KEY,
    source     VARCHAR(200),
    content    TEXT,
    embedding  vector(384)
);

CREATE INDEX ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Narrative cache
-- ---------------------------------------------------------------------------

CREATE TABLE narrative_cache (
    id         SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    date       DATE NOT NULL,
    cache_key  VARCHAR(32) NOT NULL,
    narrative  TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (user_id, date, cache_key)
);

-- ---------------------------------------------------------------------------
-- Nutrition & injuries (schema defined, no UI yet)
-- ---------------------------------------------------------------------------

CREATE TABLE nutrition_log (
    nutrition_id   SERIAL PRIMARY KEY,
    user_id        INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    ingestion_time TIMESTAMP,
    food_type      VARCHAR(200),
    total_calories INT,
    macros_carbs   FLOAT,
    macros_protein FLOAT,
    macros_fat     FLOAT,
    supplements    VARCHAR(200)
);

CREATE TABLE injuries (
    injury_id   SERIAL PRIMARY KEY,
    user_id     INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    start_date  DATE,
    end_date    DATE,
    injury_type VARCHAR(100),
    severity    VARCHAR(50),
    notes       TEXT
);
