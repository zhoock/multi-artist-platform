import type { IAlbums } from '@models';

export type RequestStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

/**
 * Один источник правды для списка альбомов.
 * Язык интерфейса — `state.lang.current`, не дублируем данные по en/ru.
 */
/** Синхронизация кэша с маршрутом: public slug / дашборд / каталог без artist. */
export interface AlbumsState {
  status: RequestStatus;
  error: string | null;
  data: IAlbums[];
  lastUpdated: number | null;
  /** Какой контекст запроса соответствует `data` (см. albumsLoader + fetchAlbums). */
  fetchContextKey: string | null;
  /**
   * Какой контекст у текущего in-flight публичного каталога (`data`),
   * чтобы фон не мигал, пока грузится только ветка кабинета.
   */
  inFlightFetchContextKey: 'dashboard' | 'public' | null;
  /** Публичный ?artist= не найден (удалён / неверный slug). */
  catalogArtistMissing: boolean;
  /**
   * Альбомы владельца для `/dashboard*`: не пересекаются с публичным каталогом в `data`
   * (модальный кабинет поверх страницы артиста).
   */
  dashboard: {
    status: RequestStatus;
    error: string | null;
    data: IAlbums[];
    lastUpdated: number | null;
    inFlightFetchContextKey: 'dashboard' | null;
  };
}

export type FetchAlbumsArg = {
  force?: boolean;
  /** Явная загрузка альбомов владельца в dashboard bucket (модальный кабинет). */
  ownerDashboard?: boolean;
  /** Явный slug из URL / фона модалки; иначе берётся из `currentArtist` в store. */
  publicArtistSlug?: string | null;
  /** Писать в публичный каталог независимо от pathname (sync после дашборда). */
  forcePublicCatalog?: boolean;
};

export interface FetchAlbumsFulfilledPayload {
  albums: IAlbums[];
  fetchContextKey: string;
  /** Ответ устарел: маршрут/контекст сменился до завершения запроса — не перезаписывать store. */
  staleAbort?: boolean;
  /** Куда писать результат: публичный каталог или кабинет. */
  writeTarget?: 'catalog' | 'dashboard';
  catalogArtistMissing?: boolean;
}
