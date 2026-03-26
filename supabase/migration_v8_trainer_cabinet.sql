-- ═══════════════════════════════════════════════════════════
-- V8: Trainer Cabinet — student management
-- ═══════════════════════════════════════════════════════════

-- 1. Add paused flag to enrollments
ALTER TABLE course_enrollments ADD COLUMN IF NOT EXISTS paused BOOLEAN DEFAULT FALSE;

-- 2. Get students with user info (SECURITY DEFINER to access auth.users)
CREATE OR REPLACE FUNCTION get_course_students_info(p_course_id UUID)
RETURNS TABLE (
  enrollment_id UUID,
  user_id UUID,
  email TEXT,
  display_name TEXT,
  role TEXT,
  paused BOOLEAN,
  joined_at TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Only course owner can call this
  IF NOT EXISTS (SELECT 1 FROM courses WHERE id = p_course_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

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
    ce.joined_at
  FROM course_enrollments ce
  JOIN auth.users u ON u.id = ce.user_id
  WHERE ce.course_id = p_course_id
    AND ce.user_id != auth.uid()
  ORDER BY ce.role, ce.joined_at;
END;
$$;

-- 3. Get all student progress for a course (for trainer dashboard)
CREATE OR REPLACE FUNCTION get_course_all_students_progress(p_course_id UUID)
RETURNS TABLE (
  user_id UUID,
  activity_id UUID,
  day INTEGER,
  elapsed_seconds INTEGER,
  completed BOOLEAN
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM courses WHERE id = p_course_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT cp.user_id, cp.activity_id, cp.day, cp.elapsed_seconds, cp.completed
  FROM course_progress cp
  WHERE cp.course_id = p_course_id;
END;
$$;

-- 4. Toggle pause for a student enrollment
CREATE OR REPLACE FUNCTION toggle_student_pause(p_enrollment_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_enrollment course_enrollments%ROWTYPE;
BEGIN
  SELECT * INTO v_enrollment FROM course_enrollments WHERE id = p_enrollment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Запись не найдена');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM courses WHERE id = v_enrollment.course_id AND owner_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Нет доступа');
  END IF;

  UPDATE course_enrollments SET paused = NOT COALESCE(paused, false) WHERE id = p_enrollment_id;

  RETURN jsonb_build_object('success', true, 'paused', NOT COALESCE(v_enrollment.paused, false));
END;
$$;

-- 5. Remove student from course
CREATE OR REPLACE FUNCTION remove_student_from_course(p_enrollment_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_enrollment course_enrollments%ROWTYPE;
BEGIN
  SELECT * INTO v_enrollment FROM course_enrollments WHERE id = p_enrollment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Запись не найдена');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM courses WHERE id = v_enrollment.course_id AND owner_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Нет доступа');
  END IF;

  -- Also clean up their progress
  DELETE FROM course_progress WHERE user_id = v_enrollment.user_id AND course_id = v_enrollment.course_id;
  DELETE FROM course_enrollments WHERE id = p_enrollment_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Force PostgREST to pick up new functions
NOTIFY pgrst, 'reload schema';
