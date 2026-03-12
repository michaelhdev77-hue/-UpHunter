-- Multi-account migration: add user_id columns to existing tables
-- This runs on first init. For existing deployments, run manually against each DB.

-- auth_db: add user_id to team_profiles
\c auth_db
ALTER TABLE team_profiles ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
CREATE INDEX IF NOT EXISTS ix_team_profiles_user_id ON team_profiles(user_id);
-- Backfill existing profiles to user_id=1
UPDATE team_profiles SET user_id = 1 WHERE user_id IS NULL;

-- analytics_db: add user_id to funnel_events
\c analytics_db
ALTER TABLE funnel_events ADD COLUMN IF NOT EXISTS user_id INTEGER;
CREATE INDEX IF NOT EXISTS ix_funnel_events_user_id ON funnel_events(user_id);
