# База данных InStep

## Основные таблицы

### profiles
Профили пользователей, создаются при первом входе.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID PK | = auth.users.id |
| name | TEXT | Имя пользователя |
| avatar_url | TEXT | URL аватара (Google) |
| created_at | TIMESTAMPTZ | Дата создания |

### user_settings
Настройки пользователя (1:1 с profiles).

| Колонка | Тип | Описание |
|---------|-----|----------|
| user_id | UUID PK | FK → profiles |
| tz_offset_min | INT | Сдвиг часового пояса (минуты) |
| day_start_hour | INT | Час начала дня (0-23, default 5) |
| current_day | INT | Текущий день курса |
| active_context_type | TEXT | 'course' или 'tracker' |
| active_context_id | UUID | ID активного курса/трекера |

### user_roles
Глобальные роли (admin, student).

| Колонка | Тип | Описание |
|---------|-----|----------|
| user_id | UUID PK | FK → profiles |
| role | TEXT | 'admin' или 'student' |

---

## Курсы

### courses
| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID PK | |
| owner_id | UUID | FK → profiles (создатель) |
| title | TEXT NOT NULL | Название |
| description | TEXT | Описание |
| days_count | INT | Длительность в днях (default 30) |
| avatar_icon | TEXT | Ключ иконки (e.g. 'health/1') |
| avatar_custom | TEXT | URL кастомной аватарки |
| created_at | TIMESTAMPTZ | |

### course_activities
Активности курса (шаблонные, для всех учеников).

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID PK | |
| course_id | UUID | FK → courses |
| activity_id | TEXT | Строковый ID ('warmup', etc.) |
| label | TEXT | Название |
| duration_min | INT | Длительность в минутах |
| icon_num | TEXT | Ключ иконки |
| first_day | INT | Начальный день (default 1) |
| last_day | INT | Последний день |
| interval_days | INT | Интервал повторения (default 1) |
| sort_order | INT | Порядок отображения |

### course_enrollments
Записи учеников на курс.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID PK | |
| course_id | UUID | FK → courses |
| user_id | UUID | FK → profiles |
| role | TEXT | 'student', 'curator', 'trainer' |
| paused | BOOLEAN | На паузе (default false) |
| joined_at | TIMESTAMPTZ | Дата записи |

UNIQUE(course_id, user_id)

### course_progress
Прогресс ученика по активностям.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID PK | |
| user_id | UUID | FK → profiles |
| course_id | UUID | FK → courses |
| activity_id | TEXT | ID активности |
| day | INT | Номер дня |
| elapsed_seconds | INT | Секунды выполнения |
| completed | BOOLEAN | Завершена |
| updated_at | TIMESTAMPTZ | |

UNIQUE(user_id, course_id, activity_id, day)

### student_custom_activities
Индивидуальные практики, назначенные тренером конкретному ученику.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID PK | |
| course_id | UUID | FK → courses |
| user_id | UUID | FK → profiles (ученик) |
| label | TEXT | Название |
| icon_num | TEXT | Иконка |
| duration_min | INT | Длительность |
| first_day | INT | С какого дня |
| last_day | INT | По какой день |
| interval_days | INT | Интервал |
| created_by | UUID | FK → profiles (тренер) |
| created_at | TIMESTAMPTZ | |

### student_exclusions
Отключение стандартной активности для ученика на конкретный день.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID PK | |
| course_id | UUID | FK → courses |
| user_id | UUID | FK → profiles |
| activity_id | TEXT | ID активности |
| day | INT | Номер дня |
| created_by | UUID | |

UNIQUE(course_id, user_id, activity_id, day)

### pending_invitations
Приглашения в курс (по email).

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID PK | |
| course_id | UUID | FK → courses |
| email | TEXT | Email приглашённого |
| role | TEXT | Назначаемая роль |
| invited_by | UUID | Кто пригласил |
| created_at | TIMESTAMPTZ | |

---

## Трекеры

### personal_trackers
Личные трекеры (без тренера).

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID PK | |
| user_id | UUID | FK → profiles |
| title | TEXT | Название |
| days_count | INT | Длительность |
| avatar_icon | TEXT | Иконка |
| avatar_custom | TEXT | Кастомная аватарка |
| start_date | DATE | Дата начала |
| created_at | TIMESTAMPTZ | |

