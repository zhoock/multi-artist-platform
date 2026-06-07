// src/pages/StemsPlayground/lib/types.ts
import type { StemCategory } from '@entities/stem';

/** Текущий уровень навигации публичного микшера. */
export type MixerView = 'albums' | 'tracks' | 'mixer';

/** Стем, готовый к воспроизведению (динамический набор, без фиксированных ключей). */
export type PlayableStem = {
  id: string;
  name: string;
  category: StemCategory;
  url: string;
};

/** Трек альбома, у которого есть хотя бы один воспроизводимый стем. */
export type MixerTrack = {
  id: string;
  title: string;
  /** Длительность в секундах (0, если неизвестна). */
  duration: number;
  /** URL полного микса для волны (фолбэк — первый стем). */
  mixUrl?: string;
  stems: PlayableStem[];
};

/** Альбом, у которого есть треки со стемами. */
export type MixerAlbum = {
  albumId: string;
  title: string;
  /** Год релиза в виде строки (пустая строка, если неизвестен). */
  year: string;
  cover?: string;
  /** Владелец альбома в storage (users/{id}/...). */
  userId?: string;
  tracks: MixerTrack[];
};
