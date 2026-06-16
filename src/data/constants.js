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

// Format a UTC ISO string in an explicit minute-offset timezone (e.g. 180 = MSK).
// Browser tz is ignored — `tzMin` comes from user_settings (the profile, which
// is the only reliable source when users may be on VPN).
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export function formatInTz(utcIsoString, tzMin) {
  if (!utcIsoString) return '';
  const t = new Date(utcIsoString).getTime() + (Number(tzMin) || 0) * 60000;
  const d = new Date(t);
  const day = d.getUTCDate();
  const mon = MONTHS_SHORT[d.getUTCMonth()];
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day} ${mon}, ${hh}:${mm}`;
}

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
 * День ученика в момент создания активности — чтобы не показывать активность
 * в днях до того, как ученик её "увидел". Если activity создана до joined_at,
 * вернёт 1 (никакого сдвига).
 */
export function studentDayAtTime(joinedAtISO, atTimeISO) {
  if (!joinedAtISO || !atTimeISO) return 1;
  const j = new Date(joinedAtISO).getTime();
  const t = new Date(atTimeISO).getTime();
  if (!isFinite(j) || !isFinite(t) || t <= j) return 1;
  return Math.floor((t - j) / 86400000) + 1;
}

/**
 * Effective first_day для конкретного ученика. Обрезает прошлые дни:
 * если ученик на дне 5 в момент добавления активности с firstDay=1,
 * у этого ученика она появится только с дня 5. Pattern (интервал)
 * остаётся привязан к оригинальному firstDay.
 */
export function effectiveFirstDay(originalFirstDay, activityCreatedAt, joinedAt) {
  const base = originalFirstDay || 1;
  if (!activityCreatedAt || !joinedAt) return base;
  return Math.max(base, studentDayAtTime(joinedAt, activityCreatedAt));
}

// Single source of truth for "is activity A scheduled on day D".
// Layers (in order):
//   1. Effective first_day (drops days student already passed when activity
//      was added later — see effectiveFirstDay).
//   2. last_day window.
//   3. interval_days step from the ORIGINAL first_day (so the pattern is
//      stable across students).
//   4. extra_days: trainer explicitly turned this day ON outside the interval.
//   5. excluded_days: trainer explicitly turned this day OFF — wins over
//      everything else.
// `activity` keys can be either camelCase (frontend shape: firstDay, lastDay,
// intervalDays, excludedDays, extraDays, createdAt) or snake_case (raw DB
// rows). Both are accepted.
// Same shape as isActivityScheduled but for an activity_videos row. Videos
// don't get the per-student effective-first-day clamp (a video is attached to
// the course, not to a particular student's join date), so this is the simpler
// of the two: interval + extra/excluded.
//   inInterval = day in [first_day..last_day] AND (day-first_day) % interval == 0
//   on         = (inInterval OR day ∈ extra_days) AND day ∉ excluded_days
// Accepts both camelCase (frontend) and snake_case (raw DB) keys.
export function isVideoScheduled(video, day) {
  if (!video || !Number.isFinite(day)) return false;
  const firstDay = video.firstDay ?? video.first_day ?? 1;
  const lastDay  = video.lastDay  ?? video.last_day  ?? 30;
  const interval = video.intervalDays ?? video.interval_days ?? 1;
  const excluded = video.excludedDays ?? video.excluded_days ?? [];
  const extra    = video.extraDays    ?? video.extra_days    ?? [];

  if (excluded.includes(day)) return false;
  if (extra.includes(day)) return true;
  if (day < firstDay || day > lastDay) return false;
  const step = Math.max(1, interval);
  return ((day - firstDay) % step) === 0;
}

export function isActivityScheduled(activity, day, joinedAt) {
  if (!activity || !Number.isFinite(day)) return false;
  const firstDay = activity.firstDay ?? activity.first_day ?? 1;
  const lastDay  = activity.lastDay  ?? activity.last_day  ?? 30;
  const interval = activity.intervalDays ?? activity.interval_days ?? 1;
  const excluded = activity.excludedDays ?? activity.excluded_days ?? [];
  const extra    = activity.extraDays    ?? activity.extra_days    ?? [];
  const createdAt = activity.createdAt   ?? activity.created_at;

  if (excluded.includes(day)) return false;
  if (extra.includes(day)) {
    // Extra still respects the "added after student passed this day" clamp
    // — otherwise a freshly-added extra-day on day 1 would suddenly appear
    // in day 1 of a student who's already on day 7.
    const effFirst = effectiveFirstDay(firstDay, createdAt, joinedAt);
    return day >= effFirst;
  }
  const effFirst = effectiveFirstDay(firstDay, createdAt, joinedAt);
  if (day < effFirst || day > lastDay) return false;
  const step = Math.max(1, interval);
  return ((day - firstDay) % step) === 0;
}

// Take a schedule (firstDay, lastDay, intervalDays, excludedDays, extraDays)
// and tighten it so the numeric inputs match what the calendar visually shows.
// Recomputes the actual ON-days from the current state, then collapses the
// window to [min..max] of those days and trims excluded/extra entries that
// fall outside that new window (they're now moot).
//
// Example: practice was day 1–10 every day; trainer taps off days 1..6 in
// the calendar → excluded_days=[1..6]. After normalize: firstDay=7, lastDay=10,
// excluded_days=[]. Numeric inputs now agree with the calendar.
//
// Returns null if the toggle left zero ON-days (caller should keep the
// previous window so the activity stays editable).
export function normalizeSchedule(item, maxDay) {
  const fd = item.firstDay ?? item.first_day ?? 1;
  const ld = item.lastDay ?? item.last_day ?? maxDay;
  const iv = Math.max(1, item.intervalDays ?? item.interval_days ?? 1);
  const excluded = new Set(item.excludedDays ?? item.excluded_days ?? []);
  const extra = new Set(item.extraDays ?? item.extra_days ?? []);
  const onDays = [];
  for (let d = 1; d <= maxDay; d++) {
    if (excluded.has(d)) continue;
    if (extra.has(d)) { onDays.push(d); continue; }
    if (d < fd || d > ld) continue;
    if (((d - fd) % iv) === 0) onDays.push(d);
  }
  if (onDays.length === 0) return null;
  const newFirst = onDays[0];
  const newLast = onDays[onDays.length - 1];
  return {
    firstDay: newFirst,
    lastDay: newLast,
    excludedDays: [...excluded].filter(d => d >= newFirst && d <= newLast).sort((a, b) => a - b),
    extraDays: [...extra].filter(d => d >= newFirst && d <= newLast).sort((a, b) => a - b),
  };
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