### tracker_practices
Практики трекера.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID PK | |
| tracker_id | UUID | FK → personal_trackers |
| label | TEXT | Название |
| duration_min | INT | Длительность |
| icon_num | TEXT | Иконка |
| first_day | INT | С дня (default 1) |
| last_day | INT | По день |
| interval_days | INT | Интервал |
| sort_order | INT | Порядок |

### tracker_progress
| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID PK | |
| user_id | UUID | FK → profiles |
| tracker_id | UUID | FK → personal_trackers |
| practice_id | UUID | FK → tracker_practices |
| day | INT | |
| elapsed_seconds | INT | |
| completed | BOOLEAN | |
| updated_at | TIMESTAMPTZ | |

---

## Сообщения

### messages
Чат между участниками курса.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID PK | |
| course_id | UUID | FK → courses |
| sender_id | UUID | FK → profiles |
| recipient_id | UUID | FK → profiles |
| body | TEXT | Текст (max 500) |
| is_read | BOOLEAN | Прочитано (default false) |
| created_at | TIMESTAMPTZ | |

Индексы: sender+course, recipient+unread, course+participants.

### activity_videos
Видеоинструкции к активностям курса с привязкой к интервалам дней.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID PK | |
| course_id | UUID | FK → courses |
| activity_id | TEXT | ID активности |
| video_type | TEXT | 'file', 'youtube', 'drive', 'link' |
| video_url | TEXT | Путь в Storage / URL |
| file_size | BIGINT | Размер файла в байтах |
| duration_sec | INT | Длительность в секундах |
| first_day | INT | С какого дня показывать (default 1) |
| last_day | INT | По какой день (default 1) |
| sort_order | INT | Приоритет при пересечении (default 0) |
| created_at | TIMESTAMPTZ | |

UNIQUE(course_id, activity_id, first_day, last_day). Файлы хранятся в bucket `course-videos` (private), доступ через signed URL (TTL 1 час).

---

## RPC-функции

| Функция | Тип | Назначение |
|---------|-----|-----------|
| `invite_to_course(p_course_id, p_email, p_role, p_invited_by)` | SECURITY DEFINER | Создаёт приглашение, проверяет дубликаты |
| `accept_invitation(p_invitation_id)` | SECURITY DEFINER | Принимает приглашение, создаёт enrollment |
| `decline_invitation(p_invitation_id)` | SECURITY DEFINER | Отклоняет приглашение |
| `get_course_students_info(p_course_id)` | SECURITY DEFINER | Возвращает участников с профилями |
| `send_message(p_course_id, p_recipient_id, p_body)` | SECURITY DEFINER | Отправка сообщения с проверкой enrollment |
| `get_conversation(p_course_id, p_other_user_id)` | SECURITY DEFINER | История чата между двумя пользователями |
| `mark_messages_read(p_course_id, p_sender_id)` | SECURITY DEFINER | Отметка входящих как прочитанных |
| `get_unread_count()` | SECURITY DEFINER | Общее число непрочитанных |
| `get_course_staff(p_course_id)` | SECURITY DEFINER | Контакты для чата (staff для ученика, все для тренера) |
| `get_unread_by_conversation()` | SECURITY DEFINER | Непрочитанные сгруппированные по собеседникам |
| `is_course_owner(p_course_id)` | SECURITY DEFINER | Проверка: текущий пользователь — создатель курса? |
| `is_course_trainer(p_course_id)` | SECURITY DEFINER | Проверка: текущий пользователь — тренер/владелец курса? |

---

## RLS-политики (основные)

| Таблица | Политика | Доступ |
|---------|----------|--------|
| courses | SELECT | Enrolled users + owner |
| courses | INSERT/UPDATE/DELETE | Owner only |
| course_enrollments | SELECT | Same course participants |
| course_progress | SELECT | Own + trainer of course |
| course_progress | INSERT/UPDATE | Own only |
| messages | SELECT | sender_id or recipient_id = auth.uid() |
| messages | INSERT | sender_id = auth.uid() |
| personal_trackers | ALL | Own only (user_id = auth.uid()) |
