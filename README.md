# Осознанная Походка

30-дневный курс осознанного движения. Веб-приложение на React + Vite, деплой на Cloudflare Pages.

## Структура проекта

```
osoznannaya-pohodka/
├── public/
│   ├── favicon.svg
│   └── _redirects          # SPA fallback для Cloudflare Pages
├── src/
│   ├── components/
│   │   ├── Footer.jsx
│   │   ├── Icons.jsx       # SVG-иконки (фигурки, логотип)
│   │   └── Layout.jsx      # Общий layout с фоном
│   ├── data/
│   │   └── constants.js    # Активности, девизы, утилиты
│   ├── pages/
│   │   ├── Login.jsx       # Вход / регистрация
│   │   ├── Dashboard.jsx   # Главный экран
│   │   ├── Timer.jsx       # Таймер с видео
│   │   ├── Details.jsx     # Детали прогресса (сетка 30 дней)
│   │   ├── Profile.jsx
│   │   ├── Recommendations.jsx
│   │   └── AskCoach.jsx    # Вопрос тренеру
│   ├── styles/
│   │   └── shared.js       # Общие стили (glassmorphism)
│   ├── App.jsx             # Роутинг + состояние
│   ├── main.jsx            # Точка входа
│   └── index.css           # Глобальные стили
├── index.html
├── package.json
├── vite.config.js
├── wrangler.toml           # Конфиг Cloudflare
└── .gitignore
```

## Локальный запуск

```bash
npm install
npm run dev
```

Откроется на `http://localhost:5173`

## Деплой на Cloudflare Pages

### Вариант 1: Через GitHub (рекомендуется)

1. Создайте репозиторий на GitHub и залейте код:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USER/osoznannaya-pohodka.git
git push -u origin main
```

2. Зайдите в [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages → Create a project
3. Подключите GitHub-репозиторий
4. Настройки сборки:
   - **Framework preset:** None
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
5. Нажмите Deploy

### Вариант 2: Через CLI

```bash
npm run build
npx wrangler pages deploy dist --project-name=osoznannaya-pohodka
```

## Подключение Supabase (следующий шаг)

1. Создайте проект на [supabase.com](https://supabase.com)
2. Включите Google Auth в Authentication → Providers
3. Создайте таблицы:

```sql
-- Профили пользователей
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Прогресс по дням
CREATE TABLE progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 30),
  warmup BOOLEAN DEFAULT FALSE,
  standing BOOLEAN DEFAULT FALSE,
  sitting BOOLEAN DEFAULT FALSE,
  walking BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, day)
);

-- Вопросы тренеру
CREATE TABLE questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

4. Добавьте переменные окружения в Cloudflare Pages:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

## Стек

- **Frontend:** React 18 + Vite
- **Хостинг:** Cloudflare Pages
- **БД/Авторизация:** Supabase (готово к подключению)
- **Дизайн:** Glassmorphism, белая тема
