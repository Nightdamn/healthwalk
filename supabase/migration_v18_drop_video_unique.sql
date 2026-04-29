-- v18: drop the strict UNIQUE on (course_id, activity_id, first_day, last_day).
-- A practice can legitimately have several videos covering different (or even
-- overlapping) ranges; the player picks the one matching the current day via
-- sort_order. Constraint blocked the trainer from adding a second clip whenever
-- defaults silently matched the first one.
ALTER TABLE activity_videos
  DROP CONSTRAINT IF EXISTS activity_videos_course_id_activity_id_first_day_last_day_key;
