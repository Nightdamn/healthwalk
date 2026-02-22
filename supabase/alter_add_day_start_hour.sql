-- Run this if you already have the tables from the previous migration
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS day_start_hour INTEGER NOT NULL DEFAULT 5
  CHECK (day_start_hour BETWEEN 0 AND 23);
