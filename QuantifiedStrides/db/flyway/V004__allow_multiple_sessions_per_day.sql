-- Allow multiple strength sessions per day per user
ALTER TABLE strength_sessions DROP CONSTRAINT strength_sessions_user_id_session_date_key;
