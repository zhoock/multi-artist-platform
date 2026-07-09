import type { SyncedLyricsLine } from '../../../src/models';
import {
  isTimedSync,
  lyricsFingerprintFromContent,
  lyricsFingerprintFromSyncedLines,
  projectLyricsBundleFields,
} from '../../../src/shared/lib/lyrics';
import type { TrackLyricsBundle } from '../../../src/shared/lib/lyrics/types';

import { query } from './db';

export type { TrackLyricsBundle };

export type AlbumLangRow = { id: string; lang: string; user_id?: string | null };

export type CanonicalAlbumRow = { id: string; user_id: string | null; lang: string };

export async function findUserAlbumLangRows(
  userId: string,
  albumIdSlug: string
): Promise<AlbumLangRow[]> {
  const r = await query<AlbumLangRow>(
    `SELECT id, lang, user_id FROM albums
     WHERE album_id = $1 AND user_id = $2 AND lang IN ('ru', 'en')
     ORDER BY CASE lang WHEN 'ru' THEN 0 WHEN 'en' THEN 1 END`,
    [albumIdSlug, userId],
    0
  );
  return r.rows;
}

export async function findCanonicalAlbumForUser(
  albumId: string,
  userId: string
): Promise<CanonicalAlbumRow | null> {
  const r = await query<CanonicalAlbumRow>(
    `SELECT id, user_id, lang FROM albums
     WHERE album_id = $1 AND user_id = $2 AND lang IN ('ru', 'en')
     ORDER BY CASE lang WHEN 'ru' THEN 0 WHEN 'en' THEN 1 END
     LIMIT 1`,
    [albumId, userId],
    0
  );
  return r.rows[0] ?? null;
}

export function pickCanonicalAlbum(rows: AlbumLangRow[]): AlbumLangRow | null {
  if (!rows.length) return null;
  const ru = rows.find((x) => x.lang === 'ru');
  return ru ?? rows[0] ?? null;
}

export function pickLocaleAlbum(rows: AlbumLangRow[], loc: 'en' | 'ru'): AlbumLangRow | null {
  return rows.find((x) => x.lang === loc) ?? pickCanonicalAlbum(rows);
}

export function canonicalStorageLang(albumLang: string): 'ru' | 'en' {
  return albumLang === 'ru' ? 'ru' : 'en';
}

export function parseSyncedLyricsJson(raw: unknown): SyncedLyricsLine[] {
  if (!raw) return [];
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (line): line is SyncedLyricsLine =>
      typeof line === 'object' &&
      line !== null &&
      typeof (line as SyncedLyricsLine).text === 'string' &&
      typeof (line as SyncedLyricsLine).startTime === 'number'
  );
}

export interface ComposeTrackLyricsInput {
  albumId: string;
  trackId: string;
  canonicalLang: string;
  content: string | null | undefined;
  authorship?: string | null;
  syncedRow?: { synced_lyrics: unknown; updated_at?: Date | string | null } | null;
}

/** Pure builder from already-loaded rows — no legacy fallbacks. */
export function composeTrackLyricsBundle(input: ComposeTrackLyricsInput): TrackLyricsBundle {
  const content = typeof input.content === 'string' ? input.content : '';
  const authorship =
    typeof input.authorship === 'string' && input.authorship.trim()
      ? input.authorship.trim()
      : undefined;

  const rawLines = input.syncedRow ? parseSyncedLyricsJson(input.syncedRow.synced_lyrics) : null;
  const timedLines = rawLines && isTimedSync(rawLines) ? rawLines : null;
  const { state, syncedLines } = projectLyricsBundleFields({
    content,
    syncedLines: timedLines,
  });

  let syncedAt: string | null = null;
  if (input.syncedRow?.updated_at) {
    const d =
      input.syncedRow.updated_at instanceof Date
        ? input.syncedRow.updated_at
        : new Date(input.syncedRow.updated_at);
    if (!Number.isNaN(d.getTime())) {
      syncedAt = d.toISOString();
    }
  }

  return {
    albumId: input.albumId,
    trackId: String(input.trackId),
    lang: input.canonicalLang,
    content,
    authorship,
    syncedLines,
    state,
    syncedAt,
  };
}

export interface BuildTrackLyricsContext {
  albumId: string;
  trackId: string;
  userId: string;
  /** UI locale for authorship on split album rows; defaults to canonical. */
  uiLang?: 'en' | 'ru';
}

