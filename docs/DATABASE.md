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
Глобальная роль на платформе: student / curator / trainer / admin.
Права внутри курса задаёт не она, а `course_enrollments.role` и владение
курсом. Глобальная роль влияет на кнопку «Создать курс» и админку.
Раздел «Созданные курсы» в «Моих курсах» виден любому владельцу курса.

| Колонка | Тип | Описание |
|---------|-----|----------|
| user_id | UUID PK | FK → users |
| role | TEXT | student / curator / trainer / admin |
| assigned_by | UUID | кто назначил |
| updated_at | TIMESTAMPTZ | обновляется при каждой смене роли |

**Назначение роли** (`POST /role/assign`, только admin): зарегистрированному
пользователю — сразу в `user_roles`. Если email ещё не зарегистрирован —
в `pending_roles`, применяется при регистрации/входе. До 2026-09-25 роль
всегда шла через `pending_roles` и незаметно применялась при следующем
входе, а экран по умолчанию предлагал «Ученик» — так владелец «Осознанной
Походки» потерял роль тренера.

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

## Группы курса (v29)

Один курс = несколько параллельных потоков со своими режимами зачёта дня,
датами старта и тренером/куратором. Ученик — ровно в одной группе (или
без группы: тогда работают курс-уровневые настройки).

**Приоритет источников effective-настроек:**
`enrollment.*_override ?? course_groups.* ?? courses.*`

Изменение настроек группы **не** трогает enrollments сразу. Отдельное
действие «Применить настройки группы участникам» обнуляет `*_override`
у всех enrollments группы.

### course_groups
| Колонка | Тип | Описание |
|---|---|---|
| id | UUID PK | |
| course_id | UUID | FK → courses, CASCADE |
| name | TEXT | UNIQUE (course_id, name) |
| avatar_icon / avatar_custom | TEXT | |
| progression_mode | TEXT | daily / free / self_paced |
| bound_to_calendar / start_date / access_days_after | | Календарные настройки |
| day_start_hour / tz_offset_min | INT | Время (NULL = user_settings) |
| trainer_id | UUID | FK → users, default = owner курса |
| curator_id | UUID | FK → users, nullable (задел на функционал) |
| sort_order | INT | |

### courses += `groups_enabled` BOOLEAN

Переключатель «зачёт по группам». UI/бекенд смотрят на него, чтобы
знать нужно ли применять групповую модель.

### course_enrollments += group_id + *_override
| Колонка | Тип | Описание |
|---|---|---|
| group_id | UUID | FK → course_groups, ON DELETE SET NULL |
| bound_to_calendar_override | BOOLEAN | NULL = наследуем |
| start_date_override | DATE | NULL = наследуем |
| access_days_after_override | INT | NULL = наследуем |
| day_start_hour_override | INT | NULL = наследуем |
| tz_offset_min_override | INT | NULL = наследуем |

(`progression_mode_override` уже был в v25.)

### pending_invitations += `group_id`
При приглашении сразу указываем группу, при accept enrollment создаётся
с этим group_id.

---

## Группа = стрела прогресса (v30)

v30 расширяет модель v29: группа теперь не только «параметры зачёта», но и
**собственный набор контента**. Разные группы одного курса могут иметь
разные практики, разное расписание и разные звонки. Прогресс ученика
привязан к его группе.

**Составной идентификатор**: `(course_id, group_id)` = уникальный
«инстанс курса» для конкретного потока.

### `course_groups.is_default BOOLEAN`
Ровно одна дефолтная группа на курс (UNIQUE index WHERE is_default).
Служит невидимым шаблоном для клонирования новых групп. Пока
`courses.groups_enabled=false` — эта группа не видна в UI, все ученики
и весь контент курса привязаны к ней.

### `group_id` в контентных и прогрессных таблицах
Все таблицы, где «жил» контент или прогресс, получили nullable
`group_id UUID REFERENCES course_groups ON DELETE CASCADE`:

- `course_activities.group_id` — практика per-group. Общий якорь между
  группами — `activity_id` (slug). При клонировании из шаблона slug
  сохраняется, что позволяет опционально перенести прогресс ученика при
  смене группы.
- `activity_media.group_id` — файлы/видео практики per-group. Тренер
  «начинашек» может залить более лёгкий контент в ту же практику.
- `activity_calls.group_id` — звонок per-group. Правило v30: звонок
  создаётся только для группы с `bound_to_calendar=true`.
- `course_progress.group_id` — прогресс ученика per-group.
- `course_day_closures.group_id` — закрытые дни per-group.
- `student_activity_exclusions.group_id` — исключения дней per-group.

