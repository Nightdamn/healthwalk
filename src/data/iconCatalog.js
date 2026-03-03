/**
 * Каталог иконок для трекера.
 * 148 иконок разложены по папкам /tracker-icons/{category}/{N}.svg
 * ID иконки = "category/N", например "body/1", "nature/3"
 */

const ICON_CATEGORIES = [
  { name: 'Тело',      folder: 'body',       count: 15 },
  { name: 'Движение',  folder: 'movement',   count: 12 },
  { name: 'Медитация', folder: 'meditation',  count: 12 },
  { name: 'Природа',   folder: 'nature',     count: 15 },
  { name: 'Вода',      folder: 'water',      count: 12 },
  { name: 'Ум',        folder: 'mind',       count: 13 },
  { name: 'Предметы',  folder: 'objects',    count: 15 },
  { name: 'Дыхание',   folder: 'breath',     count: 13 },
  { name: 'Геометрия', folder: 'geometry',   count: 13 },
  { name: 'Разное',    folder: 'misc',       count: 28 },
];

// Плоский массив всех ID для legacy-маппинга (число → строка)
const _allIds = [];
ICON_CATEGORIES.forEach(cat => {
  for (let i = 1; i <= cat.count; i++) _allIds.push(`${cat.folder}/${i}`);
});

/**
 * Получить путь к SVG по ID иконки.
 * @param {string|number} id — "body/1" или legacy число
 */
export function getIconPath(id) {
  if (!id) return null;
  // Новый формат: "folder/N"
  if (typeof id === 'string' && id.includes('/')) {
    return `/tracker-icons/${id}.svg`;
  }
  // Legacy: число → маппинг через плоский массив
  const num = typeof id === 'number' ? id : parseInt(id, 10);
  if (isNaN(num) || num < 1) return `/tracker-icons/body/1.svg`;
  const idx = Math.min(num - 1, _allIds.length - 1);
  return `/tracker-icons/${_allIds[idx]}.svg`;
}

/** Список icon ID для категории: ["body/1", "body/2", ...] */
export function getCategoryIcons(cat) {
  const ids = [];
  for (let i = 1; i <= cat.count; i++) ids.push(`${cat.folder}/${i}`);
  return ids;
}

export function getAllIcons() {
  return [..._allIds];
}

export default ICON_CATEGORIES;
