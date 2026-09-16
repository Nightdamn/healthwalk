-- v29: Группы внутри курса.
--
-- Идея: один курс может обслуживать несколько параллельных потоков —
-- у каждого свой режим зачёта дня, своё начало, свой тренер/куратор.
-- Ученик состоит ровно в одной группе (course_enrollments.group_id).
--
-- Приоритет источников effective-настроек для ученика:
--   enrollment.<field> ?? group.<field> ?? course.<field> (?? user_settings)
-- То есть индивидуальный override у enrollment всегда сильнее.
--
-- Настройки группы — «шаблон»: при изменении их у самой группы можно
-- одним действием применить ко всем участникам (bulk UPDATE enrollments).
--
-- ⚠️ Бэкап перед накаткой: /root/backups/pre-v29-course-groups-2026-09-16.sql

BEGIN;

-- 1) courses: включатель режима «по группам»
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS groups_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) course_groups — сами группы
CREATE TABLE IF NOT EXISTS course_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar_icon TEXT DEFAULT 'health/1',
  avatar_custom TEXT,
  -- Шаблонные настройки — применяются к enrollments действием
  -- «Применить настройки группы участникам» (bulk UPDATE).
  progression_mode TEXT NOT NULL DEFAULT 'daily'
    CHECK (progression_mode IN ('daily', 'free', 'self_paced')),
  bound_to_calendar BOOLEAN NOT NULL DEFAULT FALSE,
  start_date DATE,
  access_days_after INTEGER CHECK (access_days_after IS NULL OR access_days_after >= 0),
  day_start_hour INTEGER CHECK (day_start_hour IS NULL OR (day_start_hour BETWEEN 0 AND 23)),
  tz_offset_min INTEGER,
  -- Персонал группы. По умолчанию trainer_id = owner курса (см. backend).
  trainer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  curator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (course_id, name)
);
CREATE INDEX IF NOT EXISTS idx_course_groups_course ON course_groups(course_id);
CREATE INDEX IF NOT EXISTS idx_course_groups_trainer ON course_groups(trainer_id) WHERE trainer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_course_groups_curator ON course_groups(curator_id) WHERE curator_id IS NOT NULL;

-- 3) course_enrollments: привязка к группе + индивидуальные override'ы
--    временных настроек. progression_mode_override уже был.
ALTER TABLE course_enrollments
  ADD COLUMN IF NOT EXISTS group_id UUID
    REFERENCES course_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bound_to_calendar_override BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS start_date_override DATE NULL,
  ADD COLUMN IF NOT EXISTS access_days_after_override INTEGER NULL
    CHECK (access_days_after_override IS NULL OR access_days_after_override >= 0),
  ADD COLUMN IF NOT EXISTS day_start_hour_override INTEGER NULL
    CHECK (day_start_hour_override IS NULL OR (day_start_hour_override BETWEEN 0 AND 23)),
  ADD COLUMN IF NOT EXISTS tz_offset_min_override INTEGER NULL;

CREATE INDEX IF NOT EXISTS idx_enrollments_group ON course_enrollments(group_id) WHERE group_id IS NOT NULL;

-- 4) pending_invitations: сразу приглашаем в конкретную группу
ALTER TABLE pending_invitations
  ADD COLUMN IF NOT EXISTS group_id UUID
    REFERENCES course_groups(id) ON DELETE SET NULL;

-- GRANT новой таблицы приложению
GRANT ALL PRIVILEGES ON TABLE course_groups TO instep;

COMMIT;
