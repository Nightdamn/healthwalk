-- v30-2b — UNIQUE(course_id, activity_id) → UNIQUE(group_id, activity_id).
-- Клонирование новой группы из шаблона сохраняет slug activity_id, чтобы
-- переход ученика с preserveProgress мог найти соответствующие практики
-- по slug. При старом ограничении такой INSERT падал бы конфликтом.
--
-- Это минимальный breaking-шаг: клиент/сервер уже не пишут activity_id
-- дублями по курсу (все INSERT'ы в v30-2a привязаны к конкретной группе).

BEGIN;

ALTER TABLE course_activities
  DROP CONSTRAINT IF EXISTS course_activities_course_id_activity_id_key;

-- Партиальный UNIQUE: только среди строк с group_id (после v30-3 group_id
-- станет NOT NULL, и партиальность станет избыточной, но пока — защита).
CREATE UNIQUE INDEX IF NOT EXISTS uq_course_activities_group_slug
  ON course_activities(group_id, activity_id)
  WHERE group_id IS NOT NULL;

COMMIT;
