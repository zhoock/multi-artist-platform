/**
 * Qualified listen registration and audience metrics (artist dashboard).
 */

import { normalizeAccountType } from './account-type';
import { artistHasPublicPageContent } from './artist-publication';
import { query } from './db';
import { viewerHasPremiumAccessToArtist } from './entitlements';
import { hasPremiumAccess } from './subscription-access';
import { getViewerSubscription } from './subscriptions';

export type AudiencePeriod = '7d' | '30d' | '90d';

const PERIOD_DAYS: Record<AudiencePeriod, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

export function parseAudiencePeriod(raw: string | null | undefined): AudiencePeriod | null {
  const v = raw?.trim();
  if (v === '7d' || v === '30d' || v === '90d') return v;
  return null;
}

export function getQualifiedListenThresholdSeconds(trackDurationSeconds: number): number {
  if (!Number.isFinite(trackDurationSeconds) || trackDurationSeconds <= 0) {
    return 30;
  }
  if (trackDurationSeconds < 30) {
    return trackDurationSeconds * 0.5;
  }
  return 30;
}

export function isQualifiedListenDuration(
  durationListenedSeconds: number,
  trackDurationSeconds: number
): boolean {
  if (!Number.isFinite(durationListenedSeconds) || durationListenedSeconds <= 0) {
    return false;
  }
  return durationListenedSeconds >= getQualifiedListenThresholdSeconds(trackDurationSeconds);
}

/** Sanity cap above threshold for unknown-duration tracks. */
export const QUALIFIED_PLAY_REPORTED_DURATION_SANITY_CAP_SECONDS = 7200;

/** Allow client/server clock skew vs track duration metadata. */
export const QUALIFIED_PLAY_TRACK_DURATION_TOLERANCE_SECONDS = 5;

/**
 * Normalize client-reported listen duration before persist.
 * Returns null when below qualified threshold or invalid.
 */
export function normalizeReportedListenDuration(
  clientReportedSeconds: number,
  trackDurationSeconds: number | null
): number | null {
  if (!Number.isFinite(clientReportedSeconds) || clientReportedSeconds <= 0) {
    return null;
  }

  const trackDuration = trackDurationSeconds ?? 0;
  if (!isQualifiedListenDuration(clientReportedSeconds, trackDuration)) {
    return null;
  }

  const threshold = getQualifiedListenThresholdSeconds(trackDuration);
  let maxAllowed = QUALIFIED_PLAY_REPORTED_DURATION_SANITY_CAP_SECONDS;
  if (Number.isFinite(trackDuration) && trackDuration > 0) {
    maxAllowed = Math.min(
      maxAllowed,
      trackDuration + QUALIFIED_PLAY_TRACK_DURATION_TOLERANCE_SECONDS
    );
  }

  const normalized = Math.min(Math.floor(clientReportedSeconds), Math.floor(maxAllowed));
  if (normalized < threshold) {
    return null;
  }

  return normalized;
}

