-- v32 (2026-10-13): своя длительность курса у потока (группы).
-- NULL — как у курса (courses.days_count). Действует, только если курс по
-- группам (courses.groups_enabled) — то же правило, что у остальных настроек
-- потока: группа → курс.
-- Аддитивная: новый столбец без значения, существующие данные не меняются.

ALTER TABLE course_groups
  ADD COLUMN IF NOT EXISTS days_count INTEGER
  CHECK (days_count IS NULL OR (days_count >= 1 AND days_count <= 365));