export async function buildTrackLyricsBundle(
  ctx: BuildTrackLyricsContext
): Promise<TrackLyricsBundle | null> {
  const canonAlbum = await findCanonicalAlbumForUser(ctx.albumId, ctx.userId);
  if (!canonAlbum) return null;

  const canonicalLang = canonicalStorageLang(canonAlbum.lang);
  const albumRows = await findUserAlbumLangRows(ctx.userId, ctx.albumId);
  const localeAlbum = ctx.uiLang
    ? pickLocaleAlbum(albumRows, ctx.uiLang)
    : pickCanonicalAlbum(albumRows);
  const localeDbId = localeAlbum?.id ?? canonAlbum.id;
  const sameRow = localeDbId === canonAlbum.id;

  const trackResult = await query<{ content: string | null; authorship: string | null }>(
    `SELECT content, authorship FROM tracks
     WHERE album_id = $1 AND track_id = $2
     LIMIT 1`,
    [canonAlbum.id, String(ctx.trackId)],
    0
  );

  let authorship = trackResult.rows[0]?.authorship ?? null;
  if (!sameRow && ctx.uiLang) {
    const localeTrack = await query<{ authorship: string | null }>(
      `SELECT authorship FROM tracks WHERE album_id = $1 AND track_id = $2 LIMIT 1`,
      [localeDbId, String(ctx.trackId)],
      0
    );
    authorship = localeTrack.rows[0]?.authorship ?? authorship;
  }

  const syncResult = await query<{ synced_lyrics: unknown; updated_at: Date | null }>(
    `SELECT synced_lyrics, updated_at FROM synced_lyrics
     WHERE user_id = $1 AND album_id = $2 AND track_id = $3 AND lang = $4
     ORDER BY updated_at DESC NULLS LAST
     LIMIT 1`,
    [canonAlbum.user_id, ctx.albumId, String(ctx.trackId), canonicalLang],
    0
  );

  return composeTrackLyricsBundle({
    albumId: ctx.albumId,
    trackId: ctx.trackId,
    canonicalLang,
    content: trackResult.rows[0]?.content,
    authorship,
    syncedRow: syncResult.rows[0] ?? null,
  });
}

export async function loadSyncedRowsForAlbumTracks(
  userId: string,
  albumIdSlug: string,
  trackIds: string[],
  canonicalLang: string
): Promise<Map<string, { synced_lyrics: unknown; updated_at: Date | null }>> {
  const map = new Map<string, { synced_lyrics: unknown; updated_at: Date | null }>();
  if (!trackIds.length || !userId) return map;

  const result = await query<{
    track_id: string;
    synced_lyrics: unknown;
    updated_at: Date | null;
  }>(
    `SELECT DISTINCT ON (track_id)
       track_id, synced_lyrics, updated_at
     FROM synced_lyrics
     WHERE user_id = $1 AND album_id = $2 AND track_id = ANY($3::text[]) AND lang = $4
     ORDER BY track_id, updated_at DESC NULLS LAST`,
    [userId, albumIdSlug, trackIds, canonicalLang],
    0
  );

  for (const row of result.rows) {
    map.set(row.track_id, { synced_lyrics: row.synced_lyrics, updated_at: row.updated_at });
  }
  return map;
}

export interface SaveTrackLyricsContentInput {
  userId: string;
  albumId: string;
  trackId: string | number;
  uiLang: 'en' | 'ru';
  content: string;
  authorship?: string | null;
  trackTitle?: string;
}

