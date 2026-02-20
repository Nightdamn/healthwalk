import React from 'react';

// ═══════════════════════════════════════════════════════════════
// Разминка — стик-фигура делает боковую растяжку
// Рука поднята вверх и изогнута дугой вправо над головой
// Широкая стойка, тело наклонено вправо
// ═══════════════════════════════════════════════════════════════
export const WarmupIcon = ({ size = 36, color = "#1a1a2e" }) => (
  <svg width={size} height={size} viewBox="0 0 64 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Голова — контурный круг */}
    <circle cx="28" cy="12" r="7" stroke={color} strokeWidth="3.5" fill="none" />
    {/* Левая рука — дуга вверх и вправо над головой */}
    <path
      d="M24 22 C18 16 16 8 20 2 C26 -2 36 0 40 8 C42 12 42 16 40 20"
      stroke={color} strokeWidth="3.5" strokeLinecap="round" fill="none"
    />
    {/* Тело — изогнутое вправо */}
    <path
      d="M30 19 C33 28 38 38 42 46"
      stroke={color} strokeWidth="3.5" strokeLinecap="round"
    />
    {/* Правая рука — вниз вдоль тела вправо */}
    <path
      d="M34 26 C38 30 42 36 44 40"
      stroke={color} strokeWidth="3.5" strokeLinecap="round"
    />
    {/* Левая нога */}
    <path
      d="M42 46 C38 54 32 64 26 74"
      stroke={color} strokeWidth="3.5" strokeLinecap="round"
    />
    {/* Правая нога */}
    <path
      d="M42 46 C46 54 50 64 54 74"
      stroke={color} strokeWidth="3.5" strokeLinecap="round"
    />
  </svg>
);

// ═══════════════════════════════════════════════════════════════
// Стояние — простая иконка стоящего человека (как на указателях)
// Круглая голова, прямоугольное тело, прямые ноги, руки вдоль тела
// ═══════════════════════════════════════════════════════════════
export const StandingIcon = ({ size = 36, color = "#1a1a2e" }) => (
  <svg width={size} height={size} viewBox="0 0 48 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Голова */}
    <circle cx="24" cy="10" r="7" stroke={color} strokeWidth="3.5" fill="none" />
    {/* Тело — прямоугольник с закруглёнными углами */}
    <rect
      x="12" y="20" width="24" height="28" rx="3" ry="3"
      stroke={color} strokeWidth="3.5" fill="none"
    />
    {/* Левая нога */}
    <line x1="18" y1="48" x2="18" y2="74" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
    {/* Правая нога */}
    <line x1="30" y1="48" x2="30" y2="74" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
  </svg>
);

// ═══════════════════════════════════════════════════════════════
// Сидение — поза лотоса / медитация
// Контурная голова, тело прямое, руки на коленях, ноги скрещены
// ═══════════════════════════════════════════════════════════════
export const SittingIcon = ({ size = 36, color = "#1a1a2e" }) => (
  <svg width={size} height={size} viewBox="0 0 72 68" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Точка над головой (элемент осознанности) */}
    <circle cx="36" cy="4" r="2.5" fill={color} />
    {/* Голова */}
    <circle cx="36" cy="15" r="7" stroke={color} strokeWidth="3.5" fill="none" />
    {/* Тело */}
    <line x1="36" y1="22" x2="36" y2="40" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
    {/* Левая рука — от плеча к левому колену */}
    <path
      d="M36 28 C30 32 22 36 16 40"
      stroke={color} strokeWidth="3.5" strokeLinecap="round"
    />
    {/* Правая рука — от плеча к правому колену */}
    <path
      d="M36 28 C42 32 50 36 56 40"
      stroke={color} strokeWidth="3.5" strokeLinecap="round"
    />
    {/* Левая нога — колено наружу, стопа к центру */}
    <path
      d="M36 40 C30 42 20 46 14 50 C18 54 28 56 36 54"
      stroke={color} strokeWidth="3.5" strokeLinecap="round" fill="none"
    />
    {/* Правая нога — колено наружу, стопа к центру */}
    <path
      d="M36 40 C42 42 52 46 58 50 C54 54 44 56 36 54"
      stroke={color} strokeWidth="3.5" strokeLinecap="round" fill="none"
    />
  </svg>
);

