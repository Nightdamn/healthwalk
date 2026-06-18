-- v22: календарная привязка + срок доступа после окончания
--
-- bound_to_calendar — флаг "привязать к календарю". Когда TRUE:
--   - все ученики стартуют относительно courses.start_date (не joined_at).
--   - если current_date < start_date — курс виден через план,
--     но дни не идут (Dashboard показывает день 0, прогресс заморожен).
-- При FALSE сохраняется текущее поведение: старт = joined_at студента.
--
-- start_date — дата фактического начала курса (только если bound_to_calendar=TRUE).
--
-- access_days_after — после окончания курса (start_date + days_count - 1)
--   материалы и практики остаются доступны указанное число дней.
--   NULL = бессрочно.

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS bound_to_calendar BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS access_days_after INTEGER
    CHECK (access_days_after IS NULL OR access_days_after >= 0);
