-- v27: Лист практик — переиспользуемые шаблоны активностей.
--
-- Идея: тренер создаёт активность в курсе → отмечает галочку «Сохранить в Лист»
-- → появляется запись в practice_library (принадлежит owner'у, не курсу).
-- При добавлении в другой курс — копируется целиком (активность + все медиа
-- с расписаниями). Расписание в самой библиотеке хранится как шаблон;
-- при копировании в курс clamp'ится по days_count.
--
-- Заложено на будущее: практики можно делать публичными (is_public=true) —
-- тогда любой пользователь сможет добавить их в свой персональный трекер.
--
-- ⚠️ Бэкап: /root/backups/pre-v27-practice-library-2026-08-26.sql
BEGIN;

CREATE TABLE IF NOT EXISTS practice_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  icon_num TEXT DEFAULT 'health/1',
  practice_type TEXT NOT NULL DEFAULT 'media' CHECK (practice_type IN ('media', 'theory', 'call')),
  description_html TEXT,
  duration_min INTEGER NOT NULL DEFAULT 10 CHECK (duration_min > 0),
  -- Шаблон расписания (по умолчанию 1-30). При копировании в курс clamp'ится.
  first_day INT DEFAULT 1,
  last_day INT DEFAULT 30,
  interval_days INT NOT NULL DEFAULT 1 CHECK (interval_days >= 1),
  excluded_days INT[] NOT NULL DEFAULT '{}',
  extra_days INT[] NOT NULL DEFAULT '{}',
  -- v27: задел на будущее — публичные практики в маркетплейсе.
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_practice_library_owner ON practice_library(owner_id);
CREATE INDEX IF NOT EXISTS idx_practice_library_public ON practice_library(is_public) WHERE is_public = TRUE;

-- Media внутри практики библиотеки — та же структура что activity_media,
-- но с ссылкой на practice_library вместо course/activity_id.
CREATE TABLE IF NOT EXISTS practice_library_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id UUID NOT NULL REFERENCES practice_library(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL DEFAULT 'video' CHECK (media_type IN ('video', 'audio', 'image', 'text', 'none')),
  source_type TEXT NOT NULL CHECK (source_type IN (
    'file', 'link', 'youtube', 'drive',
    'audio_file', 'audio_link',
    'image_file', 'image_link',
    'text', 'none'
  )),
  media_url TEXT NOT NULL,
  text_content TEXT,
  description_html TEXT,
  file_size BIGINT,
  duration_sec INT,
  first_day INT NOT NULL DEFAULT 1,
  last_day INT NOT NULL DEFAULT 1,
  interval_days INT NOT NULL DEFAULT 1 CHECK (interval_days >= 1),
  excluded_days INTEGER[] NOT NULL DEFAULT '{}',
  extra_days    INTEGER[] NOT NULL DEFAULT '{}',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pl_media_practice ON practice_library_media(practice_id);

-- Ссылка от активности к записи в library (для кнопки «Обновить в Листе»).
-- ON DELETE SET NULL — при удалении из библиотеки активность остаётся,
-- просто теряет связь.
ALTER TABLE course_activities
  ADD COLUMN IF NOT EXISTS library_practice_id UUID
    REFERENCES practice_library(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_activities_library ON course_activities(library_practice_id)
  WHERE library_practice_id IS NOT NULL;

-- Миграция накатывается под postgres, а приложение подключается под instep —
-- без явного GRANT новые таблицы будут возвращать «permission denied».
GRANT ALL PRIVILEGES ON TABLE practice_library, practice_library_media TO instep;

COMMIT;