**v30-1** (миграция `migration_v30_group_content.sql`): non-breaking —
столбцы nullable, backfill из is_default группы (для контента) и
enrollments.group_id (для прогресса). Старые UNIQUE-ограничения по
`course_id` сохранены, сервер работает как раньше.

**v30-2a**: сервер читает/пишет per-group. Все endpoints (создание курса,
активности, медиа, звонки, прогресс, closures, exclusions) принимают
`groupId` явно; без него — резолвим `is_default` группу курса (для
владельца) или `enrollment.group_id` (для ученика). Каждый новый курс
автоматически получает «Общую» is_default группу + owner-enrollment
привязан к ней.

**v30-2b** (миграция `migration_v30_2b_group_content_unique.sql`):
`UNIQUE(course_id, activity_id)` в `course_activities` заменён на
партиальный `UNIQUE(group_id, activity_id)` — клонирование шаблона в
новую группу сохраняет `activity_id` (slug), что позволит переносить
прогресс ученика между группами по совпадающему slug. `POST
/courses/:id/groups` теперь клонирует все `course_activities` +
`activity_media` из is_default в свежесозданную группу (activity_id
сохраняется, id новый; media_url ссылается на ту же папку файлов —
физическая копия не делается).

**v30-3** (миграция `migration_v30_3_finalize.sql`): все `group_id`
`SET NOT NULL`, партиальность UNIQUE ушла. UNIQUE в `course_progress` и
`student_activity_exclusions` пересобраны на `(user_id, group_id,
activity_id, day)`. PRIMARY KEY `course_day_closures` пересобран на
`(user_id, group_id, day)` — после смены группы ученик может закрыть тот
же день заново.

`PATCH /trainer/enrollments/:id/group` принимает `preserveProgress:
boolean`. При `true` — прогресс/closures/exclusions переезжают в новую
группу (при коллизии по slug в новой — записи новой затираются данными
старой). При `false` — данные старой группы удаляются, в новой группе
ученик начинает с нуля.

Правило: `POST /calls` создаёт звонок только когда `group.bound_to_calendar
= true`. Иначе 400 — в свободном режиме нет соответствия «день N ↔ дата».

Звонки (с 2026-09-28): один звонок на (группа, практика, день). Звонки потока
повторяют дни онлайн-практик, и с 2026-09-28 их создаёт и удаляет сервер
(`backend/callSync.js`, `syncGroupCalls`). На каждый отмеченный день создаётся звонок
на 10:00 по часовому поясу тренера из профиля, звонок на снятый день удаляется.
Синхронизация срабатывает при сохранении:
- дней или типа практики (`POST /courses/:id/activities`, `PATCH /activities/:id`);
- привязки или даты старта группы (`PATCH /groups/:id`) и при создании группы;
- дней, привязки, старта или режима групп курса (`PATCH /courses/:id/meta`).

Ответ несёт `callsChanged`, и редактор перечитывает звонки. Синхронизации одной
группы идут по очереди. Если поток не привязан к дате, звонки не трогаются. Раньше
это делал браузер (`CallSchedule`) при открытии редактора: при смене группы он видел
звонки старой группы и создавал дубли на все дни (28.09, «Группа 2»). `POST /calls`
идемпотентен. Сверка всех потоков: `node scripts/sync-calls.js` (вхолостую) или
`--apply`. Проведённый звонок (`recording_url`, `status='completed'`) или
звонок, в который заходили (`has_joins` в `GET /calls`), не удаляется: `DELETE`
отвечает 409, синхронизация его пропускает, крестика в строке нет. Крестик у дубля
удаляет его сразу, у единственного звонка дня — после подтверждения убирает день из
расписания практики.

UI перевода в TrainerCabinet: селектор группы → inline-подтверждение с
двумя кнопками «Сохранить прогресс» / «Начать заново» + «Отмена».

### Задания (v31, с 2026-09-30)

Практика `practice_type = 'task'`. У неё есть текст (тот же редактор, что у теории).
Ученик отвечает текстом и файлами (фото, видео, документы, до 200 МБ каждый), тренер
проверяет. Миграция `supabase/migration_v31_tasks.sql`.

Настройки в `course_activities` (и в `practice_library`, чтобы банк их не терял):
- `task_bound` — задание привязано к дате, то есть к своему дню. Если `false`,
  задание появляется в свой день и висит, пока не выполнено; дни не держит,
  напоминания не нужны;
- `task_required` — обязательное, держит день, пока не выполнено. Действует только
  для привязанного задания. Необязательное на закрытие дня не влияет;
- `task_review` — `false`: «Самостоятельно», ученик сам жмёт «Выполнено»;
  `true`: «С проверкой», тренер ставит зачёт или возвращает на доработку;
