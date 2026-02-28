-- ═══════════════════════════════════════════════════════════
-- V5: Fix RLS recursion + enrollment CHECK + tracker start_date
-- Run AFTER migration_v4_course_constructor.sql
-- ═══════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
-- 1. FIX INFINITE RECURSION IN RLS POLICIES
--
-- Problem: courses SELECT → checks enrollments → enrollments policy
--          checks courses → courses SELECT → … infinite loop
--
-- Solution: SECURITY DEFINER function bypasses RLS on inner query,
--           breaking the cycle.
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_course_owner(p_course_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM courses WHERE id = p_course_id AND owner_id = auth.uid()
  );
$$;

-- Drop ALL old recursive policies
DROP POLICY IF EXISTS "Course owner can manage enrollments" ON course_enrollments;
DROP POLICY IF EXISTS "Owner can manage activities" ON course_activities;
DROP POLICY IF EXISTS "Enrolled can view activities" ON course_activities;
DROP POLICY IF EXISTS "Course owners manage invitations" ON pending_invitations;

-- Re-create with SECURITY DEFINER function (no recursion)
CREATE POLICY "Course owner can manage enrollments" ON course_enrollments FOR ALL
  USING (is_course_owner(course_id));

CREATE POLICY "Owner can manage activities" ON course_activities FOR ALL
  USING (is_course_owner(course_id));

CREATE POLICY "Enrolled can view activities" ON course_activities FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM course_enrollments ce
    WHERE ce.course_id = course_activities.course_id AND ce.user_id = auth.uid()
  ));

CREATE POLICY "Course owners manage invitations" ON pending_invitations FOR ALL
  USING (is_course_owner(course_id));

-- ═══════════════════════════════════════════════════════════
-- 2. Fix enrollment role CHECK (allow 'trainer')
-- ═══════════════════════════════════════════════════════════

ALTER TABLE course_enrollments DROP CONSTRAINT IF EXISTS course_enrollments_role_check;
ALTER TABLE course_enrollments ADD CONSTRAINT course_enrollments_role_check
  CHECK (role IN ('student', 'curator', 'trainer'));

ALTER TABLE pending_invitations DROP CONSTRAINT IF EXISTS pending_invitations_role_check;
ALTER TABLE pending_invitations ADD CONSTRAINT pending_invitations_role_check
  CHECK (role IN ('student', 'curator', 'trainer'));

-- ═══════════════════════════════════════════════════════════
-- 3. Tracker start_date
-- ═══════════════════════════════════════════════════════════

ALTER TABLE personal_trackers ADD COLUMN IF NOT EXISTS start_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- ═══════════════════════════════════════════════════════════
-- 4. Re-enroll course owners as 'trainer'
-- ═══════════════════════════════════════════════════════════

INSERT INTO course_enrollments (course_id, user_id, role, invited_by)
SELECT c.id, c.owner_id, 'trainer', c.owner_id
FROM courses c
WHERE NOT EXISTS (
  SELECT 1 FROM course_enrollments ce
  WHERE ce.course_id = c.id AND ce.user_id = c.owner_id
)
ON CONFLICT (course_id, user_id) DO UPDATE SET role = 'trainer';
