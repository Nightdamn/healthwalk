export const DAYS_TOTAL = 30;
export const DAY_START_HOUR = 5; // дефолт, пользователь может изменить в Профиль → Биоритм

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

export const formatTime = (s) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

/**
 * Вычисляет текущий день курса (1-30).
 * День начинается в dayStartHour и заканчивается в dayStartHour следующего дня.
 */
export function getCourseDay(startDateISO, tzOffsetMin = null, dayStartHour = DAY_START_HOUR, maxDays = DAYS_TOTAL) {
  if (!startDateISO) return 1;

  const now = new Date();
  const offsetMin = tzOffsetMin !== null ? tzOffsetMin : -(now.getTimezoneOffset());

  // Current "logical day" index: shift UTC → local, then subtract dayStartHour.
  const nowShifted = now.getTime() + offsetMin * 60 * 1000 - dayStartHour * 60 * 60 * 1000;
  const nowDayIdx = Math.floor(nowShifted / 86400000);

  // Start date: if it's a bare YYYY-MM-DD, treat as a calendar day directly
  // (day 1 spans from dayStartHour of that date). Otherwise shift like "now".
  let startDayIdx;
  if (/^\d{4}-\d{2}-\d{2}$/.test(startDateISO)) {
    const [y, m, d] = startDateISO.split('-').map(Number);
    startDayIdx = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  } else {
    const startShifted = new Date(startDateISO).getTime() + offsetMin * 60 * 1000 - dayStartHour * 60 * 60 * 1000;
    startDayIdx = Math.floor(startShifted / 86400000);
  }

  return Math.max(1, Math.min(nowDayIdx - startDayIdx + 1, maxDays));
}

/**
 * Возвращает true если курс полностью завершён (все дни прошли).
 */
export function isCourseFinished(startDateISO, tzOffsetMin = null, dayStartHour = DAY_START_HOUR, maxDays = DAYS_TOTAL) {
  if (!startDateISO) return false;

  const now = new Date();
  const offsetMin = tzOffsetMin !== null ? tzOffsetMin : -(now.getTimezoneOffset());

  const nowShifted = now.getTime() + offsetMin * 60 * 1000 - dayStartHour * 60 * 60 * 1000;
  const nowDayIdx = Math.floor(nowShifted / 86400000);

  let startDayIdx;
  if (/^\d{4}-\d{2}-\d{2}$/.test(startDateISO)) {
    const [y, m, d] = startDateISO.split('-').map(Number);
    startDayIdx = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  } else {
    const startShifted = new Date(startDateISO).getTime() + offsetMin * 60 * 1000 - dayStartHour * 60 * 60 * 1000;
    startDayIdx = Math.floor(startShifted / 86400000);
  }

  return (nowDayIdx - startDayIdx + 1) > maxDays;
}

/**
 * Возвращает ISO дату начала курса (первый день в dayStartHour).
 */
export function getDefaultStartDate(dayStartHour = DAY_START_HOUR) {
  const now = new Date();
  const d = new Date(now);
  if (now.getHours() < dayStartHour) {
    d.setDate(d.getDate() - 1);
  }
  d.setHours(dayStartHour, 0, 0, 0);
  return d.toISOString();
}

