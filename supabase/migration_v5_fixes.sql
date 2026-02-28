-- ═══════════════════════════════════════════════════════════
-- V5: Fix enrollment role CHECK + Tracker start_date
-- Run AFTER migration_v4_course_constructor.sql
-- ═══════════════════════════════════════════════════════════

-- 1. Fix course_enrollments: allow 'trainer' role
--    (original CHECK only allowed 'student','curator')
ALTER TABLE course_enrollments DROP CONSTRAINT IF EXISTS course_enrollments_role_check;
ALTER TABLE course_enrollments ADD CONSTRAINT course_enrollments_role_check
  CHECK (role IN ('student', 'curator', 'trainer'));

-- 2. Fix pending_invitations: allow 'trainer' role
ALTER TABLE pending_invitations DROP CONSTRAINT IF EXISTS pending_invitations_role_check;
ALTER TABLE pending_invitations ADD CONSTRAINT pending_invitations_role_check
  CHECK (role IN ('student', 'curator', 'trainer'));

-- 3. Add start_date to personal_trackers (defaults to NOW)
ALTER TABLE personal_trackers ADD COLUMN IF NOT EXISTS start_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- 4. Re-enroll course owners as 'trainer' where they were missed
--    (previously failed due to CHECK constraint)
INSERT INTO course_enrollments (course_id, user_id, role, invited_by)
SELECT c.id, c.owner_id, 'trainer', c.owner_id
FROM courses c
WHERE NOT EXISTS (
  SELECT 1 FROM course_enrollments ce
  WHERE ce.course_id = c.id AND ce.user_id = c.owner_id
)
ON CONFLICT (course_id, user_id) DO UPDATE SET role = 'trainer';