// ═══════════════════════════════════════════════════════════════
// Прогулка — кроссовок / спортивная обувь с линиями скорости
// Вид сбоку, носок смотрит вправо-вверх, 3 линии скорости слева
// ═══════════════════════════════════════════════════════════════
export const WalkingIcon = ({ size = 36, color = "#1a1a2e" }) => (
  <svg width={size} height={size} viewBox="0 0 80 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Линии скорости */}
    <line x1="2" y1="30" x2="16" y2="30" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <line x1="6" y1="38" x2="18" y2="38" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <line x1="4" y1="46" x2="16" y2="46" stroke={color} strokeWidth="3" strokeLinecap="round" />
    {/* Подошва */}
    <path
      d="M24 54 C24 54 26 52 30 50 L62 42 C66 41 70 42 72 44 L74 46 C75 48 74 50 72 52 L68 54 C64 56 28 58 24 54 Z"
      stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    {/* Верх кроссовка — основная форма */}
    <path
      d="M30 50 C28 46 26 40 28 34 C30 28 34 24 38 20 C40 18 44 16 48 16 C52 16 54 18 56 20 C58 24 60 30 62 34 L66 40 C68 41 68 42 66 42 L62 42"
      stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    {/* Язычок / верхняя часть */}
    <path
      d="M42 20 C44 14 48 10 52 12 C54 13 54 16 52 18"
      stroke={color} strokeWidth="3" strokeLinecap="round" fill="none"
    />
    {/* Шнуровка */}
    <line x1="42" y1="24" x2="50" y2="22" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    <line x1="40" y1="30" x2="48" y2="28" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    {/* Декоративная линия подошвы */}
    <path
      d="M28 52 C32 50 56 44 70 48"
      stroke={color} strokeWidth="2" strokeLinecap="round" fill="none"
    />
  </svg>
);

// ═══════════════════════════════════════════════════════════════
// Логотип «Осознанная Походка» — фигура + текст в 2 строки
// ═══════════════════════════════════════════════════════════════
export const LogoFull = ({ height = 48 }) => (
  <svg height={height} viewBox="0 0 210 52" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(2, 2)">
      <path d="M14 4 C14 4 13 18 14 28 C15 38 14 48 14 48" stroke="#1a1a2e" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="14" cy="8" r="4.5" stroke="#1a1a2e" strokeWidth="1.8" fill="none" />
      <path d="M14 24 C11 21 8 18 5 15" stroke="#1a1a2e" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14 24 C17 21 20 18 23 15" stroke="#1a1a2e" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M13 40 C12 43 10 46 8 48" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" />
      <path d="M15 40 C16 43 18 46 20 48" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" />
    </g>
    <text x="36" y="22" fontFamily="'Onest', sans-serif" fontSize="18" fontWeight="800" fill="#1a1a2e">Осознанная</text>
    <text x="36" y="44" fontFamily="'Onest', sans-serif" fontSize="18" fontWeight="800" fill="#1a1a2e">Походка</text>
  </svg>
);

export const Logo = ({ size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 28 52" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 4 C14 4 13 16 14 26 C15 36 14 48 14 48" stroke="#1a1a2e" strokeWidth="2.2" strokeLinecap="round" />
    <circle cx="14" cy="8" r="4.5" stroke="#1a1a2e" strokeWidth="1.8" fill="none" />
    <path d="M14 24 C12 22 8 18 6 16" stroke="#1a1a2e" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M14 24 C16 22 20 18 22 16" stroke="#1a1a2e" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M13 40 C12 43 10 48 9 50" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" />
    <path d="M15 40 C16 43 18 48 19 50" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const activityIcons = {
  warmup: WarmupIcon,
  standing: StandingIcon,
  sitting: SittingIcon,
  walking: WalkingIcon,
};
