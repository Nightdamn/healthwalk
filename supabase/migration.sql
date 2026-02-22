-- ═══════════════════════════════════════════════════════════
-- Осознанная Походка — Database Schema
-- Выполните этот SQL в Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════

-- 1. Настройки пользователя (таймзона, дата старта курса, текущий день)
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  course_start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tz_offset_min INTEGER NOT NULL DEFAULT 180,
  day_start_hour INTEGER NOT NULL DEFAULT 5 CHECK (day_start_hour BETWEEN 0 AND 23),
  current_day INTEGER NOT NULL DEFAULT 1 CHECK (current_day BETWEEN 1 AND 30),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Прогресс по активностям (elapsed_seconds + completed)
CREATE TABLE IF NOT EXISTS activity_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 30),
  activity_id TEXT NOT NULL CHECK (activity_id IN ('warmup', 'standing', 'sitting', 'walking')),
  elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, day, activity_id)
);

-- 3. Вопросы тренеру
CREATE TABLE IF NOT EXISTS questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- Row Level Security (RLS) — каждый видит только свои данные
-- ═══════════════════════════════════════════════════════════

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

-- user_settings: SELECT/INSERT/UPDATE только свои
CREATE POLICY "Users can view own settings"
  ON user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings"
  ON user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE USING (auth.uid() = user_id);

-- activity_progress: SELECT/INSERT/UPDATE только свои
CREATE POLICY "Users can view own progress"
  ON activity_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own progress"
  ON activity_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own progress"
  ON activity_progress FOR UPDATE USING (auth.uid() = user_id);

-- questions: SELECT/INSERT только свои
CREATE POLICY "Users can view own questions"
  ON questions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own questions"
  ON questions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════
-- Индексы для быстрых запросов
-- ═══════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_activity_progress_user_day
  ON activity_progress (user_id, day);
