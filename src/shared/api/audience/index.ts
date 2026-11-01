import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { getAuthHeader } from '@shared/lib/auth';
import type { AudiencePeriod } from './types';

export type { AudiencePeriod } from './types';

export interface AudienceTimelinePoint {
  date: string;
  listeners: number;
}

export interface AudienceTopTrack {
  rank: number;
  trackId: string;
  title: string;
  plays: number;
}

export interface AudienceSupporter {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  supportStatus: 'premium';
  addedToCollectionAt: string | null;
}

export interface ArtistAudienceResponse {
  period: AudiencePeriod;
  listeners: number;
  plays: number;
  regularListeners: number;
  collectionCount: number;
  listenersTimeline: AudienceTimelinePoint[];
  topTracks: AudienceTopTrack[];
  supporters: AudienceSupporter[];
  supportersTotal: number;
}

export async function fetchArtistAudience(params: {
  period: AudiencePeriod;
  tracksLimit?: number;
  supportersLimit?: number;
}): Promise<ArtistAudienceResponse> {
  const search = new URLSearchParams({ period: params.period });
  if (params.tracksLimit != null) {
    search.set('tracksLimit', String(params.tracksLimit));
  }
  if (params.supportersLimit != null) {
    search.set('supportersLimit', String(params.supportersLimit));
  }

  const response = await fetchWithAuthSession(`/api/artist-audience?${search.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
    },
  });
  if (!response.ok) {
    throw new Error(`artist-audience:${response.status}`);
  }

  const payload = (await response.json()) as { data?: ArtistAudienceResponse };
  if (!payload?.data) {
    throw new Error('artist-audience:empty');
  }
  return payload.data;
}
