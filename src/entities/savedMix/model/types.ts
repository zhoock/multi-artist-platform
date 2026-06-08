// src/entities/savedMix/model/types.ts

/** Настройки одного стема в сохранённом миксе (без аудио). */
export type SavedMixSetting = {
  stemId: string;
  /** Громкость 0..1. */
  volume: number;
  muted: boolean;
  solo: boolean;
};

/** Сохранённый микс (пресет микшера) пользователя. */
export type SavedMix = {
  id: string;
  albumId: string;
  trackId: string;
  name: string;
  createdAt: string;
  /** Заголовок трека на момент сохранения (для списка/индикатора). */
  trackTitle?: string;
  /** Заголовок альбома на момент сохранения. */
  albumTitle?: string;
  settings: SavedMixSetting[];
};

/** Данные shared-микса, открытого по ссылке /stems/mix/:id. */
export type SharedMix = {
  id: string;
  artistSlug: string;
  albumId: string;
  trackId: string;
  name: string;
  authorName: string | null;
  settings: SavedMixSetting[];
};

/** Состояние стема в UI микшера (внутреннее представление панели). */
export type PanelStemState = {
  volume: number;
  muted: boolean;
  soloed: boolean;
};
