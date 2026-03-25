/**
 * Каталог иконок для трекера.
 * 101 иконка разложена по папкам /tracker-icons/{category}/{N}.svg
 * ID иконки = "category/N", например "health/1", "travel/3"
 */

const ICON_CATEGORIES = [
  { name: 'ЗОЖ',      folder: 'health',   count: 24 },
  { name: 'Работа',    folder: 'work',     count: 15 },
  { name: 'Разное',    folder: 'misc',     count: 17 },
  { name: 'Хобби',     folder: 'hobby',    count: 10 },
  { name: 'В дороге',  folder: 'travel',   count: 9 },
  { name: 'Отдых',     folder: 'rest',     count: 8 },
  { name: 'Медиа',     folder: 'media',    count: 6 },
  { name: 'Еда',       folder: 'food',     count: 5 },
  { name: 'Покупки',   folder: 'shopping', count: 4 },
  { name: 'Любовь',    folder: 'love',     count: 3 },
];

// Плоский массив всех ID для legacy-маппинга
const _allIds = [];
ICON_CATEGORIES.forEach(cat => {
  for (let i = 1; i <= cat.count; i++) _allIds.push(`${cat.folder}/${i}`);
});

/**
 * Получить путь к SVG по ID иконки.
 * @param {string|number} id — "health/1" или legacy число
 */
export function getIconPath(id) {
  if (!id) return null;
  if (typeof id === 'string' && id.includes('/')) {
    return `/tracker-icons/${id}.svg`;
  }
  // Legacy: число → маппинг через плоский массив
  const num = typeof id === 'number' ? id : parseInt(id, 10);
  if (isNaN(num) || num < 1) return `/tracker-icons/health/1.svg`;
  const idx = Math.min(num - 1, _allIds.length - 1);
  return `/tracker-icons/${_allIds[idx]}.svg`;
}

/** Список icon ID для категории: ["health/1", "health/2", ...] */
export function getCategoryIcons(cat) {
  const ids = [];
  for (let i = 1; i <= cat.count; i++) ids.push(`${cat.folder}/${i}`);
  return ids;
}

export function getAllIcons() {
  return [..._allIds];
}

export default ICON_CATEGORIES;
