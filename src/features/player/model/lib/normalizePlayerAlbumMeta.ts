import type {
  PlayerAlbumMeta,
  PlayerTrackQueueAlbumMeta,
} from '@features/player/model/types/playerSchema';
import { coverImgFromStorageField, parseAlbumCoverField } from '@shared/lib/albumCoverStorage';

export function resolvePlayerCoverImg(raw: unknown): string | null {
  const img = coverImgFromStorageField(raw);
  return img || null;
}

/** Ensures `albumMeta.cover` is a storage base key, not JSONB / stringified cover. */
export function normalizePlayerAlbumMeta(meta: PlayerAlbumMeta): PlayerAlbumMeta {
  const parsed = parseAlbumCoverField(meta.cover);
  return {
    ...meta,
    cover: parsed.img || null,
    playerBackground: meta.playerBackground ?? parsed.playerBackground,
  };
}

export function normalizeQueueAlbumMeta(
  meta: PlayerTrackQueueAlbumMeta
): PlayerTrackQueueAlbumMeta {
  const parsed = parseAlbumCoverField(meta.cover);
  return {
    ...meta,
    cover: parsed.img || null,
    playerBackground: meta.playerBackground ?? parsed.playerBackground,
  };
}
