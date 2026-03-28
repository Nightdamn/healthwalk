-- ═══════════════════════════════════════════════════════════
-- V12: Show all participants (including self) in trainer cabinet
-- ═══════════════════════════════════════════════════════════

-- Recreate get_course_students_info — include caller, add is_owner flag
CREATE OR REPLACE FUNCTION get_course_students_info(p_course_id UUID)
RETURNS TABLE (
  enrollment_id UUID,
  user_id UUID,
  email TEXT,
  display_name TEXT,
  role TEXT,
  paused BOOLEAN,
  joined_at TIMESTAMPTZ,
  is_owner BOOLEAN
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  IF NOT is_course_trainer(p_course_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT owner_id INTO v_owner_id FROM courses WHERE id = p_course_id;

  RETURN QUERY
  SELECT
    ce.id AS enrollment_id,
    ce.user_id,
    u.email::TEXT,
    COALESCE(
      u.raw_user_meta_data->>'full_name',
      u.raw_user_meta_data->>'name',
      u.raw_user_meta_data->>'preferred_username',
      split_part(u.email, '@', 1)
    )::TEXT AS display_name,
    ce.role,
    COALESCE(ce.paused, false) AS paused,
    ce.joined_at,
    (ce.user_id = v_owner_id) AS is_owner
  FROM course_enrollments ce
  JOIN auth.users u ON u.id = ce.user_id
  WHERE ce.course_id = p_course_id
  ORDER BY
    (ce.user_id = v_owner_id) DESC,
    ce.role, ce.joined_at;
END;
$$;

-- Also allow trainers to manage their own exclusions/custom activities
-- (change_student_role still blocks self-role-change, which is correct)

NOTIFY pgrst, 'reload schema';