export async function saveTrackLyricsContent(
  input: SaveTrackLyricsContentInput
): Promise<TrackLyricsBundle | null> {
  const { userId, albumId, trackId, uiLang, content } = input;
  const albumRows = await findUserAlbumLangRows(userId, albumId);
  const canonicalAlbum = pickCanonicalAlbum(albumRows);
  const localeAlbum = pickLocaleAlbum(albumRows, uiLang);
  if (!canonicalAlbum || !localeAlbum) return null;

  const canonicalDbId = canonicalAlbum.id;
  const localeDbId = localeAlbum.id;
  const canonicalLang = canonicalStorageLang(canonicalAlbum.lang);
  const sameAlbumRow = canonicalDbId === localeDbId;
  const authorshipVal = input.authorship ?? null;

  type TrackMetaRow = {
    title: string | null;
    duration: number | null;
    src: string | null;
    order_index: number | null;
    authorship: string | null;
  };

  const existingCanonResult = await query<TrackMetaRow>(
    `SELECT title, duration, src, order_index, authorship
     FROM tracks WHERE album_id = $1 AND track_id = $2 LIMIT 1`,
    [canonicalDbId, String(trackId)],
    0
  );
  const existingCanon = existingCanonResult.rows[0];

  let existingLocale: TrackMetaRow | undefined;
  if (!sameAlbumRow) {
    const localeRows = await query<TrackMetaRow>(
      `SELECT title, duration, src, order_index, authorship
       FROM tracks WHERE album_id = $1 AND track_id = $2 LIMIT 1`,
      [localeDbId, String(trackId)],
      0
    );
    existingLocale = localeRows.rows[0];
  }

  const requestTitleHint =
    typeof input.trackTitle === 'string' && input.trackTitle.trim().length > 0
      ? input.trackTitle.trim()
      : null;

  const nonNullTitle =
    existingCanon?.title?.trim() ||
    existingLocale?.title?.trim() ||
    requestTitleHint ||
    `Track ${String(trackId)}`;

  const mergedDuration = existingCanon?.duration ?? existingLocale?.duration ?? null;
  const mergedSrc = existingCanon?.src ?? existingLocale?.src ?? null;
  const mergedOrderIndex = existingCanon?.order_index ?? existingLocale?.order_index ?? 0;
  const upsertAuthorshipOnCanon = sameAlbumRow
    ? authorshipVal
    : (existingCanon?.authorship ?? null);

  await query(
    sameAlbumRow
      ? `INSERT INTO tracks (album_id, track_id, title, duration, src, content, authorship, order_index, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 0), NOW())
         ON CONFLICT (album_id, track_id)
         DO UPDATE SET content = EXCLUDED.content, authorship = EXCLUDED.authorship, updated_at = NOW()`
      : `INSERT INTO tracks (album_id, track_id, title, duration, src, content, authorship, order_index, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 0), NOW())
         ON CONFLICT (album_id, track_id)
         DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
    [
      canonicalDbId,
      String(trackId),
      nonNullTitle,
      mergedDuration,
      mergedSrc,
      content,
      upsertAuthorshipOnCanon,
      mergedOrderIndex,
    ],
    0
  );

  if (!sameAlbumRow) {
    const canonMeta = await query<{
      title: string | null;
      duration: number | null;
      src: string | null;
      content: string | null;
      order_index: number | null;
    }>(
      `SELECT title, duration, src, content, order_index FROM tracks WHERE album_id = $1 AND track_id = $2 LIMIT 1`,
      [canonicalDbId, String(trackId)],
      0
    );
    const cm = canonMeta.rows[0];
    const rowContent = cm?.content ?? content ?? '';
    const localeRowTitle =
      cm?.title?.trim() ||
      existingLocale?.title?.trim() ||
      requestTitleHint ||
      `Track ${String(trackId)}`;
    await query(
      `INSERT INTO tracks (album_id, track_id, title, duration, src, content, authorship, order_index, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 0), NOW())
       ON CONFLICT (album_id, track_id)
       DO UPDATE SET authorship = EXCLUDED.authorship, updated_at = NOW()`,
      [
        localeDbId,
        String(trackId),
        localeRowTitle,
        cm?.duration ?? existingLocale?.duration ?? null,
        cm?.src ?? existingLocale?.src ?? null,
        rowContent,
        authorshipVal,
        cm?.order_index ?? existingLocale?.order_index ?? 0,
      ],
      0
    );
  }

  const newFingerprint = lyricsFingerprintFromContent(content);
  let preserveExistingSyncedJson = false;

  const existingSync = await query<{ synced_lyrics: unknown }>(
    `SELECT synced_lyrics FROM synced_lyrics
     WHERE user_id = $1 AND album_id = $2 AND track_id = $3 AND lang = $4
     LIMIT 1`,
    [userId, albumId, String(trackId), canonicalLang],
    0
  );

  if (existingSync.rows.length > 0) {
    const parsed = parseSyncedLyricsJson(existingSync.rows[0].synced_lyrics);
    if (parsed.length > 0) {
      const oldFp = lyricsFingerprintFromSyncedLines(parsed);
      if (oldFp === newFingerprint && isTimedSync(parsed)) {
        preserveExistingSyncedJson = true;
      }
    }
  }

  if (preserveExistingSyncedJson) {
    await query(
      `UPDATE synced_lyrics SET authorship = $1, updated_at = NOW()
       WHERE user_id = $2 AND album_id = $3 AND track_id = $4 AND lang = $5`,
      [authorshipVal, userId, albumId, String(trackId), canonicalLang],
      0
    );
  } else {
    await query(
      `DELETE FROM synced_lyrics
       WHERE user_id = $1 AND album_id = $2 AND track_id = $3 AND lang = $4`,
      [userId, albumId, String(trackId), canonicalLang],
      0
    );
  }

  return buildTrackLyricsBundle({ albumId, trackId: String(trackId), userId, uiLang });
}

export interface SaveTrackLyricsSyncInput {
  userId: string;
  albumId: string;
  trackId: string | number;
  syncedLyrics: SyncedLyricsLine[];
  authorship?: string;
}

export async function saveTrackLyricsSync(
  input: SaveTrackLyricsSyncInput
): Promise<TrackLyricsBundle | null> {
  const canonAlbum = await findCanonicalAlbumForUser(input.albumId, input.userId);
  if (!canonAlbum?.user_id) return null;

  const storeLang = canonicalStorageLang(canonAlbum.lang);

  await query(
    `INSERT INTO synced_lyrics (user_id, album_id, track_id, lang, synced_lyrics, authorship, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())
     ON CONFLICT (user_id, album_id, track_id, lang)
     DO UPDATE SET synced_lyrics = EXCLUDED.synced_lyrics, authorship = EXCLUDED.authorship, updated_at = NOW()`,
    [
      input.userId,
      input.albumId,
      String(input.trackId),
      storeLang,
      JSON.stringify(input.syncedLyrics),
      input.authorship || null,
    ],
    0
  );

  return buildTrackLyricsBundle({
    albumId: input.albumId,
    trackId: String(input.trackId),
    userId: input.userId,
  });
}

export async function deleteTrackLyricsSync(
  userId: string,
  albumId: string,
  trackId: string | number
): Promise<TrackLyricsBundle | null> {
  const canonAlbum = await findCanonicalAlbumForUser(albumId, userId);
  if (!canonAlbum) return null;

  const storeLang = canonicalStorageLang(canonAlbum.lang);

  await query(
    `DELETE FROM synced_lyrics
     WHERE user_id = $1 AND album_id = $2 AND track_id = $3 AND lang = $4`,
    [userId, albumId, String(trackId), storeLang],
    0
  );

  return buildTrackLyricsBundle({ albumId, trackId: String(trackId), userId });
}

export interface TrackRowLyricsInput {
  track_id: string;
  content: string | null;
  authorship: string | null;
}

export async function buildLyricsMapForAlbumTracks(
  albumIdSlug: string,
  userId: string | null | undefined,
  tracks: TrackRowLyricsInput[],
  albumLang: string
): Promise<Map<string, TrackLyricsBundle>> {
  const map = new Map<string, TrackLyricsBundle>();
  if (!userId || tracks.length === 0) {
    for (const track of tracks) {
      map.set(
        track.track_id,
        composeTrackLyricsBundle({
          albumId: albumIdSlug,
          trackId: track.track_id,
          canonicalLang: canonicalStorageLang(albumLang),
          content: track.content,
          authorship: track.authorship,
          syncedRow: null,
        })
      );
    }
    return map;
  }

  const canon = await findCanonicalAlbumForUser(albumIdSlug, userId);
  const canonicalLang = canon ? canonicalStorageLang(canon.lang) : canonicalStorageLang(albumLang);
  const syncMap = await loadSyncedRowsForAlbumTracks(
    userId,
    albumIdSlug,
    tracks.map((t) => t.track_id),
    canonicalLang
  );

  for (const track of tracks) {
    map.set(
      track.track_id,
      composeTrackLyricsBundle({
        albumId: albumIdSlug,
        trackId: track.track_id,
        canonicalLang,
        content: track.content,
        authorship: track.authorship,
        syncedRow: syncMap.get(track.track_id) ?? null,
      })
    );
  }

  return map;
}

/** Merge lyrics bundles across locale payloads (ru-first timed sync). */
export function mergeTrackLyricsBundles(bundles: TrackLyricsBundle[]): TrackLyricsBundle {
  if (bundles.length === 0) {
    throw new Error('mergeTrackLyricsBundles: empty');
  }
  const synced = bundles.find((b) => b.state === 'synced');
  if (synced) return synced;
  const withText = bundles.find((b) => b.content.trim());
  return withText ?? bundles[0];
}
