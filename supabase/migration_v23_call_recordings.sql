-- v23: запись звонков (Jibri) — поля в activity_calls для готовой записи
-- recording_url        — публичная ссылка на mp4 (стрим через nginx с jibri-сервера)
-- recording_duration_sec — длительность реальной записи (для UI «32:14»)
-- recording_finished_at  — timestamp когда finalize-скрипт залил файл
-- room_name             — короткое имя комнаты (часть room_url после слеша),
--                         нужно webhook'у для матча: Jibri знает только room_name,
--                         нам быстрее SELECT по room_name чем парсить room_url.
ALTER TABLE activity_calls
  ADD COLUMN IF NOT EXISTS recording_url TEXT,
  ADD COLUMN IF NOT EXISTS recording_duration_sec INT,
  ADD COLUMN IF NOT EXISTS recording_finished_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS room_name TEXT;

-- Бэкфилл room_name из существующего room_url для старых звонков:
-- URL формата https://meet.instep.life/instep-<courseId8>-d<day>-<rand>
UPDATE activity_calls
   SET room_name = regexp_replace(room_url, '^https?://[^/]+/', '')
 WHERE room_name IS NULL AND room_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_calls_room_name ON activity_calls(room_name);
