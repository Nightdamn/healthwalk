-- v20: per-day overrides for course activity schedule.
--
-- Previously each course_activities row defined its schedule purely by
-- (first_day, last_day, interval_days). Trainer asked for a visual day
-- calendar where she can toggle individual days on/off without breaking
-- the interval seed. Two arrays cover both directions:
--
--   excluded_days   days that WOULD be on by interval but trainer turned OFF
--   extra_days      days outside the interval pattern that trainer turned ON
--
-- Effective schedule for activity A on day D:
--   inInterval = D >= first_day AND D <= last_day AND (D-first_day) % interval = 0
--   on         = (inInterval OR D ∈ extra_days) AND D ∉ excluded_days
--
-- This is additive — existing activities behave the same (both arrays empty).
ALTER TABLE course_activities
  ADD COLUMN IF NOT EXISTS excluded_days INTEGER[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS extra_days    INTEGER[] NOT NULL DEFAULT '{}';