- `task_reminder` — дни напоминаний (JSONB в формате дней практики:
  `firstDay/lastDay/intervalDays/excludedDays/extraDays`), `NULL` — без напоминаний.
  В эти дни у ученика раздел «Невыполненные задания» с последним пропущенным днём
  задания: день 2 выполнен, день 5 нет, значит с 6-го висит «день 5».

Ответы: `task_submissions` — один на (ученик, задание, день), статусы `draft`,
`submitted`, `approved`, `returned` (с `review_comment`). Файлы лежат в
`task_submission_files`, на диске в `uploads/task-files/...`, отдаются только автору
и staff курса. День засчитывается уже по отправке ответа, в том числе «С проверкой».
Если тренер вернул ответ, задание снова в «Невыполненных».

Закрытие дня (`maybeAutoCloseDay`) учитывает задание, только если оно обязательное
и привязано к дате.

API ответов ученика: `GET /tasks/:courseId?groupId=` (мои ответы потока с файлами),
`PUT /tasks/draft` (черновик), `POST /tasks/:id/submit` (отправка: практика дня
выполнена, дальше автозакрытие дня). Файлы: `POST /files/task/:submissionId`,
`GET /files/task-file/:id` (автору и staff курса, `?download=1`), `DELETE` — пока ответ
не отправлен. Видео не перекодируется. При удалении задания файлы ответов убираются
с диска.

На экране курса (`Dashboard.jsx`) задание открывает свой экран `TaskPage.jsx`, а не
таймер. В карточке показан статус ответа. На сегодняшнем дне есть раздел «Невыполненные
задания»: последний пропущенный день привязанного задания в дни напоминаний, все
пропущенные дни задания без даты и возвращённые на доработку.

Готово: модель, конструктор, экран ученика. В конструкторе тип «Задание» пока видит
только администратор платформы. Дальше: проверка у тренера, прогресс и закрытие дня на
клиенте без необязательных заданий, перенос ответов при смене группы.

### Зачёт практик и закрытие дня (с 2026-09-27)

В режимах «По прохождению» / «Свободно» день закрывается (`course_day_closures`,
`closure_type='auto'`), когда выполнены все практики дня — `maybeAutoCloseDay`.
Её вызывают все три пути записи прогресса: сам участник (`POST /progress/course`),
ручной зачёт тренером (`POST /trainer/toggle-completion`) и журнал эфира
(`POST /calls/:id/attendance`). До 2026-09-27 два последних день не закрывали —
если зачёт тренера или эфир был последней практикой дня, ученик стоял на месте.

Практики, которые тренер исключил ученику на этот день (`student_activity_exclusions`),
не обязательны для закрытия. Само исключение (`POST /trainer/toggle-exclusion`) тоже
вызывает `maybeAutoCloseDay`: если исключили последнюю несделанную практику, день
закрывается. До 2026-09-28 исключённая практика держала день открытым навсегда
(bonnzufuss, «Группа 2», день 2 — не попал на эфир дня 3).

**Создатель курса (с 2026-09-28)** — участник каждого потока:
- на экране курса (`Dashboard.jsx`, `isCourseOwner`) у него открыты все дни: кликабельны
  будущие дни, «Начать» и вход в эфир доступны в любой день, в том числе до старта
  потока. Прогресс и закрытия дня пишутся в группе, выбранной селектором;
- в кабинете тренера (`/trainer/students`) он показан в каждой группе курса, кроме
  шаблона, где у него нет своей записи. Это виртуальная строка
  `enrollment_id = 'owner:<group_id>'`, `virtual_owner = true` с его прогрессом и
  закрытыми днями в этой группе. Ручной зачёт и исключения из такой строки уходят в её
  группу (`groupId` → `trainerTargetGroup`), пауза скрыта.

Журнал эфира (`callRoster`): участники группы звонка + staff курса не из этой
группы (владелец, тренеры/кураторы курса, тренер/куратор группы), если заходили в
звонок или это сам отмечающий. Отмечающий всегда «присутствовал». Так ведущая,
записанная в другую группу (владелец курса смотрит группу через селектор),
получает зачёт эфира в группе звонка.

### Настройки потока (с 2026-09-24)

Поток ученика — курс без групп либо его группа. Режим, привязка к дате и
дата старта берутся по одному правилу везде (сервер и клиент):
`enrollment.*_override → группа (только если courses.groups_enabled) → курс`.
Скрытая группа is_default при выключенных группах с курсом НЕ
синхронизируется — её настройки в этом случае не используются.

