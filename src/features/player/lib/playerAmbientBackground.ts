import {
  albumCoverPlayerBackgroundKey,
  playerAmbientGradientFromBackground,
  type AlbumCoverPlayerBackground,
} from '@shared/lib/imageColor/albumCoverPlayerBackground';
import type { PlayerAlbumMeta } from '@features/player/model/types/playerSchema';

export function resolvePlayerAmbientBackgroundGradient(
  meta: Pick<PlayerAlbumMeta, 'playerBackground'> | null | undefined
): string | null {
  return playerAmbientGradientFromBackground(meta?.playerBackground);
}

export function playerAmbientBackgroundDependencyKey(
  bg: AlbumCoverPlayerBackground | null | undefined
): string {
  return albumCoverPlayerBackgroundKey(bg);
}
