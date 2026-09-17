-- v30-3 — финализация: group_id → NOT NULL везде, старые UNIQUE-констрейнты
-- по (course_id, activity_id) пересобраны на (group_id, activity_id).
--
-- К этому моменту:
--   • v30-1 добавила nullable group_id и заполнила бэкфил во всех 6 таблицах.
--   • v30-2a/b перевела сервер и клиент на per-group чтение/запись, все новые
--     INSERT'ы содержат group_id.
--   • Ручная проверка: у 0 строк group_id IS NULL.
-- После v30-3 партиальность в UNIQUE-индексах становится избыточной,
-- пересобираем без WHERE.

BEGIN;

-- 1) NOT NULL для всех group_id
ALTER TABLE course_enrollments          ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE course_activities           ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE activity_media              ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE activity_calls              ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE course_progress             ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE course_day_closures         ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE student_activity_exclusions ALTER COLUMN group_id SET NOT NULL;

-- 2) course_activities: партиальный UNIQUE → обычный UNIQUE
DROP INDEX IF EXISTS uq_course_activities_group_slug;
ALTER TABLE course_activities
  ADD CONSTRAINT uq_course_activities_group_slug UNIQUE (group_id, activity_id);

-- 3) course_progress: старый UNIQUE (user_id, course_id, activity_id, day) →
--    новый (user_id, group_id, activity_id, day). Разные группы одного курса
--    могут иметь свой прогресс по одному и тому же slug для одного ученика
--    (после перехода с preserveProgress=false старые записи удаляются, но
--    сама возможность независимости прогресса between-групп нужна).
ALTER TABLE course_progress
  DROP CONSTRAINT IF EXISTS course_progress_user_id_course_id_activity_id_day_key;
ALTER TABLE course_progress
  ADD CONSTRAINT course_progress_user_group_activity_day_key
  UNIQUE (user_id, group_id, activity_id, day);

-- 4) student_activity_exclusions: то же самое пересобирание
ALTER TABLE student_activity_exclusions
  DROP CONSTRAINT IF EXISTS student_activity_exclusions_user_id_course_id_activity_id_d_key;
ALTER TABLE student_activity_exclusions
  ADD CONSTRAINT student_activity_exclusions_user_group_activity_day_key
  UNIQUE (user_id, group_id, activity_id, day);

-- 5) course_day_closures: PK был (user_id, course_id, day). Разные группы —
--    самостоятельные потоки, ученик может (после перехода с preserveProgress=
--    false) закрыть тот же день в новой группе заново. Пересобираем PK.
ALTER TABLE course_day_closures
  DROP CONSTRAINT IF EXISTS course_day_closures_pkey;
ALTER TABLE course_day_closures
  ADD CONSTRAINT course_day_closures_pkey PRIMARY KEY (user_id, group_id, day);

COMMIT;

-- Sanity: посмотреть новые констрейнты
SELECT tc.table_name, tc.constraint_name, pg_get_constraintdef(pgc.oid)
FROM information_schema.table_constraints tc
JOIN pg_constraint pgc ON pgc.conname = tc.constraint_name
WHERE tc.constraint_type IN ('UNIQUE','PRIMARY KEY')
  AND tc.table_name IN ('course_activities','course_progress',
                         'student_activity_exclusions','course_day_closures')
ORDER BY tc.table_name, tc.constraint_name;
