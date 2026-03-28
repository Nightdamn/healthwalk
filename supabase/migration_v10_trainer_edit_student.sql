-- ═══════════════════════════════════════════════════════════
-- V10: Trainer can disable/add activities for specific students
-- ═══════════════════════════════════════════════════════════

-- 1. Table for excluded (disabled) activities per student per day
CREATE TABLE IF NOT EXISTS student_activity_exclusions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  course_id UUID REFERENCES courses ON DELETE CASCADE NOT NULL,
  activity_id UUID REFERENCES course_activities ON DELETE CASCADE NOT NULL,
  day INTEGER NOT NULL CHECK (day >= 1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, course_id, activity_id, day)
);

ALTER TABLE student_activity_exclusions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Course owner manages exclusions" ON student_activity_exclusions FOR ALL
  USING (EXISTS (SELECT 1 FROM courses WHERE id = course_id AND owner_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_exclusions_user_course
  ON student_activity_exclusions (user_id, course_id);

-- 2. Table for custom per-student activities added by trainer
CREATE TABLE IF NOT EXISTS student_custom_activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID REFERENCES courses ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  label TEXT NOT NULL,
  icon_num TEXT DEFAULT 'health/1',
  duration_min INTEGER NOT NULL DEFAULT 10,
  first_day INTEGER NOT NULL DEFAULT 1 CHECK (first_day >= 1),
  last_day INTEGER NOT NULL DEFAULT 30 CHECK (last_day >= 1),
  interval_days INTEGER NOT NULL DEFAULT 1 CHECK (interval_days >= 1),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE student_custom_activities ENABLE ROW LEVEL SECURITY;

-- Student can read their own custom activities
CREATE POLICY "Student reads own custom activities" ON student_custom_activities FOR SELECT
  USING (user_id = auth.uid());

-- Course owner manages custom activities
CREATE POLICY "Course owner manages custom activities" ON student_custom_activities FOR ALL
  USING (EXISTS (SELECT 1 FROM courses WHERE id = course_id AND owner_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_custom_activities_user_course
  ON student_custom_activities (user_id, course_id);

-- 3. Add created_at to course_activities if not exists
ALTER TABLE course_activities ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 4. Trainer toggles activity exclusion for a student on a specific day
CREATE OR REPLACE FUNCTION trainer_toggle_exclusion(
  p_course_id UUID,
  p_user_id UUID,
  p_activity_id UUID,
  p_day INTEGER
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM courses WHERE id = p_course_id AND owner_id = auth.uid()) THEN
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

-- 5. Trainer adds custom activity for a specific student
CREATE OR REPLACE FUNCTION trainer_add_student_activity(
  p_course_id UUID,
  p_user_id UUID,
  p_label TEXT,
  p_icon_num TEXT,
  p_duration_min INTEGER,
  p_first_day INTEGER,
  p_last_day INTEGER,
  p_interval_days INTEGER
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM courses WHERE id = p_course_id AND owner_id = auth.uid()) THEN
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

-- 6. Get all exclusions for a course (for trainer dashboard)
CREATE OR REPLACE FUNCTION get_course_exclusions(p_course_id UUID)
RETURNS TABLE (
  user_id UUID,
  activity_id UUID,
  day INTEGER
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM courses WHERE id = p_course_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT sae.user_id, sae.activity_id, sae.day
  FROM student_activity_exclusions sae
  WHERE sae.course_id = p_course_id;
END;
$$;

-- 7. Get all custom activities for a course (for trainer dashboard)
CREATE OR REPLACE FUNCTION get_course_custom_activities(p_course_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  label TEXT,
  icon_num TEXT,
  duration_min INTEGER,
  first_day INTEGER,
  last_day INTEGER,
  interval_days INTEGER
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM courses WHERE id = p_course_id AND owner_id = auth.uid()) THEN
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

-- 8. Student reads own exclusions (to filter dashboard)
CREATE POLICY "Student reads own exclusions" ON student_activity_exclusions FOR SELECT
  USING (user_id = auth.uid());

-- 9. Trainer deletes custom activity
CREATE OR REPLACE FUNCTION trainer_delete_student_activity(p_activity_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_course_id UUID;
BEGIN
  SELECT course_id INTO v_course_id FROM student_custom_activities WHERE id = p_activity_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Не найдено');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM courses WHERE id = v_course_id AND owner_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Нет доступа');
  END IF;

  DELETE FROM student_custom_activities WHERE id = p_activity_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

NOTIFY pgrst, 'reload schema';
