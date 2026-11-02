import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { getAuthHeader } from '@shared/lib/auth';
import type { AudiencePeriod } from './types';

export type { AudiencePeriod } from './types';

export const AUDIENCE_TRACKS_PAGE_MAX = 500;
export const AUDIENCE_SUPPORTERS_PAGE_MAX = 500;

export interface AudienceTimelinePoint {
  date: string;
  listeners: number;
}

export interface AudienceTopTrack {
  rank: number;
  trackId: string;
  title: string;
  plays: number;
  albumCover: string | null;
  albumUserId: string | null;
}

export interface AudienceSupporter {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  supportStatus: 'premium';
  addedToCollectionAt: string | null;
  publicArtistSlug: string | null;
}

export interface AudienceRevenue {
  currency: 'RUB';
  albumSales: number;
  subscriberSupport: number;
  total: number;
}

export interface ArtistAudienceResponse {
  period: AudiencePeriod;
  listeners: number;
  plays: number;
  regularListeners: number;
  collectionCount: number;
  listenersTimeline: AudienceTimelinePoint[];
  topTracks: AudienceTopTrack[];
  topTracksTotal: number;
  supporters: AudienceSupporter[];
  supportersTotal: number;
  revenue: AudienceRevenue;
}

export async function fetchArtistAudience(params: {
  period: AudiencePeriod;
  tracksLimit?: number;
  tracksOffset?: number;
  supportersLimit?: number;
  supportersOffset?: number;
}): Promise<ArtistAudienceResponse> {
  const search = new URLSearchParams({ period: params.period });
  if (params.tracksLimit != null) {
    search.set('tracksLimit', String(params.tracksLimit));
  }
  if (params.tracksOffset != null && params.tracksOffset > 0) {
    search.set('tracksOffset', String(params.tracksOffset));
  }
  if (params.supportersLimit != null) {
    search.set('supportersLimit', String(params.supportersLimit));
  }
  if (params.supportersOffset != null && params.supportersOffset > 0) {
    search.set('supportersOffset', String(params.supportersOffset));
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

export async function fetchAllAudienceTopTracks(
  period: AudiencePeriod
): Promise<AudienceTopTrack[]> {
  const all: AudienceTopTrack[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    const page = await fetchArtistAudience({
      period,
      tracksLimit: AUDIENCE_TRACKS_PAGE_MAX,
      tracksOffset: offset,
      supportersLimit: 2,
    });
    if (offset === 0) {
      total = page.topTracksTotal;
    }
    if (page.topTracks.length === 0) {
      break;
    }
    all.push(...page.topTracks);
    offset += page.topTracks.length;
    if (all.length >= total) {
      break;
    }
  }

  return all;
}

export async function fetchAllAudienceSupporters(
  period: AudiencePeriod
): Promise<AudienceSupporter[]> {
  const all: AudienceSupporter[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    const page = await fetchArtistAudience({
      period,
      tracksLimit: 3,
      supportersLimit: AUDIENCE_SUPPORTERS_PAGE_MAX,
      supportersOffset: offset,
    });
    if (offset === 0) {
      total = page.supportersTotal;
    }
    if (page.supporters.length === 0) {
      break;
    }
    all.push(...page.supporters);
    offset += page.supporters.length;
    if (all.length >= total) {
      break;
    }
  }

  return all;
}