Даты дней на экране курса (с 2026-09-28): если поток привязан к дате старта, день N
показывается как «старт + (N−1)» у всех учеников, в любом режиме, даже если ученик
в эти дни ничего не делал (`Dashboard.jsx`, `dateForDay`). Без привязки: «По дням» —
от сегодняшнего дня курса; «по прохождению» — пройденный день датой закрытия, текущий
сегодняшней, будущие без даты.

| Сценарий | Счёт дней | До даты старта | Созвоны |
|---|---|---|---|
| По дням | от записи ученика | — | нельзя |
| По дням + дата | от даты старта | экран «до старта N дней» | можно |
| По прохождению / Свободно | по закрытым дням | — | нельзя |
| По прохождению / Свободно + дата | по закрытым дням, не раньше старта | экран «до старта N дней» | можно, опоздавшие смотрят запись |

Где применяется: `/items`, `getEffectiveMode`, `getEffectiveCalendar`,
`POST /calls`, `/trainer/students` (effective_mode / effective_bound /
effective_start_date), редактор созвонов (дата выбранной группы).

Смена даты старта группы (или курса без групп) сдвигает созвоны потока
со status='scheduled' на ту же разницу в днях, время сохраняется.

**Ключи прогресса.** `course_progress.activity_id` и
`student_activity_exclusions.activity_id` хранят UUID строки
`course_activities` (у каждой группы свои строки), а
`activity_calls.activity_id` — общий slug. Поэтому перевод ученика с
сохранением прогресса пересопоставляет UUID через slug.

**Селектор «Группа» на экране курса** (с 2026-09-25). Только в курсах по
группам. Кто какие группы открывает (`allowedViewGroups`): создатель курса —
любую, со всеми правами (прогресс и закрытые дни пишутся в выбранную
группу); тренер/куратор — только свои (группа записи + где он
`trainer_id`/`curator_id`); ученик — только свою. Если доступна одна
группа, селектора нет. `GET /items/course/:id?groupId=` — курс «как видит
группа»; в элементе `viewGroups`, `ownGroupId`, `viewGroupId`. Прогресс,
закрытие/открытие дня, исключения, медиа и созвоны принимают `groupId`;
недоступная группа молча заменяется своей (`resolveViewGroup`). Без
`groupId` — группа пользователя (раньше медиа и созвоны без него отдавались
из шаблона).

**Окно доступа к материалам** (`backend/access.js`, с 2026-09-24).
Дней после окончания: `enrollment.access_days_after_override`, если задан;
иначе значение группы (курс по группам) или курса. Пустое у группы/курса —
бессрочно, к уровню выше НЕ откатываемся. Пустое у ученика — «как у
группы/курса». Окончание: «По дням» — старт + days_count − 1;
прогрессивные — дата закрытия последнего дня (когда закрыты все).
Последний день доступа включительно = окончание + N (0 = только день
окончания). После него для ученика: `/items` → `accessExpired`, практики
без описаний (каркас для статистики); `/media`, `/calls` → `[]`; видеофайл
→ 403. Владелец и тренеры/кураторы курса не ограничиваются.

**Тип DATE.** `backend/db.js` отдаёт колонки DATE строкой `YYYY-MM-DD`
(`pg.types.setTypeParser(1082)`). Без этого pg делал из даты JS Date в
полночь MSK, и `toISOString().slice(0,10)` давал предыдущий день.

---

## Банк практик (Practice Library, v27)

Личный банк переиспользуемых практик тренера. Активность в курсе можно
«сохранить в лист» — получается снимок в `practice_library` + все media
в `practice_library_media`. Из другого курса можно multi-select добавить
несколько практик — копия целиком со всеми расписаниями (расписания
clamp'ятся по `days_count` целевого курса). Кнопка «Обновить в Листе»
перезаписывает snapshot из активности; unlink просто зануляет
`course_activities.library_practice_id`.

`is_public` — задел на будущее (публичная витрина).

### practice_library
| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID PK | |
| owner_id | UUID | FK → users, ON DELETE CASCADE |
| label | TEXT | Название |
| icon_num | TEXT | Иконка |
| practice_type | TEXT | media / theory / call |
| description_html | TEXT | |
| duration_min | INT | |
| first_day / last_day | INT | Шаблон расписания |
| interval_days | INT | |
| excluded_days / extra_days | INT[] | |
| is_public | BOOLEAN | Задел на витрину |
| created_at / updated_at | TIMESTAMPTZ | |

### practice_library_media
Та же структура, что `activity_media`, но с FK на `practice_library`.

### course_activities.library_practice_id
UUID, ON DELETE SET NULL. При удалении шаблона из библиотеки копии в
курсах не пропадают, просто теряют связь.

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
