// src/entities/savedMix/lib/generateMixName.ts

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

/**
 * Автоимя микса в формате `{Track Title} • DD.MM.YYYY HH:mm` (локальное время).
 * Используется, когда пользователь не ввёл название.
 */
export function generateMixName(trackTitle: string, date: Date = new Date()): string {
  const stamp =
    `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()} ` +
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  const title = trackTitle.trim() || 'Mix';
  return `${title} • ${stamp}`;
}
