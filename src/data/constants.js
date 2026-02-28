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
 * Вычисляет текущий день курса (1-30).
 * День начинается в dayStartHour и заканчивается в dayStartHour следующего дня.
 */
export function getCourseDay(startDateISO, tzOffsetMin = null, dayStartHour = DAY_START_HOUR, maxDays = DAYS_TOTAL) {
  if (!startDateISO) return 1;

  const now = new Date();
  const offsetMin = tzOffsetMin !== null ? tzOffsetMin : -(now.getTimezoneOffset());

  const nowLocalMs = now.getTime() + offsetMin * 60 * 1000;
  const startLocalMs = new Date(startDateISO).getTime() + offsetMin * 60 * 1000;

  const shiftMs = dayStartHour * 60 * 60 * 1000;
  const nowShifted = Math.floor((nowLocalMs - shiftMs) / (24 * 60 * 60 * 1000));
  const startShifted = Math.floor((startLocalMs - shiftMs) / (24 * 60 * 60 * 1000));

  return Math.max(1, Math.min(nowShifted - startShifted + 1, maxDays));
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

export function isDayComplete(dayProgress) {
  if (!dayProgress) return false;
  return dayProgress.warmup && dayProgress.standing && dayProgress.sitting && dayProgress.walking;
}
