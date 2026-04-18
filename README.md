# HealthWalk

Платформа для ведения курсов осознанного движения и здоровья. Тренеры создают курсы с активностями, приглашают учеников, отслеживают прогресс и общаются через встроенный чат. Ученики выполняют ежедневные практики с таймером.

## Стек

- **Frontend:** React 18 + Vite (JSX, без TypeScript)
- **Backend/БД:** Supabase (PostgreSQL + Auth + RLS)
- **Хостинг:** Cloudflare Pages
- **Дизайн:** Glassmorphism, мобильно-ориентированный UI

## Быстрый старт

```bash
npm install
cp .env.example .env   # заполнить VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY
npm run dev             # http://localhost:5173
```

## Деплой

```bash
npm run build
npm run deploy          # Cloudflare Pages через wrangler
```

Или через GitHub: подключить репозиторий в Cloudflare Pages Dashboard, build command `npm run build`, output `dist`.

## Структура проекта

```
healthwalk/
├── public/
│   ├── favicon.svg
│   ├── tracker-icons/        # SVG иконки по категориям (health, food, hobby...)
│   └── _redirects             # SPA fallback для Cloudflare
├── src/
│   ├── components/
│   │   ├── Footer.jsx         # Подвал
│   │   ├── IconPicker.jsx     # Выбор иконки для активности
│   │   ├── Icons.jsx          # SVG-компоненты (логотип, фигурки)
│   │   └── Layout.jsx         # Общий layout с градиентным фоном
│   ├── data/
│   │   ├── constants.js       # Девизы, утилиты времени, getCourseDay()
│   │   └── iconCatalog.js     # Каталог иконок по категориям
│   ├── lib/
│   │   ├── db.js              # Все запросы к Supabase (CRUD, RPC)
│   │   └── supabase.js        # Инициализация клиента Supabase
│   ├── pages/
│   │   ├── Login.jsx          # Авторизация (Google OAuth)
│   │   ├── Dashboard.jsx      # Главный экран + экран завершения курса
│   │   ├── Timer.jsx          # Таймер практики (круговой, с drag)
│   │   ├── Details.jsx        # Детальный прогресс (сетка дней)
│   │   ├── Profile.jsx        # Профиль, часовой пояс, биоритм
│   │   ├── MyCourses.jsx      # Список курсов пользователя
│   │   ├── CreateCourse.jsx   # Конструктор курса
│   │   ├── EditCourse.jsx     # Редактирование курса
│   │   ├── MyTrackers.jsx     # Личные трекеры
│   │   ├── CreateTracker.jsx  # Создание трекера
│   │   ├── EditTracker.jsx    # Редактирование трекера
│   │   ├── TrainerCabinet.jsx # Кабинет тренера (управление учениками)
│   │   ├── AskCoach.jsx       # Чат ученик ↔ тренер
│   │   ├── InviteToCourse.jsx # Принятие приглашения в курс
│   │   ├── AssignRole.jsx     # Назначение ролей (админ)
│   │   └── Recommendations.jsx # Рекомендации
│   ├── styles/
│   │   └── shared.js          # Glassmorphism стили
│   ├── App.jsx                # Роутинг, состояние, таймер
│   ├── main.jsx               # Точка входа React
│   └── index.css              # Глобальные стили
├── supabase/                  # SQL миграции (v1-v13)
├── docs/                      # Документация проекта
│   ├── ARCHITECTURE.md
│   └── DATABASE.md
├── ROADMAP.md
└── package.json
```

## Ключевые возможности

- **Курсы** — создание курсов с набором активностей, настройка длительности и интервалов
- **Роли** — создатель, тренер, куратор, ученик; гибкая система прав
- **Кабинет тренера** — просмотр прогресса учеников, индивидуальные практики, отключение активностей
- **Таймер** — круговой таймер с drag-управлением, wake lock, автосохранение
- **Чат** — двусторонние сообщения тренер ↔ ученик с уведомлениями
- **Трекеры** — личные трекеры без тренера для самостоятельных практик
- **Экран завершения** — поздравление с результатами и диаграммами по окончании курса

## Документация

- [Архитектура](docs/ARCHITECTURE.md)
- [База данных](docs/DATABASE.md)
- [Дорожная карта](ROADMAP.md)
