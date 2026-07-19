/**
 * AlbumDetails → MixerTrack[] via existing loadStems (no AlbumEditable / fat catalog).
 */

import { getUserAudioUrl } from '@shared/api/albums';
import { optionalMediaSrc } from '@shared/lib/media/optionalMediaUrl';
import { normalizeStemsVisibility } from '@shared/lib/stems/stemsVisibility';
import { loadStems, getStemAudioUrl } from '@entities/stem';
import type { AlbumDetails } from '@entities/album/model/albumDetails';
import type { MixerTrack, PlayableStem } from './types';

export async function buildMixerTracksFromAlbumDetails(
  details: AlbumDetails,
  storageUserId: string
): Promise<MixerTrack[]> {
  const albumId = details.albumId;
  const mixerTracks: MixerTrack[] = [];

  for (const track of details.tracks) {
    const trackId = String(track.id);
    const stemsVis = normalizeStemsVisibility(track.stemsAvailability);

    if (stemsVis === 'hidden') continue;

    const {
      stems: stemMetas,
      accessToken,
      accessTokenExpiresAt,
      accessDenied,
    } = await loadStems(storageUserId, albumId, trackId);

    const trackTitle = track.title || `Track ${trackId}`;
    const trackDuration = typeof track.duration === 'number' ? track.duration : 0;

    if (accessDenied) {
      if (stemsVis === 'subscribers_only') {
        mixerTracks.push({
          id: trackId,
          title: trackTitle,
          duration: trackDuration,
          locked: true,
          stems: [],
        });
      }
      continue;
    }

    if (!stemMetas || stemMetas.length === 0) continue;

    const stems: PlayableStem[] = [];
    for (const meta of stemMetas) {
      const url = getStemAudioUrl(
        storageUserId,
        albumId,
        trackId,
        meta,
        accessToken,
        accessTokenExpiresAt
      );
      if (url) {
        stems.push({ id: meta.id, name: meta.name, category: meta.category, url });
      }
    }
    if (stems.length === 0) continue;

    const mixUrl = track.src
      ? optionalMediaSrc(getUserAudioUrl(track.src, true, storageUserId), 'useMixerCatalog:mix', {
          albumId,
          trackId,
        })
      : undefined;

    mixerTracks.push({
      id: trackId,
      title: trackTitle,
      duration: trackDuration,
      mixUrl: mixUrl ?? undefined,
      stems,
    });
  }

  return mixerTracks;
}
