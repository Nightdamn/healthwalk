-- v25: три режима зачёта дня в курсе.
--
-- 1) daily      — счётчик по календарю (текущее поведение, default)
-- 2) free       — день закрывается когда все практики выполнены на 100%
-- 3) self_paced — как free + ученик может нажать «Завершить день» (принудительно
--    закрыть с текущим прогрессом) и «Пройти день заново» (переоткрыть уже
--    закрытый день, чтобы допройти оставшиеся практики)
--
-- currentDay для non-daily режимов = min(day) не в course_day_closures.
-- courseFinished = closures.length === days_count.
--
-- В курсе выбирается ГЛОБАЛЬНЫЙ mode. У каждого enrollment можно
-- переопределить индивидуально (course_enrollments.progression_mode_override).
-- Effective mode = enrollment.override ?? course.progression_mode.
--
-- ⚠️ Бэкап /root/backups/pre-v25-progression-modes-2026-07-18.sql снят
--    перед применением.

BEGIN;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS progression_mode TEXT NOT NULL DEFAULT 'daily'
    CHECK (progression_mode IN ('daily', 'free', 'self_paced'));

ALTER TABLE course_enrollments
  ADD COLUMN IF NOT EXISTS progression_mode_override TEXT NULL
    CHECK (progression_mode_override IS NULL OR progression_mode_override IN ('daily', 'free', 'self_paced'));

CREATE TABLE IF NOT EXISTS course_day_closures (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  day INT NOT NULL CHECK (day >= 1),
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closure_type TEXT NOT NULL DEFAULT 'auto' CHECK (closure_type IN ('auto', 'forced')),
  PRIMARY KEY (user_id, course_id, day)
);
CREATE INDEX IF NOT EXISTS idx_day_closures_user_course ON course_day_closures(user_id, course_id);

COMMIT;
