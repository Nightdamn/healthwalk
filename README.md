# InStep

Платформа для мастеров и учеников — курсы и практики про тело, ум, энергию и реализацию. Мастера собирают курсы с активностями, ведут учеников и общаются через встроенный чат. Ученики выполняют ежедневные практики с таймером.

## Стек

- **Frontend:** React 18 + Vite (JSX, без TypeScript)
- **Backend:** Node.js 22 + Express, JWT
- **БД:** PostgreSQL 16
- **Хостинг:** Ubuntu 24.04 VDS + nginx + systemd
- **Домен:** [instep.life](https://instep.life)
- **Дизайн:** Glassmorphism, мобильно-ориентированный UI

## Быстрый старт

```bash
npm install
cp .env.example .env
npm run dev             # http://localhost:5173
```

Бэкенд:

```bash
cd backend
npm install
cp .env.example .env    # заполнить DB_*, JWT_SECRET
npm run dev             # http://localhost:3000
```

## Деплой

```bash
bash backend/scripts/deploy.sh
```

Первичная настройка сервера:

```bash
scp backend/scripts/setup-server.sh root@server:/tmp/
ssh root@server 'bash /tmp/setup-server.sh instep.life'
```

## Структура проекта

```
instep/
├── public/
│   ├── favicon.svg
│   ├── tracker-icons/        # SVG иконки по категориям
│   └── version.json          # версия APK для авто-обновления
├── src/
│   ├── components/           # Layout, Icons, IconPicker, Footer
│   ├── data/                 # constants, iconCatalog
│   ├── lib/                  # db.js, supabase.js (совместимость), updater.js
│   ├── pages/                # экраны приложения
│   ├── styles/               # glassmorphism
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── backend/
│   ├── server.js             # Express API
│   ├── db.js                 # PG client
│   ├── schema.sql
│   ├── nginx.conf            # nginx конфиг для prod
│   ├── instep.service        # systemd unit
│   └── scripts/              # setup-server.sh, deploy.sh
├── supabase/                 # SQL миграции (v1-v13)
├── docs/                     # ARCHITECTURE, DATABASE, ANDROID
├── ROADMAP.md
└── package.json
```

## Ключевые возможности

- **Курсы** — создание курсов с набором активностей, настройка длительности и интервалов
- **Роли** — создатель, тренер, куратор, ученик; гибкая система прав
- **Кабинет мастера** — просмотр прогресса учеников, индивидуальные практики, отключение активностей
- **Таймер** — круговой таймер с drag-управлением, wake lock, автосохранение
- **Видеозвонки** — интеграция Daily.co для групповых и персональных практик
- **Чат** — двусторонние сообщения мастер ↔ ученик с уведомлениями
- **Трекеры** — личные трекеры без мастера для самостоятельных практик
- **Экран завершения** — поздравление с результатами и диаграммами по окончании курса

## Документация

- [Архитектура](docs/ARCHITECTURE.md)
- [База данных](docs/DATABASE.md)
- [Android-приложение](docs/ANDROID.md)
- [Дорожная карта](ROADMAP.md)
