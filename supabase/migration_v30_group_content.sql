-- v30 — Groups as course streams: per-group content, media, calls, progress.
-- ============================================================================
-- v30-1 (this file): NON-BREAKING schema + backfill.
--   • Add nullable group_id everywhere content/progress lives.
--   • Add course_groups.is_default (exactly one default per course, enforced by
--     partial UNIQUE index). Default = template group, always the source when
--     cloning a new group. Cannot be deleted while still marked default.
--   • Backfill:
--       – Ensure every course has a default group. Existing groups get is_default
--         on the earliest (sort_order/name). Courses without groups get an
--         auto-created "Общая" copying course settings.
--       – enrollments.group_id ← default group (for those still NULL).
--       – course_activities/activity_media/activity_calls.group_id ← course.default.
--       – course_progress/course_day_closures/student_activity_exclusions.group_id
--         ← enrollment.group_id of that (user, course).
--   • Old UNIQUE constraints and course_id-based queries KEEP working. Server
--     code is unchanged; new columns are read/written by later steps (v30-2/3).
-- ============================================================================

BEGIN;

-- 1) course_groups.is_default + guard: at most one default per course
ALTER TABLE course_groups
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_course_groups_default
  ON course_groups(course_id) WHERE is_default;

-- 2) For every course: pick or create a default group.
--    Priority: existing group with lowest (sort_order, name); else auto-create
--    "Общая" from course settings. Runs idempotently.
DO $$
DECLARE
  c RECORD;
  gid UUID;
BEGIN
  FOR c IN SELECT id, owner_id, progression_mode, bound_to_calendar, start_date, access_days_after FROM courses LOOP
    -- Already has a default? Skip.
    SELECT id INTO gid FROM course_groups
     WHERE course_id = c.id AND is_default = true LIMIT 1;
    IF gid IS NOT NULL THEN CONTINUE; END IF;

    -- Any existing group? Promote the earliest.
    SELECT id INTO gid FROM course_groups
     WHERE course_id = c.id
     ORDER BY sort_order ASC, name ASC LIMIT 1;

    IF gid IS NOT NULL THEN
      UPDATE course_groups SET is_default = true WHERE id = gid;
    ELSE
      -- No groups at all: auto-create "Общая" mirroring course settings.
      INSERT INTO course_groups (
        course_id, name, avatar_icon,
        progression_mode, bound_to_calendar, start_date, access_days_after,
        trainer_id, sort_order, is_default
      ) VALUES (
        c.id, 'Общая', 'health/1',
        COALESCE(c.progression_mode, 'daily'),
        COALESCE(c.bound_to_calendar, false),
        c.start_date, c.access_days_after,
        c.owner_id, 0, true
      );
    END IF;
  END LOOP;
END $$;

-- 3) enrollments.group_id ← default group for those still NULL.
UPDATE course_enrollments ce
   SET group_id = g.id
  FROM course_groups g
 WHERE ce.group_id IS NULL
   AND g.course_id = ce.course_id
   AND g.is_default = true;

-- 4) Add nullable group_id to all content/progress tables.
--    Old UNIQUE constraints remain; new column is purely additive.
ALTER TABLE course_activities
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES course_groups(id) ON DELETE CASCADE;

ALTER TABLE activity_media
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES course_groups(id) ON DELETE CASCADE;

ALTER TABLE activity_calls
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES course_groups(id) ON DELETE CASCADE;

ALTER TABLE course_progress
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES course_groups(id) ON DELETE CASCADE;

ALTER TABLE course_day_closures
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES course_groups(id) ON DELETE CASCADE;

ALTER TABLE student_activity_exclusions
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES course_groups(id) ON DELETE CASCADE;

-- 5) Backfill content tables — everything belongs to the course's default group.
--    (Multi-group content is a v30-2 story: clone-on-createGroup happens there.)
UPDATE course_activities ca
   SET group_id = g.id
  FROM course_groups g
 WHERE ca.group_id IS NULL
   AND g.course_id = ca.course_id
   AND g.is_default = true;

UPDATE activity_media am
   SET group_id = g.id
  FROM course_groups g
 WHERE am.group_id IS NULL
   AND g.course_id = am.course_id
   AND g.is_default = true;

UPDATE activity_calls ac
   SET group_id = g.id
  FROM course_groups g
 WHERE ac.group_id IS NULL
   AND g.course_id = ac.course_id
   AND g.is_default = true;

-- 6) Backfill per-user progress — use the enrollment's group (which we filled
--    in step 3). If a user has progress in a course without enrollment (should
--    never happen but let's be safe), fall back to the default group.
UPDATE course_progress cp
   SET group_id = COALESCE(
         (SELECT ce.group_id FROM course_enrollments ce
           WHERE ce.user_id = cp.user_id AND ce.course_id = cp.course_id),
         (SELECT g.id FROM course_groups g
           WHERE g.course_id = cp.course_id AND g.is_default = true)
       )
 WHERE cp.group_id IS NULL;

UPDATE course_day_closures dc
   SET group_id = COALESCE(
         (SELECT ce.group_id FROM course_enrollments ce
           WHERE ce.user_id = dc.user_id AND ce.course_id = dc.course_id),
         (SELECT g.id FROM course_groups g
           WHERE g.course_id = dc.course_id AND g.is_default = true)
       )
 WHERE dc.group_id IS NULL;

UPDATE student_activity_exclusions ex
   SET group_id = COALESCE(
         (SELECT ce.group_id FROM course_enrollments ce
           WHERE ce.user_id = ex.user_id AND ce.course_id = ex.course_id),
         (SELECT g.id FROM course_groups g
           WHERE g.course_id = ex.course_id AND g.is_default = true)
       )
 WHERE ex.group_id IS NULL;

-- 7) Helpful indexes for future per-group reads (used from v30-2 onwards).
CREATE INDEX IF NOT EXISTS idx_course_activities_group ON course_activities(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_media_group ON activity_media(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_calls_group ON activity_calls(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_course_progress_group ON course_progress(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_day_closures_group ON course_day_closures(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exclusions_group ON student_activity_exclusions(group_id) WHERE group_id IS NOT NULL;

-- Sanity report (rolled back by SELECTs on temporary output only if you wrap
-- this file — not automatic here).
SELECT 'courses_total' AS metric, COUNT(*) AS value FROM courses
UNION ALL SELECT 'courses_with_default_group', COUNT(*) FROM courses c
  WHERE EXISTS (SELECT 1 FROM course_groups g WHERE g.course_id = c.id AND g.is_default)
UNION ALL SELECT 'enrollments_without_group', COUNT(*) FROM course_enrollments WHERE group_id IS NULL
UNION ALL SELECT 'activities_without_group', COUNT(*) FROM course_activities WHERE group_id IS NULL
UNION ALL SELECT 'media_without_group', COUNT(*) FROM activity_media WHERE group_id IS NULL
UNION ALL SELECT 'calls_without_group', COUNT(*) FROM activity_calls WHERE group_id IS NULL
UNION ALL SELECT 'progress_without_group', COUNT(*) FROM course_progress WHERE group_id IS NULL
UNION ALL SELECT 'closures_without_group', COUNT(*) FROM course_day_closures WHERE group_id IS NULL
UNION ALL SELECT 'exclusions_without_group', COUNT(*) FROM student_activity_exclusions WHERE group_id IS NULL;

COMMIT;
