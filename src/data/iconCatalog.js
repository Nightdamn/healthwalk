/**
 * Каталог иконок для трекера.
 * Иконки из /tracker-icons/icon_N.svg
 * Категории можно перенастроить по необходимости.
 */

const ICON_CATEGORIES = [
  {
    name: 'Тело',
    icons: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  },
  {
    name: 'Движение',
    icons: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26],
  },
  {
    name: 'Медитация',
    icons: [27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39],
  },
  {
    name: 'Дыхание',
    icons: [40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52],
  },
  {
    name: 'Природа',
    icons: [53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65],
  },
  {
    name: 'Внимание',
    icons: [66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76],
  },
  {
    name: 'Энергия',
    icons: [77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88],
  },
  {
    name: 'Разное',
    icons: [89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101],
  },
];

export function getIconPath(num) {
  return `/tracker-icons/icon_${num}.svg`;
}

export function getAllIcons() {
  const all = [];
  ICON_CATEGORIES.forEach((cat) => cat.icons.forEach((n) => all.push(n)));
  return all;
}

export default ICON_CATEGORIES;
