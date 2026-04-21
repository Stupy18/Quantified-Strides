ALTER TABLE injuries
    ADD CONSTRAINT injuries_severity_check
    CHECK (severity IN ('mild', 'moderate', 'severe', 'critical'));
