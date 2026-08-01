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

/** Трек альбома, у которого есть стемы (воспроизводимые или только для подписчиков). */
export type MixerTrack = {
  id: string;
  title: string;
  /** Длительность в секундах (0, если неизвестна). */
  duration: number;
  /** URL полного микса для волны (фолбэк — первый стем). */
  mixUrl?: string;
  /** Server waveform peaks JSON (C2 plumbing; Waveform uses in C3). */
  waveformUrl?: string;
  /** Стемы недоступны без подписки — показываем в списке, но не открываем микшер. */
  locked?: boolean;
  stems: PlayableStem[];
};

/** Статус загрузки AlbumDetails + stems для выбранного альбома. */
export type MixerAlbumTracksStatus = 'idle' | 'loading' | 'loaded' | 'failed';

/** Альбом микшера: список из CatalogAlbum, треки — после AlbumDetails + loadStems. */
export type MixerAlbum = {
  albumId: string;
  title: string;
  /** Год релиза в виде строки (пустая строка, если неизвестен). */
  year: string;
  cover?: string;
  /** Владелец альбома в storage (users/{id}/...). */
  userId?: string;
  /** CatalogAlbum.trackCount — для карточки списка до загрузки стемов. */
  listedTrackCount: number;
  tracks: MixerTrack[];
  tracksStatus: MixerAlbumTracksStatus;
};
