-- Bind workout_reflection to a specific strength session instead of just a date.
-- Allows multiple reflections per day (one per session) while keeping the
-- legacy date-only path working for web app / Garmin workout reflections.

ALTER TABLE workout_reflection
    ADD COLUMN session_id INT REFERENCES strength_sessions(session_id) ON DELETE CASCADE;

-- Drop the blanket one-per-day constraint.
ALTER TABLE workout_reflection
    DROP CONSTRAINT workout_reflection_user_id_entry_date_key;

-- One reflection per strength session (mobile path).
CREATE UNIQUE INDEX uq_reflection_session
    ON workout_reflection (session_id)
    WHERE session_id IS NOT NULL;

-- One reflection per day when not session-bound (web / Garmin path).
CREATE UNIQUE INDEX uq_reflection_date
    ON workout_reflection (user_id, entry_date)
    WHERE session_id IS NULL;
