-- ═══════════════════════════════════════════════════════════
-- V4: Course Constructor + Active Context + Seed
-- Run AFTER migration_v3_trackers.sql
-- ═══════════════════════════════════════════════════════════

-- 1. Add icon/day-range columns to course_activities
ALTER TABLE course_activities ADD COLUMN IF NOT EXISTS icon_num INTEGER DEFAULT 1;
ALTER TABLE course_activities ADD COLUMN IF NOT EXISTS first_day INTEGER DEFAULT 1;
ALTER TABLE course_activities ADD COLUMN IF NOT EXISTS last_day INTEGER;

-- 2. Course progress (like tracker_progress but for courses)
CREATE TABLE IF NOT EXISTS course_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  course_id UUID REFERENCES courses ON DELETE CASCADE NOT NULL,
  activity_id UUID REFERENCES course_activities ON DELETE CASCADE NOT NULL,
  day INTEGER NOT NULL CHECK (day >= 1),
  elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, course_id, activity_id, day)
);

ALTER TABLE course_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own course progress" ON course_progress FOR ALL
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_course_progress_user ON course_progress (user_id, course_id);

-- 3. Add avatar fields to courses (like trackers)
ALTER TABLE courses ADD COLUMN IF NOT EXISTS avatar_icon INTEGER;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS avatar_custom TEXT;

-- 4. Active context — what course/tracker the user is currently viewing
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS active_type TEXT CHECK (active_type IS NULL OR active_type IN ('course', 'tracker'));
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS active_id UUID;

-- ═══════════════════════════════════════════════════════════
-- 5. Seed "Осознанная походка" course
--    Owner: golovinde1986@gmail.com
-- ═══════════════════════════════════════════════════════════

-- Create the course (use DO block to get owner_id and course_id)
DO $$
DECLARE
  v_owner_id UUID;
  v_course_id UUID;
  v_user RECORD;
BEGIN
  -- Find owner
  SELECT id INTO v_owner_id FROM auth.users WHERE email = 'golovinde1986@gmail.com';
  IF v_owner_id IS NULL THEN
    RAISE NOTICE 'Owner golovinde1986@gmail.com not found, skipping seed';
    RETURN;
  END IF;

  -- Check if course already exists
  IF EXISTS (SELECT 1 FROM courses WHERE title = 'Осознанная походка' AND owner_id = v_owner_id) THEN
    RAISE NOTICE 'Course already exists, skipping seed';
    RETURN;
  END IF;

  -- Create course
  INSERT INTO courses (owner_id, title, description, days_count, avatar_icon, is_active)
  VALUES (v_owner_id, 'Осознанная походка', 'Курс осознанного движения: 30 дней практик для тела и ума', 30, 17, TRUE)
  RETURNING id INTO v_course_id;

  -- Create activities
  INSERT INTO course_activities (course_id, activity_id, label, duration_min, sort_order, icon_num, first_day, last_day) VALUES
    (v_course_id, 'warmup',   'Разминка',  20, 0, 14, 1, 30),
    (v_course_id, 'standing',  'Стояние',   10, 1, 27, 1, 30),
    (v_course_id, 'sitting',   'Сидение',   10, 2, 30, 1, 30),
    (v_course_id, 'walking',   'Прогулка',  30, 3, 17, 1, 30);

  -- Enroll ALL existing users as students
  FOR v_user IN SELECT id FROM auth.users LOOP
    INSERT INTO course_enrollments (course_id, user_id, role, invited_by)
    VALUES (v_course_id, v_user.id, 'student', v_owner_id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Set this course as active for all users who have settings
  UPDATE user_settings SET active_type = 'course', active_id = v_course_id
  WHERE active_type IS NULL;

  -- Migrate existing activity_progress → course_progress
  INSERT INTO course_progress (user_id, course_id, activity_id, day, elapsed_seconds, completed, updated_at)
  SELECT
    ap.user_id,
    v_course_id,
    ca.id,
    ap.day,
    ap.elapsed_seconds,
    ap.completed,
    ap.updated_at
  FROM activity_progress ap
  JOIN course_activities ca ON ca.course_id = v_course_id AND ca.activity_id = ap.activity_id
  ON CONFLICT (user_id, course_id, activity_id, day) DO NOTHING;

  RAISE NOTICE 'Seeded course "Осознанная походка" id=%, enrolled all users, migrated progress', v_course_id;
END $$;
