-- ═══════════════════════════════════════════════════════════
-- V9: Trainer can edit student activity progress for future days
-- ═══════════════════════════════════════════════════════════

-- 1. Upsert student activity progress (only course owner can call)
CREATE OR REPLACE FUNCTION trainer_update_student_activity(
  p_course_id UUID,
  p_user_id UUID,
  p_activity_id UUID,
  p_day INTEGER,
  p_elapsed_seconds INTEGER,
  p_completed BOOLEAN
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Only course owner can modify student progress
  IF NOT EXISTS (SELECT 1 FROM courses WHERE id = p_course_id AND owner_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Нет доступа');
  END IF;

  -- Verify student is enrolled in the course
  IF NOT EXISTS (SELECT 1 FROM course_enrollments WHERE course_id = p_course_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ученик не записан на курс');
  END IF;

  -- Verify activity belongs to this course
  IF NOT EXISTS (SELECT 1 FROM course_activities WHERE id = p_activity_id AND course_id = p_course_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Активность не найдена');
  END IF;

  -- Upsert progress
  INSERT INTO course_progress (user_id, course_id, activity_id, day, elapsed_seconds, completed, updated_at)
  VALUES (p_user_id, p_course_id, p_activity_id, p_day, p_elapsed_seconds, p_completed, NOW())
  ON CONFLICT (user_id, course_id, activity_id, day)
  DO UPDATE SET
    elapsed_seconds = EXCLUDED.elapsed_seconds,
    completed = EXCLUDED.completed,
    updated_at = NOW();

  RETURN jsonb_build_object('success', true);
END;
$$;

NOTIFY pgrst, 'reload schema';
