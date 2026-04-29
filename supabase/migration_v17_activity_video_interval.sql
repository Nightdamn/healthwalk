-- v17: interval scheduling for activity videos so a single video can repeat
-- every N days within first..last range (e.g. one yoga video every 3 days
-- across a 30-day course instead of uploading 10 copies).
ALTER TABLE activity_videos
  ADD COLUMN IF NOT EXISTS interval_days INTEGER NOT NULL DEFAULT 1
    CHECK (interval_days >= 1);
