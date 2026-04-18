# Архитектура HealthWalk

## Общая схема

```
┌─────────────────────────────────────┐
│         Cloudflare Pages            │
│    (статический хостинг, SPA)       │
├─────────────────────────────────────┤
│         React SPA (Vite)            │
│  ┌───────────┐  ┌────────────────┐  │
│  │  App.jsx   │  │   Pages (15)   │  │
│  │ (роутинг,  │  │  Dashboard     │  │
│  │  стейт,    │  │  Timer         │  │
│  │  таймер)   │  │  TrainerCab    │  │
│  │            │  │  AskCoach ...  │  │
│  └─────┬──────┘  └───────┬────────┘  │
│        │                 │           │
│  ┌─────▼─────────────────▼────────┐  │
│  │         db.js (API слой)       │  │
│  │   Supabase Client SDK         │  │
│  └────────────┬───────────────────┘  │
└───────────────┼─────────────────────┘
                │ HTTPS
┌───────────────▼─────────────────────┐
│          Supabase                    │
│  ┌──────────┐  ┌─────────────────┐  │
│  │ Auth     │  │ PostgreSQL      │  │
│  │ (Google  │  │ + RLS           │  │
│  │  OAuth)  │  │ + RPC functions │  │
│  └──────────┘  └─────────────────┘  │
└──────────────────────────────────────┘
```

## Frontend

### Навигация

Приложение — SPA без react-router. Навигация через `screen` state в `App.jsx`:

```
Login → Dashboard ←→ Timer
                  ←→ Details
                  ←→ Profile
                  ←→ MyCourses ←→ CreateCourse / EditCourse
                  │            ←→ TrainerCabinet
                  ←→ MyTrackers ←→ CreateTracker / EditTracker
                  ←→ AskCoach
                  ←→ AssignRole (admin)
                  ←→ Recommendations
```

### Управление состоянием

Всё состояние живёт в `App.jsx` и передаётся через props:

| Состояние | Описание |
|-----------|----------|
| `user` | Текущий пользователь (из Supabase Auth) |
| `activeItem` | Активный курс или трекер |
| `currentDay` | Текущий день курса (1..N, пересчитывается каждые 30с) |
| `progress` | Прогресс: `{ day: { actId: { elapsed, completed } } }` |
| `rawProgress` | Сырые данные прогресса из БД |
| `elapsedTime` | Текущие секунды таймера: `{ actId: seconds }` |
| `exclusions` | Отключённые тренером активности: `{ "actId_day": true }` |
| `customActivities` | Индивидуальные практики от тренера |

### Таймер

`Timer.jsx` — полноэкранный круговой таймер:
- Поддержка drag по кругу для перемотки
- Wake Lock API (экран не гаснет)
- Автосохранение прогресса каждые 10 секунд
- По завершении — отметка `completed: true`

### Стили

Glassmorphism дизайн, определён в `shared.js`:
- `glass` — полупрозрачный фон с blur
- Зелёная цветовая палитра (`#27ae60`, `#2ecc71`)
- Мобильно-ориентированный (max-width: 500px)

## Backend (Supabase)

### Аутентификация

Google OAuth через Supabase Auth. После входа создаётся запись в `profiles`.

### Row Level Security (RLS)

Все таблицы защищены RLS-политиками:
- Пользователь видит только свои данные
- Тренер/куратор видит данные учеников своего курса
- Создатель курса имеет полный доступ
- Helper-функции `is_course_owner()`, `is_course_trainer()` (SECURITY DEFINER)

### RPC-функции

Бизнес-логика вынесена в PostgreSQL-функции:

| Функция | Назначение |
|---------|-----------|
| `invite_to_course` | Приглашение по email с проверками |
| `accept_invitation` | Принятие приглашения, создание enrollment |
| `get_course_students_info` | Информация об участниках курса |
| `send_message` | Отправка сообщения с проверкой enrollment |
| `get_conversation` | История чата между двумя участниками |
| `mark_messages_read` | Отметка сообщений прочитанными |
| `get_unread_count` | Общее количество непрочитанных |
| `get_course_staff` | Список контактов для чата |
| `get_unread_by_conversation` | Непрочитанные по собеседникам |

### Миграции

13 миграций (v1 — v13), применяются вручную через Supabase SQL Editor:

| Миграция | Содержание |
|----------|-----------|
| migration.sql | Базовые таблицы (profiles, progress) |
| v2_roles | Роли, enrollments, invitations, RLS |
| v3_trackers | Личные трекеры |
| v4_course_constructor | Конструктор курсов (activities) |
| v5_fixes | Фиксы RLS, constraints |
| v6_icon_folders | Иконки по папкам |
| v7_fix_auth_users | Доступ к auth.users |
| v8_trainer_cabinet | Кабинет тренера (toggle pause, progress view) |
| v9_trainer_edit_progress | Редактирование прогресса тренером |
| v10_trainer_edit_student | Индивидуальные практики, exclusions |
| v11_trainer_roles_fix | Мульти-тренер, is_owner |
| v13_messages | Система сообщений |

## Модель данных (ER)

```
profiles ←──── auth.users
    │
    ├── user_settings (timezone, day_start_hour, active_context)
    ├── user_roles (admin/student)
    │
    ├── courses ────────── course_activities
    │     │                     │
    │     ├── course_enrollments ─── course_progress
    │     │                          student_custom_activities
    │     │                          student_exclusions
    │     ├── pending_invitations
    │     └── messages
    │
    └── personal_trackers ─── tracker_practices
                               │
                               └── tracker_progress
```

## Потоки данных

### Выполнение практики
```
Dashboard → выбор активности → Timer.jsx
Timer: start → tick (каждую секунду) → автосохранение (каждые 10с)
                                     → завершение → saveProgress → DB
```

### Приглашение ученика
```
TrainerCabinet → email + role → invite_to_course (RPC)
                                  → pending_invitations
Ученик: Login → check pending → accept_invitation (RPC)
                                  → course_enrollments + delete invitation
```

### Обмен сообщениями
```
AskCoach / TrainerCabinet → send_message (RPC)
                              → messages table
                              → get_unread_count → оранжевые точки
```
