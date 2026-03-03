-- Migration V6: Переход на папочную структуру иконок
-- icon ID теперь строка вида "category/N", например "body/1", "nature/3"
-- Вместо INTEGER (1-101) теперь TEXT

-- 1. Меняем тип avatar_icon в courses
ALTER TABLE courses
  ALTER COLUMN avatar_icon TYPE TEXT USING avatar_icon::TEXT;

-- 2. Меняем тип icon_num в course_activities
ALTER TABLE course_activities
  ALTER COLUMN icon_num TYPE TEXT USING icon_num::TEXT,
  ALTER COLUMN icon_num SET DEFAULT 'body/1';

-- 3. Меняем тип avatar_icon в personal_trackers
ALTER TABLE personal_trackers
  ALTER COLUMN avatar_icon TYPE TEXT USING avatar_icon::TEXT;

-- 4. Меняем тип icon_num в tracker_practices
ALTER TABLE tracker_practices
  ALTER COLUMN icon_num TYPE TEXT USING icon_num::TEXT,
  ALTER COLUMN icon_num SET DEFAULT 'body/1';

-- 5. Конвертируем существующие числовые значения в новый формат "body/N"
-- (старые иконки заменены, поэтому ставим body/1 как дефолт)
UPDATE course_activities SET icon_num = 'body/1' WHERE icon_num IS NOT NULL AND icon_num NOT LIKE '%/%';
UPDATE personal_trackers SET avatar_icon = 'body/1' WHERE avatar_icon IS NOT NULL AND avatar_icon NOT LIKE '%/%';
UPDATE tracker_practices SET icon_num = 'body/1' WHERE icon_num IS NOT NULL AND icon_num NOT LIKE '%/%';
UPDATE courses SET avatar_icon = 'body/1' WHERE avatar_icon IS NOT NULL AND avatar_icon NOT LIKE '%/%';
