-- ═══════════════════════════════════════════════════════════
-- V2: Roles, Courses, Enrollments, Messages
-- Run AFTER the base migration.sql
-- ═══════════════════════════════════════════════════════════

-- 1. User roles: student (default), curator, trainer, admin
CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'curator', 'trainer', 'admin')),
  assigned_by UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Set first admin
INSERT INTO user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'golovinde1986@gmail.com'
ON CONFLICT (user_id) DO UPDATE SET role = 'admin', updated_at = NOW();

-- 1b. Pending roles (assigned by email before user registers)
CREATE TABLE IF NOT EXISTS pending_roles (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('student', 'curator', 'trainer', 'admin')),
  assigned_by UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1c. Pending course invitations (by email)
CREATE TABLE IF NOT EXISTS pending_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID REFERENCES courses ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'curator')),
  invited_by UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id, email)
);

-- 2. Courses created by trainers
CREATE TABLE IF NOT EXISTS courses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  days_count INTEGER NOT NULL DEFAULT 30 CHECK (days_count BETWEEN 1 AND 365),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Course activities (customizable per course)
CREATE TABLE IF NOT EXISTS course_activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID REFERENCES courses ON DELETE CASCADE NOT NULL,
  activity_id TEXT NOT NULL,
  label TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 10 CHECK (duration_min > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(course_id, activity_id)
);

-- 4. Enrollments: who is in which course, with what role
CREATE TABLE IF NOT EXISTS course_enrollments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID REFERENCES courses ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'curator')),
  invited_by UUID REFERENCES auth.users ON DELETE SET NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id, user_id)
);

-- 5. Messages between trainer/curator and students
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID REFERENCES courses ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  recipient_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  body TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- RLS Policies
-- ═══════════════════════════════════════════════════════════

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- user_roles: everyone can read any role (needed for lookups), only admins insert/update
CREATE POLICY "Anyone can read roles" ON user_roles FOR SELECT USING (true);
CREATE POLICY "Admins can insert roles" ON user_roles FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    OR NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid())
  );
CREATE POLICY "Admins can update roles" ON user_roles FOR UPDATE
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- courses: owner can CRUD, enrolled users can read
CREATE POLICY "Owner can manage courses" ON courses FOR ALL
  USING (owner_id = auth.uid());
CREATE POLICY "Enrolled users can view courses" ON courses FOR SELECT
  USING (EXISTS (SELECT 1 FROM course_enrollments WHERE course_id = id AND user_id = auth.uid()));

-- course_activities: same as courses
CREATE POLICY "Owner can manage activities" ON course_activities FOR ALL
  USING (EXISTS (SELECT 1 FROM courses WHERE id = course_id AND owner_id = auth.uid()));
CREATE POLICY "Enrolled can view activities" ON course_activities FOR SELECT
  USING (EXISTS (SELECT 1 FROM course_enrollments ce JOIN courses c ON c.id = ce.course_id WHERE ce.course_id = course_id AND ce.user_id = auth.uid()));

-- course_enrollments: owner can manage, user can read own
CREATE POLICY "Course owner can manage enrollments" ON course_enrollments FOR ALL
  USING (EXISTS (SELECT 1 FROM courses WHERE id = course_id AND owner_id = auth.uid()));
CREATE POLICY "Users can view own enrollments" ON course_enrollments FOR SELECT
  USING (user_id = auth.uid());

-- messages: sender or recipient can read
CREATE POLICY "Users can view own messages" ON messages FOR SELECT
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());
CREATE POLICY "Users can send messages" ON messages FOR INSERT
  WITH CHECK (sender_id = auth.uid());

-- ═══════════════════════════════════════════════════════════
-- Indexes
-- ═══════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON course_enrollments (user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON course_enrollments (course_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages (recipient_id, is_read);
CREATE INDEX IF NOT EXISTS idx_courses_owner ON courses (owner_id);

-- pending_roles: admins can manage, anyone can read own
ALTER TABLE pending_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage pending_roles" ON pending_roles FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Users read own pending" ON pending_roles FOR SELECT
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- pending_invitations: course owners manage, users read own
ALTER TABLE pending_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Course owners manage invitations" ON pending_invitations FOR ALL
  USING (EXISTS (SELECT 1 FROM courses WHERE id = course_id AND owner_id = auth.uid()));
CREATE POLICY "Users read own invitations" ON pending_invitations FOR SELECT
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));
CREATE POLICY "Admins manage all invitations" ON pending_invitations FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));
