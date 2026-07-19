/**
 * Типы и начальное состояние для Redux стейта плеера.
 */

// Состояние времени трека: текущая позиция и общая длительность
export interface PlayerTimeState {
  current: number; // текущее время в секундах
  duration: number; // общая длительность трека в секундах (NaN если трек не загружен)
}

export interface PlayerAlbumMeta {
  albumId: string | null;
  userId?: string | null;
  publicSlug?: string | null;
  album: string | null;
  artist: string | null;
  fullName: string | null;
  cover: string | null;
}

/**
 * Thin playlist row — only fields needed for playback / queue UI.
 * No lyrics, stems, translations, or audio-* tech meta.
 */
export interface PlayerTrack {
  /** Track id (same as TracksProps.id). */
  id: string;
  albumId?: string;
  title: string;
  duration: number;
  src: string;
  playbackLocked?: boolean;
  visibility?: 'public' | 'subscribers_only' | 'hidden';
}

export interface PlayerSourceLocation {
  pathname: string;
  search?: string;
}

/**
 * Интерфейс состояния плеера в Redux.
 * Здесь хранится всё, что связано с воспроизведением аудио.
 */
export interface PlayerState {
  isPlaying: boolean; // играет ли трек сейчас
  volume: number; // громкость от 0 до 100
  isSeeking: boolean; // перематывает ли пользователь трек вручную (нужно для блокировки автообновления прогресса)
  progress: number; // прогресс воспроизведения от 0 до 100 (%)
  time: PlayerTimeState; // текущее время и длительность
  currentTrackIndex: number; // индекс текущего трека в плейлисте
  playlist: PlayerTrack[]; // thin queue (may be shuffled)
  originalPlaylist: PlayerTrack[]; // original order for shuffle restore
  playRequestId: number; // счётчик для запросов на воспроизведение (инкрементируется при requestPlay)
  albumId: string | null; // уникальный ID текущего альбома (для аналитики)
  albumTitle: string | null; // название текущего альбома (для аналитики)
  albumMeta: PlayerAlbumMeta | null; // минимальные данные альбома для отображения UI
  sourceLocation: PlayerSourceLocation | null; // маршрут, где был открыт плеер
  shuffle: boolean; // перемешивание треков включено/выключено
  repeat: 'none' | 'all' | 'one'; // режим зацикливания: 'none' - без зацикливания, 'all' - зацикливание плейлиста, 'one' - зацикливание одного трека
  showLyrics: boolean; // отображается ли текст песни
  controlsVisible: boolean; // отображаются ли контролы
}

/**
 * Начальное состояние плеера.
 * Это дефолтные значения, когда приложение только запускается.
 */
export const initialPlayerState: PlayerState = {
  isPlaying: false,
  volume: 50, // средняя громкость по умолчанию
  isSeeking: false,
  progress: 0,
  time: { current: 0, duration: NaN }, // NaN значит "ещё не загружено"
  currentTrackIndex: 0,
  playlist: [],
  originalPlaylist: [], // оригинальный порядок треков (для восстановления при выключении shuffle)
  playRequestId: 0,
  albumId: null, // данные альбома для аналитики
  albumTitle: null,
  albumMeta: null,
  sourceLocation: null,
  shuffle: false, // перемешивание выключено по умолчанию
  repeat: 'none', // зацикливание выключено по умолчанию
  showLyrics: false,
  controlsVisible: true,
};