export function listenerIdentityKey(
  listenerUserId: string | null | undefined,
  listenerAnonId: string | null | undefined
): string | null {
  if (listenerUserId?.trim()) {
    return `u:${listenerUserId.trim()}`;
  }
  if (listenerAnonId?.trim()) {
    return `a:${listenerAnonId.trim()}`;
  }
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): boolean {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

export interface ResolvedTrackForPlay {
  trackUuid: string;
  artistUserId: string;
  durationSeconds: number | null;
}

export async function resolveTrackForQualifiedPlay(
  albumSlug: string,
  logicalTrackId: string
): Promise<ResolvedTrackForPlay | null> {
  const albumId = albumSlug.trim();
  const trackId = logicalTrackId.trim();
  if (!albumId || !trackId) return null;

  const r = await query<{
    track_uuid: string;
    artist_user_id: string;
    duration: string | number | null;
  }>(
    `SELECT
       t.id::text AS track_uuid,
       a.user_id::text AS artist_user_id,
       t.duration AS duration
     FROM tracks t
     INNER JOIN albums a ON a.id = t.album_id
     WHERE a.album_id = $1 AND t.track_id = $2 AND a.user_id IS NOT NULL
     ORDER BY a.updated_at DESC NULLS LAST, a.created_at DESC
     LIMIT 1`,
    [albumId, trackId]
  );

  const row = r.rows[0];
  if (!row?.track_uuid || !row.artist_user_id) return null;

  const durationRaw = row.duration;
  const durationSeconds =
    durationRaw === null || durationRaw === undefined
      ? null
      : Number(typeof durationRaw === 'string' ? durationRaw : durationRaw);

  return {
    trackUuid: row.track_uuid,
    artistUserId: row.artist_user_id,
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
  };
}

export type RegisterQualifiedPlayInput = {
  albumSlug: string;
  logicalTrackId: string;
  playbackSessionId: string;
  durationListenedSeconds: number;
  listenerUserId: string | null;
  listenerAnonId: string | null;
};

export type RegisterQualifiedPlayResult =
  | { ok: true; inserted: boolean }
  | {
      ok: false;
      code: 'INVALID_INPUT' | 'TRACK_NOT_FOUND' | 'NOT_QUALIFIED' | 'OWNER_PLAY' | 'RATE_LIMITED';
    };

export async function registerQualifiedPlay(
  input: RegisterQualifiedPlayInput
): Promise<RegisterQualifiedPlayResult> {
  const playbackSessionId = input.playbackSessionId.trim();
  if (!isUuid(playbackSessionId)) {
    return { ok: false, code: 'INVALID_INPUT' };
  }

  const listenerUserId = input.listenerUserId?.trim() || null;
  const listenerAnonId = input.listenerAnonId?.trim() || null;
  if (!listenerUserId && !listenerAnonId) {
    return { ok: false, code: 'INVALID_INPUT' };
  }
  if (listenerUserId && listenerAnonId) {
    return { ok: false, code: 'INVALID_INPUT' };
  }
  if (listenerAnonId && !isUuid(listenerAnonId)) {
    return { ok: false, code: 'INVALID_INPUT' };
  }

  const resolved = await resolveTrackForQualifiedPlay(input.albumSlug, input.logicalTrackId);
  if (!resolved) {
    return { ok: false, code: 'TRACK_NOT_FOUND' };
  }

  if (listenerUserId && listenerUserId === resolved.artistUserId) {
    return { ok: false, code: 'OWNER_PLAY' };
  }

  const normalizedDuration = normalizeReportedListenDuration(
    input.durationListenedSeconds,
    resolved.durationSeconds
  );
  if (normalizedDuration === null) {
    return { ok: false, code: 'NOT_QUALIFIED' };
  }

  const insert = await query<{ id: string }>(
    `INSERT INTO qualified_track_plays (
       artist_user_id,
       track_id,
       listener_user_id,
       listener_anon_id,
       playback_session_id,
       duration_listened_seconds
     )
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6)
     ON CONFLICT (playback_session_id, track_id) DO NOTHING
     RETURNING id::text AS id`,
    [
      resolved.artistUserId,
      resolved.trackUuid,
      listenerUserId,
      listenerAnonId,
      playbackSessionId,
      normalizedDuration,
    ]
  );

  return { ok: true, inserted: insert.rows.length > 0 };
}

function periodStart(period: AudiencePeriod, now = new Date()): Date {
  const days = PERIOD_DAYS[period];
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

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
  /** Set when supporter is an artist with visitor-facing public page content. */
  publicArtistSlug: string | null;
}

export interface ArtistAudienceStats {
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

export async function countActiveCollectionForArtist(artistUserId: string): Promise<number> {
  const r = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM user_archive
     WHERE artist_user_id = $1::uuid AND is_active = true`,
    [artistUserId]
  );
  return Number(r.rows[0]?.count ?? 0);
}

export async function getArtistAudienceStats(
  artistUserId: string,
  period: AudiencePeriod,
  options?: { tracksLimit?: number; supportersLimit?: number },
  now = new Date()
): Promise<ArtistAudienceStats> {
  const start = periodStart(period, now);
  const tracksLimit = Math.min(Math.max(options?.tracksLimit ?? 5, 1), 200);
  const supportersLimit = Math.min(Math.max(options?.supportersLimit ?? 5, 1), 200);

  const [
    listenersRow,
    playsRow,
    regularRow,
    collectionCount,
    timelineRows,
    topTrackRows,
    archiveRows,
  ] = await Promise.all([
    query<{ count: string }>(
      `SELECT COUNT(DISTINCT COALESCE(listener_user_id::text, 'anon:' || listener_anon_id::text))::text AS count
         FROM qualified_track_plays
         WHERE artist_user_id = $1::uuid AND played_at >= $2`,
      [artistUserId, start]
    ),
    query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM qualified_track_plays
         WHERE artist_user_id = $1::uuid AND played_at >= $2`,
      [artistUserId, start]
    ),
    query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM (
           SELECT COALESCE(listener_user_id::text, 'anon:' || listener_anon_id::text) AS listener_key
           FROM qualified_track_plays
           WHERE artist_user_id = $1::uuid
             AND played_at >= NOW() - INTERVAL '30 days'
           GROUP BY listener_key
           HAVING COUNT(DISTINCT (played_at AT TIME ZONE 'UTC')::date) >= 3
         ) regulars`,
      [artistUserId]
    ),
    countActiveCollectionForArtist(artistUserId),
    query<{ day: Date; listeners: string }>(
      `SELECT (played_at AT TIME ZONE 'UTC')::date AS day,
                COUNT(DISTINCT COALESCE(listener_user_id::text, 'anon:' || listener_anon_id::text))::text AS listeners
         FROM qualified_track_plays
         WHERE artist_user_id = $1::uuid AND played_at >= $2
         GROUP BY day
         ORDER BY day ASC`,
      [artistUserId, start]
    ),
    query<{ track_uuid: string; title: string; plays: string }>(
      `SELECT t.id::text AS track_uuid,
                t.title,
                COUNT(*)::text AS plays
         FROM qualified_track_plays q
         INNER JOIN tracks t ON t.id = q.track_id
         WHERE q.artist_user_id = $1::uuid AND q.played_at >= $2
         GROUP BY t.id, t.title
         ORDER BY COUNT(*) DESC, t.title ASC
         LIMIT $3`,
      [artistUserId, start, tracksLimit]
    ),
    query<{
      user_id: string;
      created_at: Date;
      name: string | null;
      site_name: string | null;
      public_slug: string | null;
      account_type: string | null;
      profile_avatar_path: string | null;
    }>(
      `SELECT ua.user_id::text AS user_id,
                ua.created_at,
                u.name,
                u.site_name,
                u.public_slug,
                u.account_type,
                u.profile_avatar_path
         FROM user_archive ua
         INNER JOIN users u ON u.id = ua.user_id
         WHERE ua.artist_user_id = $1::uuid AND ua.is_active = true
         ORDER BY ua.created_at DESC`,
      [artistUserId]
    ),
  ]);

  const supporterRows: typeof archiveRows.rows = [];
  for (const row of archiveRows.rows) {
    const hasPremium = await viewerHasPremiumAccessToArtist(row.user_id, artistUserId);
    if (!hasPremium) continue;
    supporterRows.push(row);
  }

  const supportersFiltered: AudienceSupporter[] = await Promise.all(
    supporterRows.map(async (row) => {
      const displayName =
        row.site_name?.trim() || row.name?.trim() || row.public_slug?.trim() || 'Listener';

      const slug = row.public_slug?.trim() || null;
      let publicArtistSlug: string | null = null;
      if (slug && normalizeAccountType(row.account_type) === 'artist') {
        if (await artistHasPublicPageContent(row.user_id)) {
          publicArtistSlug = slug;
        }
      }

      return {
        userId: row.user_id,
        displayName,
        avatarUrl: row.profile_avatar_path?.trim() || null,
        supportStatus: 'premium' as const,
        addedToCollectionAt: row.created_at?.toISOString?.() ?? null,
        publicArtistSlug,
      };
    })
  );

  const topTracks: AudienceTopTrack[] = topTrackRows.rows.map((row, index) => ({
    rank: index + 1,
    trackId: row.track_uuid,
    title: row.title,
    plays: Number(row.plays ?? 0),
  }));

  const listenersTimeline: AudienceTimelinePoint[] = timelineRows.rows.map((row) => ({
    date: row.day.toISOString().slice(0, 10),
    listeners: Number(row.listeners ?? 0),
  }));

  return {
    period,
    listeners: Number(listenersRow.rows[0]?.count ?? 0),
    plays: Number(playsRow.rows[0]?.count ?? 0),
    regularListeners: Number(regularRow.rows[0]?.count ?? 0),
    collectionCount,
    listenersTimeline,
    topTracks,
    supporters: supportersFiltered.slice(0, supportersLimit),
    supportersTotal: supportersFiltered.length,
  };
}

/** Used in tests: premium + archive without entitlements mock. */
export async function userIsActiveSupporterOfArtist(
  userId: string,
  artistUserId: string,
  now = new Date()
): Promise<boolean> {
  const sub = await getViewerSubscription(userId);
  if (!hasPremiumAccess(sub, now)) return false;
  return viewerHasPremiumAccessToArtist(userId, artistUserId);
}
