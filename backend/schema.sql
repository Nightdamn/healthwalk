-- ═══════════════════════════════════════════════════════════
-- InStep — Consolidated Database Schema
-- Self-hosted PostgreSQL (no Supabase)
-- Run: psql -U instep -d instep -f schema.sql
-- ═══════════════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════════════════════
-- USERS (replaces Supabase auth.users)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,                -- NULL for OAuth-only users
  display_name TEXT,
  avatar_url TEXT,
  provider TEXT NOT NULL DEFAULT 'email',  -- 'email' | 'google'
  provider_id TEXT,                  -- Google sub ID
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider, provider_id);

-- ═══════════════════════════════════════════════════════════
-- USER SETTINGS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE PRIMARY KEY,
  course_start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tz_offset_min INTEGER NOT NULL DEFAULT 180,
  day_start_hour INTEGER NOT NULL DEFAULT 5 CHECK (day_start_hour BETWEEN 0 AND 23),
  current_day INTEGER NOT NULL DEFAULT 1,
  active_type TEXT CHECK (active_type IS NULL OR active_type IN ('course', 'tracker')),
  active_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- USER ROLES (global platform roles)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'curator', 'trainer', 'admin')),
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pending_roles (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('student', 'curator', 'trainer', 'admin')),
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- COURSES
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS courses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  days_count INTEGER NOT NULL DEFAULT 30 CHECK (days_count BETWEEN 1 AND 365),
  avatar_icon TEXT,
  avatar_custom TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courses_owner ON courses(owner_id);

CREATE TABLE IF NOT EXISTS course_activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL,
  label TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 10 CHECK (duration_min > 0),
  icon_num TEXT DEFAULT 'health/1',
  practice_type TEXT NOT NULL DEFAULT 'media' CHECK (practice_type IN ('media', 'theory', 'call')),
  description_html TEXT,
  first_day INTEGER DEFAULT 1,
  last_day INTEGER,
  interval_days INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id, activity_id)
);

CREATE TABLE IF NOT EXISTS course_enrollments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'curator', 'trainer')),
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  paused BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_user ON course_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON course_enrollments(course_id);

CREATE TABLE IF NOT EXISTS pending_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'curator', 'trainer')),
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id, email)
);

CREATE TABLE IF NOT EXISTS course_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL,
  day INTEGER NOT NULL CHECK (day >= 1),
  elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, course_id, activity_id, day)
);

CREATE INDEX IF NOT EXISTS idx_course_progress_user ON course_progress(user_id, course_id);

-- ═══════════════════════════════════════════════════════════
-- PERSONAL TRACKERS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS personal_trackers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  avatar_icon TEXT,
  avatar_custom TEXT,
  days_count INTEGER NOT NULL DEFAULT 30 CHECK (days_count BETWEEN 1 AND 365),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_trackers_user ON personal_trackers(user_id);

CREATE TABLE IF NOT EXISTS tracker_practices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tracker_id UUID NOT NULL REFERENCES personal_trackers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  icon_num TEXT NOT NULL DEFAULT 'health/1',
  first_day INTEGER NOT NULL DEFAULT 1,
  last_day INTEGER NOT NULL DEFAULT 30,
  duration_min INTEGER NOT NULL DEFAULT 10 CHECK (duration_min > 0),
  interval_days INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_tracker_practices_tracker ON tracker_practices(tracker_id);

CREATE TABLE IF NOT EXISTS tracker_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tracker_id UUID NOT NULL REFERENCES personal_trackers(id) ON DELETE CASCADE,
  practice_id UUID NOT NULL REFERENCES tracker_practices(id) ON DELETE CASCADE,
  day INTEGER NOT NULL CHECK (day >= 1),
  elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tracker_id, practice_id, day)
);

CREATE INDEX IF NOT EXISTS idx_tracker_progress_user ON tracker_progress(user_id, tracker_id);

-- ═══════════════════════════════════════════════════════════
-- MESSAGES
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  recipient_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL CHECK (char_length(body) <= 500),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_course ON messages(course_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id, is_read);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_unread ON messages(recipient_id, is_read) WHERE NOT is_read;
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(course_id, sender_id, recipient_id);

-- ═══════════════════════════════════════════════════════════
-- TRAINER: EXCLUSIONS & CUSTOM ACTIVITIES
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS student_activity_exclusions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  activity_id TEXT,
  day INTEGER NOT NULL CHECK (day >= 1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, course_id, activity_id, day)
);

CREATE INDEX IF NOT EXISTS idx_exclusions_user_course ON student_activity_exclusions(user_id, course_id);

CREATE TABLE IF NOT EXISTS student_custom_activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  icon_num TEXT DEFAULT 'health/1',
  duration_min INTEGER NOT NULL DEFAULT 10,
  first_day INTEGER NOT NULL DEFAULT 1 CHECK (first_day >= 1),
  last_day INTEGER NOT NULL DEFAULT 30 CHECK (last_day >= 1),
  interval_days INTEGER NOT NULL DEFAULT 1 CHECK (interval_days >= 1),
  practice_type TEXT NOT NULL DEFAULT 'media' CHECK (practice_type IN ('media', 'theory', 'call')),
  description_html TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_activities_user_course ON student_custom_activities(user_id, course_id);

-- ═══════════════════════════════════════════════════════════
-- ACTIVITY VIDEOS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS activity_videos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL,
  video_type TEXT NOT NULL CHECK (video_type IN ('file', 'youtube', 'drive', 'link', 'audio_file', 'audio_link', 'image_file', 'image_link')),
  video_url TEXT NOT NULL,
  file_size BIGINT,
  duration_sec INT,
  first_day INT NOT NULL DEFAULT 1,
  last_day INT NOT NULL DEFAULT 1,
  interval_days INT NOT NULL DEFAULT 1 CHECK (interval_days >= 1),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id, activity_id, first_day, last_day)
);

CREATE INDEX IF NOT EXISTS idx_activity_videos_course ON activity_videos(course_id);
CREATE INDEX IF NOT EXISTS idx_activity_videos_lookup ON activity_videos(course_id, activity_id, first_day, last_day);

-- ═══════════════════════════════════════════════════════════
-- ACTIVITY CALLS (online sessions with master)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS activity_calls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL,
  day INTEGER NOT NULL CHECK (day >= 1),
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 30,
  room_url TEXT,                       -- Jitsi Meet room URL (https://meet.instep.life/<room>)
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_calls_course ON activity_calls(course_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_calls_day ON activity_calls(course_id, day);

CREATE TABLE IF NOT EXISTS call_attendance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id UUID NOT NULL REFERENCES activity_calls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  attended BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(call_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_call_attendance_call ON call_attendance(call_id);
CREATE INDEX IF NOT EXISTS idx_call_attendance_user ON call_attendance(user_id);

-- ═══════════════════════════════════════════════════════════
-- LEGACY (original single-course progress, kept for compat)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS activity_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  day INTEGER NOT NULL,
  activity_id TEXT NOT NULL,
  elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, day, activity_id)
);

-- ═══════════════════════════════════════════════════════════
-- DONE
-- ═══════════════════════════════════════════════════════════
