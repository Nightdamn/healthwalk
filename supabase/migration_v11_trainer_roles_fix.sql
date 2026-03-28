-- ═══════════════════════════════════════════════════════════
-- V11: All trainers can manage students; drop FK on exclusions
-- ═══════════════════════════════════════════════════════════

-- 1. Drop FK on activity_id so custom activities can be excluded too
ALTER TABLE student_activity_exclusions DROP CONSTRAINT IF EXISTS student_activity_exclusions_activity_id_fkey;

-- 2. Helper: check if caller is trainer on this course (owner OR enrolled as trainer)
CREATE OR REPLACE FUNCTION is_course_trainer(p_course_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM courses WHERE id = p_course_id AND owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM course_enrollments
    WHERE course_id = p_course_id AND user_id = auth.uid() AND role = 'trainer'
  );
END;
$$;

-- 3. Recreate get_course_students_info — any trainer can call, includes self and is_owner
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

-- 4. Recreate get_course_all_students_progress — any trainer
CREATE OR REPLACE FUNCTION get_course_all_students_progress(p_course_id UUID)
RETURNS TABLE (
  user_id UUID,
  activity_id UUID,
  day INTEGER,
  elapsed_seconds INTEGER,
  completed BOOLEAN
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_course_trainer(p_course_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT cp.user_id, cp.activity_id, cp.day, cp.elapsed_seconds, cp.completed
  FROM course_progress cp
  WHERE cp.course_id = p_course_id;
END;
$$;

-- 5. toggle_student_pause — any trainer
CREATE OR REPLACE FUNCTION toggle_student_pause(p_enrollment_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_enrollment course_enrollments%ROWTYPE;
BEGIN
  SELECT * INTO v_enrollment FROM course_enrollments WHERE id = p_enrollment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Запись не найдена');
  END IF;

  IF NOT is_course_trainer(v_enrollment.course_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Нет доступа');
  END IF;

  UPDATE course_enrollments SET paused = NOT COALESCE(paused, false) WHERE id = p_enrollment_id;

  RETURN jsonb_build_object('success', true, 'paused', NOT COALESCE(v_enrollment.paused, false));
END;
$$;

-- 6. remove_student_from_course — any trainer, but cannot remove course owner
CREATE OR REPLACE FUNCTION remove_student_from_course(p_enrollment_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_enrollment course_enrollments%ROWTYPE;
  v_owner_id UUID;
BEGIN
  SELECT * INTO v_enrollment FROM course_enrollments WHERE id = p_enrollment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Запись не найдена');
  END IF;

  IF NOT is_course_trainer(v_enrollment.course_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Нет доступа');
  END IF;

  -- Cannot remove course owner
  SELECT owner_id INTO v_owner_id FROM courses WHERE id = v_enrollment.course_id;
  IF v_enrollment.user_id = v_owner_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Нельзя удалить создателя курса');
  END IF;

  DELETE FROM course_progress WHERE user_id = v_enrollment.user_id AND course_id = v_enrollment.course_id;
  DELETE FROM course_enrollments WHERE id = p_enrollment_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 7. change_student_role — any trainer, but cannot demote course owner
CREATE OR REPLACE FUNCTION change_student_role(p_enrollment_id UUID, p_new_role TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_enrollment course_enrollments%ROWTYPE;
  v_owner_id UUID;
BEGIN
  IF p_new_role NOT IN ('student', 'curator', 'trainer') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Недопустимая роль');
  END IF;

  SELECT * INTO v_enrollment FROM course_enrollments WHERE id = p_enrollment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Запись не найдена');
  END IF;

  IF NOT is_course_trainer(v_enrollment.course_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Нет доступа');
  END IF;

  -- Cannot change own role
  IF v_enrollment.user_id = auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Нельзя изменить собственную роль');
  END IF;

  -- Cannot demote course owner (can only keep as trainer)
  SELECT owner_id INTO v_owner_id FROM courses WHERE id = v_enrollment.course_id;
  IF v_enrollment.user_id = v_owner_id AND p_new_role != 'trainer' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Нельзя понизить создателя курса');
  END IF;

  UPDATE course_enrollments SET role = p_new_role WHERE id = p_enrollment_id;

  RETURN jsonb_build_object('success', true, 'role', p_new_role);
END;
$$;

-- 8. trainer_toggle_exclusion — any trainer
CREATE OR REPLACE FUNCTION trainer_toggle_exclusion(
  p_course_id UUID, p_user_id UUID, p_activity_id UUID, p_day INTEGER
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  IF NOT is_course_trainer(p_course_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Нет доступа');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM student_activity_exclusions
    WHERE user_id = p_user_id AND course_id = p_course_id
      AND activity_id = p_activity_id AND day = p_day
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM student_activity_exclusions
    WHERE user_id = p_user_id AND course_id = p_course_id
      AND activity_id = p_activity_id AND day = p_day;
    RETURN jsonb_build_object('success', true, 'excluded', false);
  ELSE
    INSERT INTO student_activity_exclusions (user_id, course_id, activity_id, day)
    VALUES (p_user_id, p_course_id, p_activity_id, p_day);
    RETURN jsonb_build_object('success', true, 'excluded', true);
  END IF;
END;
$$;

-- 9. trainer_add_student_activity — any trainer
CREATE OR REPLACE FUNCTION trainer_add_student_activity(
  p_course_id UUID, p_user_id UUID, p_label TEXT, p_icon_num TEXT,
  p_duration_min INTEGER, p_first_day INTEGER, p_last_day INTEGER, p_interval_days INTEGER
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT is_course_trainer(p_course_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Нет доступа');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM course_enrollments WHERE course_id = p_course_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ученик не записан на курс');
  END IF;

  INSERT INTO student_custom_activities (course_id, user_id, label, icon_num, duration_min, first_day, last_day, interval_days)
  VALUES (p_course_id, p_user_id, p_label, p_icon_num, p_duration_min, p_first_day, p_last_day, p_interval_days)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

-- 10. trainer_delete_student_activity — any trainer
CREATE OR REPLACE FUNCTION trainer_delete_student_activity(p_activity_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_course_id UUID;
BEGIN
  SELECT course_id INTO v_course_id FROM student_custom_activities WHERE id = p_activity_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Не найдено');
  END IF;

  IF NOT is_course_trainer(v_course_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Нет доступа');
  END IF;

  -- Clean up any exclusions for this custom activity
  DELETE FROM student_activity_exclusions WHERE activity_id = p_activity_id;
  DELETE FROM student_custom_activities WHERE id = p_activity_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 11. get_course_exclusions — any trainer
CREATE OR REPLACE FUNCTION get_course_exclusions(p_course_id UUID)
RETURNS TABLE (user_id UUID, activity_id UUID, day INTEGER)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_course_trainer(p_course_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT sae.user_id, sae.activity_id, sae.day
  FROM student_activity_exclusions sae
  WHERE sae.course_id = p_course_id;
END;
$$;

-- 12. get_course_custom_activities — any trainer
CREATE OR REPLACE FUNCTION get_course_custom_activities(p_course_id UUID)
RETURNS TABLE (
  id UUID, user_id UUID, label TEXT, icon_num TEXT,
  duration_min INTEGER, first_day INTEGER, last_day INTEGER, interval_days INTEGER
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_course_trainer(p_course_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT sca.id, sca.user_id, sca.label, sca.icon_num, sca.duration_min,
         sca.first_day, sca.last_day, sca.interval_days
  FROM student_custom_activities sca
  WHERE sca.course_id = p_course_id
  ORDER BY sca.created_at;
END;
$$;

-- 13. Update RLS on exclusions — any trainer can manage
DROP POLICY IF EXISTS "Course owner manages exclusions" ON student_activity_exclusions;
CREATE POLICY "Trainer manages exclusions" ON student_activity_exclusions FOR ALL
  USING (
    EXISTS (SELECT 1 FROM courses WHERE id = course_id AND owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM course_enrollments WHERE course_id = student_activity_exclusions.course_id AND user_id = auth.uid() AND role = 'trainer')
    OR user_id = auth.uid()
  );

-- 14. Update RLS on custom activities — any trainer can manage
DROP POLICY IF EXISTS "Course owner manages custom activities" ON student_custom_activities;
CREATE POLICY "Trainer manages custom activities" ON student_custom_activities FOR ALL
  USING (
    EXISTS (SELECT 1 FROM courses WHERE id = course_id AND owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM course_enrollments WHERE course_id = student_custom_activities.course_id AND user_id = auth.uid() AND role = 'trainer')
    OR user_id = auth.uid()
  );

NOTIFY pgrst, 'reload schema';
