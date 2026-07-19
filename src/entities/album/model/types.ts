import type { AlbumEditable } from '@models';

export type RequestStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

/**
 * Owner Dashboard fat-albums state (`AlbumEditable`).
 * Public catalog lives in `artistAlbumCatalog` (CatalogAlbum) / `albumDetails`.
 */
export interface AlbumsState {
  dashboard: {
    status: RequestStatus;
    error: string | null;
    data: AlbumEditable[];
    lastUpdated: number | null;
    inFlightFetchContextKey: 'dashboard' | null;
  };
}

export type FetchDashboardAlbumsArg = {
  force?: boolean;
  /** Explicit owner dashboard fetch (modal cabinet / Home owner overlay). */
  ownerDashboard?: boolean;
};

export interface FetchDashboardAlbumsFulfilledPayload {
  albums: AlbumEditable[];
  /** Ответ устарел: маршрут/контекст сменился до завершения запроса — не перезаписывать store. */
  staleAbort?: boolean;
}
