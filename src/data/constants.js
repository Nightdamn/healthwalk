export const DAYS_TOTAL = 30;
export const DAY_START_HOUR = 5; // день начинается в 5:00

export const MOTTOS = [
  "Каждый шаг — это выбор",
  "Тело помнит всё",
  "Дыши и двигайся",
  "Слушай своё тело",
  "Присутствуй в каждом шаге",
  "Баланс начинается изнутри",
  "Легкость в движении",
  "Стопа — фундамент тела",
  "Осознанность через движение",
  "Путь начинается с шага",
  "Гравитация — твой друг",
  "Расслабь плечи, выдохни",
  "Каждый день — новый шаг",
  "Движение — это жизнь",
  "Чувствуй землю под ногами",
  "Внимание к деталям",
  "Свобода в теле",
  "Шаг за шагом к себе",
  "Позвоночник — ось жизни",
  "Двигайся с удовольствием",
  "Грация в простоте",
  "Тело знает путь",
  "Ритм твоего дыхания",
  "Пространство внутри шага",
  "Мягкость — это сила",
  "Почувствуй опору",
  "Центр — внутри тебя",
  "Шагай уверенно",
  "Открой новые ощущения",
  "Ты — это движение",
];

export const ACTIVITIES = [
  { id: "warmup", label: "Разминка", duration: 20 },
  { id: "standing", label: "Стояние", duration: 10 },
  { id: "sitting", label: "Сидение", duration: 10 },
  { id: "walking", label: "Прогулка", duration: 30 },
];

export const defaultProgress = () => {
  const p = {};
  for (let d = 1; d <= DAYS_TOTAL; d++) {
    p[d] = { warmup: false, standing: false, sitting: false, walking: false };
  }
  return p;
};

export const formatTime = (s) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

/**
 * Вычисляет текущий день курса (1-30) на основе даты старта.
 * День начинается в DAY_START_HOUR (5:00) по локальному времени пользователя
 * и заканчивается в DAY_START_HOUR следующего календарного дня.
 *
 * @param {string} startDateISO — ISO дата начала курса (напр. "2025-02-20T05:00:00")
 * @param {number} tzOffsetMin — смещение таймзоны в минутах (напр. 180 для UTC+3)
 * @returns {number} день курса (1..30), или 30 если курс завершён
 */
export function getCourseDay(startDateISO, tzOffsetMin = null) {
  if (!startDateISO) return 1;

  // Текущее время в мс
  const now = new Date();

  // Если tzOffset не задан, используем локальное время браузера
  // getTimezoneOffset() возвращает разницу UTC-local в минутах (UTC+3 → -180)
  const offsetMin = tzOffsetMin !== null ? tzOffsetMin : -(now.getTimezoneOffset());

  // Переводим "сейчас" в минуты от эпохи + смещение TZ
  const nowUtcMs = now.getTime();
  const nowLocalMs = nowUtcMs + offsetMin * 60 * 1000;

  // Парсим дату старта, приводим к тому же локальному времени
  const startUtcMs = new Date(startDateISO).getTime();
  const startLocalMs = startUtcMs + offsetMin * 60 * 1000;

  // "Логический день" = календарный день со сдвигом на DAY_START_HOUR
  // Отнимаем DAY_START_HOUR часов, чтобы 04:59 считалось предыдущим днём
  const shiftMs = DAY_START_HOUR * 60 * 60 * 1000;

  const nowShifted = Math.floor((nowLocalMs - shiftMs) / (24 * 60 * 60 * 1000));
  const startShifted = Math.floor((startLocalMs - shiftMs) / (24 * 60 * 60 * 1000));

  const dayNum = nowShifted - startShifted + 1;

  return Math.max(1, Math.min(dayNum, DAYS_TOTAL));
}

/**
 * Возвращает дату начала курса (первый день в 5:00 локального времени).
 * Если сейчас до 5:00 — старт был вчера в 5:00.
 */
export function getDefaultStartDate() {
  const now = new Date();
  const d = new Date(now);
  if (now.getHours() < DAY_START_HOUR) {
    d.setDate(d.getDate() - 1);
  }
  d.setHours(DAY_START_HOUR, 0, 0, 0);
  return d.toISOString();
}

/**
 * Проверяет, завершён ли день (все 4 практики выполнены)
 */
export function isDayComplete(dayProgress) {
  if (!dayProgress) return false;
  return dayProgress.warmup && dayProgress.standing && dayProgress.sitting && dayProgress.walking;
}
