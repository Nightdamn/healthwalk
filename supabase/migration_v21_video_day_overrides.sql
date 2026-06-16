-- v21: per-day overrides for individual videos, mirroring v20 for activities.
-- Trainer wants the same green-square calendar under each video so she can
-- pin/unpin specific days without touching first_day/last_day/interval_days.
ALTER TABLE activity_videos
  ADD COLUMN IF NOT EXISTS excluded_days INTEGER[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS extra_days    INTEGER[] NOT NULL DEFAULT '{}';
