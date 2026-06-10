import React from 'react';

const GREEN = '#27ae60';

// Visual day calendar matching the TrainerCabinet "Прогресс по дням" grid.
// Each cell = one course day, rounded-square 26×26, full green when scheduled,
// pale grey when not. Click toggles inclusion.
//
// Props:
//   daysCount     total course length
//   firstDay/lastDay/intervalDays/excludedDays/extraDays  same shape as on the
//                                                         activity row
//   onToggle(day) called with the day number 1..daysCount
export default function ScheduleCalendar({
  daysCount = 30,
  firstDay = 1,
  lastDay = 30,
  intervalDays = 1,
  excludedDays = [],
  extraDays = [],
  onToggle,
}) {
  const fd = Math.max(1, parseInt(firstDay) || 1);
  const ld = Math.min(daysCount, Math.max(fd, parseInt(lastDay) || daysCount));
  const iv = Math.max(1, parseInt(intervalDays) || 1);
  const excSet = new Set(excludedDays || []);
  const extSet = new Set(extraDays || []);

  const isOn = (d) => {
    if (excSet.has(d)) return false;
    if (extSet.has(d)) return true;
    if (d < fd || d > ld) return false;
    return ((d - fd) % iv) === 0;
  };

  const days = [];
  for (let d = 1; d <= daysCount; d++) days.push(d);

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {days.map(d => (
          <DayCell key={d} day={d} on={isOn(d)} onClick={() => onToggle?.(d)} />
        ))}
      </div>
      <div style={{ marginTop: 6, fontSize: 10, color: '#888' }}>
        Тап по дню — включить/выключить. Зелёный — практика идёт, серый — нет.
      </div>
    </div>
  );
}

function DayCell({ day, on, onClick }) {
  const SZ = 26, R = 5;
  return (
    <svg
      width={SZ} height={SZ} viewBox={`0 0 ${SZ} ${SZ}`}
      onClick={onClick}
      style={{ display: 'block', cursor: 'pointer', flexShrink: 0 }}
    >
      <title>День {day}{on ? ' (тап — выключить)' : ' (тап — включить)'}</title>
      <rect x={0} y={0} width={SZ} height={SZ} rx={R}
        fill={on ? GREEN : 'rgba(0,0,0,0.04)'}
        opacity={on ? 0.85 : 1} />
      <rect x={0.5} y={0.5} width={SZ - 1} height={SZ - 1} rx={R}
        fill="none"
        stroke={on ? GREEN : 'rgba(0,0,0,0.08)'}
        strokeWidth={0.8}
        opacity={on ? 0.6 : 1} />
      <text x={SZ / 2} y={SZ / 2 + 1} textAnchor="middle" dominantBaseline="middle"
        fill={on ? '#fff' : '#999'} fontSize={10} fontWeight={600}>{day}</text>
    </svg>
  );
}

// Compute the new excluded/extra arrays after a click on `day`.
// Returns { excludedDays, extraDays } you can drop into PATCH /activities/:id.
//
//   Currently ON  →  user wants OFF
//                    if it's interval-on → add to excluded
//                    if it's extra-on    → remove from extra
//   Currently OFF →  user wants ON
//                    if it's interval-off (in window or not) but excluded → unexclude
//                    else → add to extra
export function toggleDayInActivity(activity, day) {
  const fd = Math.max(1, parseInt(activity.firstDay ?? activity.first_day ?? 1) || 1);
  const ld = parseInt(activity.lastDay ?? activity.last_day ?? 30) || 30;
  const iv = Math.max(1, parseInt(activity.intervalDays ?? activity.interval_days ?? 1) || 1);
  const excluded = new Set(activity.excludedDays ?? activity.excluded_days ?? []);
  const extra    = new Set(activity.extraDays    ?? activity.extra_days    ?? []);

  const inIntervalWindow = day >= fd && day <= ld && ((day - fd) % iv) === 0;
  const isOn = (excluded.has(day))
    ? false
    : (extra.has(day) || inIntervalWindow);

  if (isOn) {
    // turn OFF
    if (extra.has(day)) extra.delete(day);
    else excluded.add(day);
  } else {
    // turn ON
    if (excluded.has(day)) excluded.delete(day);
    else extra.add(day);
  }
  return {
    excludedDays: Array.from(excluded).sort((a, b) => a - b),
    extraDays: Array.from(extra).sort((a, b) => a - b),
  };
}
