-- v24: перестройка контента активности — универсальная activity_media вместо activity_videos.
--
-- Причина: одна практика теперь может содержать медиа разных типов на разные дни
-- (видео / аудио / изображение / текст / без медиа), у каждого своё описание. Раньше
-- теория была отдельным practice_type='theory' с общим description_html на всю
-- активность; видео жили в activity_videos.
--
-- Что делаем в этой миграции:
--   1) RENAME activity_videos → activity_media
--      RENAME video_url → media_url
--      RENAME video_type → source_type
--   2) ADD activity_media.media_type ∈ {video, audio, image, text, none}
--      ADD activity_media.text_content — HTML для media_type='text'
--      ADD activity_media.description_html — «Введение к уроку» на КАЖДОМ медиа
--   3) BACKFILL: перенос course_activities.description_html на ПЕРВОЕ медиа
--      каждой активности (у которой уже есть хотя бы одно media_video).
--   4) BACKFILL: для practice_type='theory' создаём одно activity_media
--      с media_type='text', text_content = description_html, календарь =
--      календарь активности. Затем переводим practice_type в 'media'.
--   5) Очищаем course_activities.description_html (переехало в activity_media).
--   6) Обновляем CHECK-constraint на practice_type ∈ {media, call}.
--
-- ⚠️ Бэкап /root/backups/pre-v25-media-refactor-2026-07-05.sql (pg_dump) снят
--    ДО этой миграции.

BEGIN;

-- 1. Переименовать таблицу и колонки.
ALTER TABLE activity_videos RENAME TO activity_media;
ALTER TABLE activity_media RENAME COLUMN video_url TO media_url;
ALTER TABLE activity_media RENAME COLUMN video_type TO source_type;

-- Индексы/constraints, содержащие "video" в имени — Postgres сам rename не сделает.
-- Проверяем аккуратно:
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_activity_videos_activity') THEN
    ALTER INDEX idx_activity_videos_activity RENAME TO idx_activity_media_activity;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_activity_videos_course') THEN
    ALTER INDEX idx_activity_videos_course RENAME TO idx_activity_media_course;
  END IF;
END $$;

-- 2. Новые колонки.
ALTER TABLE activity_media
  ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'video'
    CHECK (media_type IN ('video', 'audio', 'image', 'text', 'none')),
  ADD COLUMN IF NOT EXISTS text_content TEXT,
  ADD COLUMN IF NOT EXISTS description_html TEXT;

-- 3. Расширяем CHECK на source_type — text/none легитимные значения
-- (использовались раньше как video_type: file/youtube/drive/link/audio_*/image_*).
ALTER TABLE activity_media DROP CONSTRAINT IF EXISTS activity_videos_video_type_check;
ALTER TABLE activity_media DROP CONSTRAINT IF EXISTS activity_media_source_type_check;
ALTER TABLE activity_media ADD CONSTRAINT activity_media_source_type_check
  CHECK (source_type IN (
    'file', 'link', 'youtube', 'drive',
    'audio_file', 'audio_link',
    'image_file', 'image_link',
    'text', 'none'
  ));

-- 4. Перенос course_activities.description_html на ПЕРВОЕ media каждой
-- media-практики (у которой сейчас уже есть хотя бы один activity_media).
-- Связь через activity_id (text — оба поля text, НЕ UUID id).
WITH first_media AS (
  SELECT DISTINCT ON (activity_id) id, activity_id, course_id
    FROM activity_media
   ORDER BY activity_id, COALESCE(sort_order, 0), created_at
)
UPDATE activity_media am
   SET description_html = ca.description_html
  FROM first_media fm
  JOIN course_activities ca
    ON ca.activity_id = fm.activity_id AND ca.course_id = fm.course_id
 WHERE am.id = fm.id
   AND ca.description_html IS NOT NULL
   AND ca.description_html <> ''
   AND ca.practice_type = 'media';

-- 5. Мигрируем theory-практики: создаём одно activity_media с media_type='text'
-- на весь календарь активности. text_content = description_html.
INSERT INTO activity_media
  (course_id, activity_id, media_type, source_type, media_url, text_content,
   description_html, file_size, duration_sec,
   first_day, last_day, interval_days, sort_order,
   excluded_days, extra_days)
SELECT
  ca.course_id, ca.activity_id, 'text', 'text', '', ca.description_html,
  NULL, 0, NULL,
  COALESCE(ca.first_day, 1),
  COALESCE(ca.last_day, 1),
  COALESCE(ca.interval_days, 1),
  0,
  COALESCE(ca.excluded_days, '{}'::int[]),
  COALESCE(ca.extra_days, '{}'::int[])
  FROM course_activities ca
 WHERE ca.practice_type = 'theory';

-- 6. Переводим practice_type theory → media.
UPDATE course_activities SET practice_type = 'media' WHERE practice_type = 'theory';

-- 7. Очищаем description_html на media-практиках (переехало в activity_media).
UPDATE course_activities SET description_html = NULL WHERE practice_type = 'media';

-- 8. Обновляем CHECK-constraint на practice_type.
ALTER TABLE course_activities DROP CONSTRAINT IF EXISTS course_activities_practice_type_check;
ALTER TABLE course_activities
  ADD CONSTRAINT course_activities_practice_type_check
  CHECK (practice_type IN ('media', 'call'));

COMMIT;
