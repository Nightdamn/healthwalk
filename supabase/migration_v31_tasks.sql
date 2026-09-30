-- v31 (2026-09-30): практика «Задание» (practice_type = 'task').
--
-- Задание — практика с текстом (тот же редактор, что у теории), на которую
-- ученик отвечает текстом и файлами (фото, видео, документы). Выполнение:
--   «Самостоятельно» (task_review = false) — ученик сам жмёт «Выполнено»;
--   «С проверкой»    (task_review = true)  — ученик отправляет ответ, тренер
--     ставит зачёт или возвращает на доработку. День засчитывается уже по
--     отправке; возвращённое задание снова попадает в «Невыполненные».
-- task_bound — привязано к дате: задание своего дня. Обязательное
--   (task_required) держит день, пока не выполнено. Невыполненное показывается
--   в «Невыполненных заданиях» в дни напоминаний (task_reminder) — только за
--   последний пропущенный день.
-- Без привязки (task_bound = false): появляется в свой день и висит, пока не
--   выполнено; дни не держит, напоминания не нужны.
--
-- Аддитивная миграция: новые столбцы с безопасными значениями по умолчанию,
-- новые таблицы. Существующие данные не меняются.

BEGIN;

ALTER TABLE course_activities DROP CONSTRAINT IF EXISTS course_activities_practice_type_check;
ALTER TABLE course_activities ADD CONSTRAINT course_activities_practice_type_check
  CHECK (practice_type IN ('media', 'theory', 'call', 'task'));
ALTER TABLE practice_library DROP CONSTRAINT IF EXISTS practice_library_practice_type_check;
ALTER TABLE practice_library ADD CONSTRAINT practice_library_practice_type_check
  CHECK (practice_type IN ('media', 'theory', 'call', 'task'));
ALTER TABLE student_custom_activities DROP CONSTRAINT IF EXISTS student_custom_activities_practice_type_check;
ALTER TABLE student_custom_activities ADD CONSTRAINT student_custom_activities_practice_type_check
  CHECK (practice_type IN ('media', 'theory', 'call', 'task'));

-- Настройки задания. У остальных типов практик не используются.
-- task_reminder: дни напоминаний в том же виде, что дни практики —
-- {"firstDay":2,"lastDay":17,"intervalDays":1,"excludedDays":[],"extraDays":[]};
-- NULL — без напоминаний.
ALTER TABLE course_activities
  ADD COLUMN IF NOT EXISTS task_bound    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS task_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS task_review   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS task_reminder JSONB;
ALTER TABLE practice_library
  ADD COLUMN IF NOT EXISTS task_bound    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS task_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS task_review   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS task_reminder JSONB;

-- Ответ ученика на задание конкретного дня.
-- status: draft — черновик (не отправлен); submitted — отправлен (для
-- «Самостоятельно» это и есть «Выполнено»); approved — тренер зачёл;
-- returned — тренер вернул на доработку (review_comment).
CREATE TABLE IF NOT EXISTS task_submissions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id      UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  group_id       UUID NOT NULL REFERENCES course_groups(id) ON DELETE CASCADE,
  activity_id    UUID NOT NULL REFERENCES course_activities(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day            INTEGER NOT NULL CHECK (day >= 1),
  answer_text    TEXT,
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'submitted', 'approved', 'returned')),
  submitted_at   TIMESTAMPTZ,
  reviewed_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at    TIMESTAMPTZ,
  review_comment TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, activity_id, day)
);
CREATE INDEX IF NOT EXISTS idx_task_submissions_course_status ON task_submissions (course_id, status);
CREATE INDEX IF NOT EXISTS idx_task_submissions_group ON task_submissions (group_id);

-- Файлы ответа. Лежат в backend/uploads/task-files/<course>/<user>/<submission>/,
-- отдаются только автору ответа и staff курса.
CREATE TABLE IF NOT EXISTS task_submission_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES task_submissions(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('image', 'video', 'document')),
  original_name TEXT NOT NULL,
  mime          TEXT NOT NULL,
  size_bytes    BIGINT NOT NULL,
  storage_path  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_submission_files_submission ON task_submission_files (submission_id);

COMMIT;
