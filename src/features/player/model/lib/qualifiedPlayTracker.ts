/**
 * Client-side qualified listen accumulation for the global player.
 * Sends at most one qualified event per playback session + track.
 */

import { getOrCreateListenerAnonId } from '@shared/lib/analytics/listenerAnonId';
import { getAuthHeader, getUser } from '@shared/lib/auth';
import {
  getQualifiedListenThresholdSeconds,
  isQualifiedListenDuration,
} from '@shared/lib/qualifiedListenThreshold';
import { computeQualifiedPlayAccumulationDelta } from '@features/player/model/lib/qualifiedPlayAccumulation';

export { getQualifiedListenThresholdSeconds, isQualifiedListenDuration };

type SessionState = {
  playbackSessionId: string;
  albumSlug: string;
  logicalTrackId: string;
  trackDurationSeconds: number;
  accumulatedSeconds: number;
  lastCurrentTime: number;
  lastWallMs: number;
  qualifiedSent: boolean;
  artistUserId: string | null;
  isWaiting: boolean;
  isPaused: boolean;
  isSeeking: boolean;
};

let session: SessionState | null = null;
let inFlightSend = false;

function resolveArtistUserId(
  albumMetaUserId: string | null | undefined,
  queueUserId: string | null | undefined
): string | null {
  const fromQueue = queueUserId?.trim();
  if (fromQueue) return fromQueue;
  const fromMeta = albumMetaUserId?.trim();
  return fromMeta || null;
}

function canAccumulateNow(state: SessionState): boolean {
  return !state.isWaiting && !state.isPaused && !state.isSeeking;
}

function runAccumulationTick(currentTime: number, playbackRate: number, nowMs: number): void {
  if (!session || session.qualifiedSent || inFlightSend) return;

  const result = computeQualifiedPlayAccumulationDelta({
    currentTime,
    lastCurrentTime: session.lastCurrentTime,
    lastWallMs: session.lastWallMs,
    nowMs,
    playbackRate,
    canAccumulate: canAccumulateNow(session),
  });

  session.lastCurrentTime = result.nextLastCurrentTime;
  session.lastWallMs = result.nextLastWallMs;
  if (result.deltaToAdd > 0) {
    session.accumulatedSeconds += result.deltaToAdd;
  }

  if (!isQualifiedListenDuration(session.accumulatedSeconds, session.trackDurationSeconds)) {
    return;
  }

  void submitQualifiedPlay(session);
}

export function resetQualifiedPlaySession(): void {
  session = null;
}

export function beginQualifiedPlaySession(input: {
  albumSlug: string;
  logicalTrackId: string;
  trackDurationSeconds: number;
  artistUserId?: string | null;
}): void {
  const albumSlug = input.albumSlug.trim();
  const logicalTrackId = input.logicalTrackId.trim();
  if (!albumSlug || !logicalTrackId) {
    session = null;
    return;
  }

  const nowMs = Date.now();
  session = {
    playbackSessionId: crypto.randomUUID(),
    albumSlug,
    logicalTrackId,
    trackDurationSeconds: Number.isFinite(input.trackDurationSeconds)
      ? input.trackDurationSeconds
      : 0,
    accumulatedSeconds: 0,
    lastCurrentTime: 0,
    lastWallMs: nowMs,
    qualifiedSent: false,
    artistUserId: input.artistUserId?.trim() || null,
    isWaiting: false,
    isPaused: false,
    isSeeking: false,
  };
}

/**
 * New playback launch of the same track (e.g. repeat one) without loadedmetadata.
 */
export function restartQualifiedPlaySessionForSameTrack(): void {
  if (!session) return;

  inFlightSend = false;
  const nowMs = Date.now();
  session.playbackSessionId = crypto.randomUUID();
  session.accumulatedSeconds = 0;
  session.lastCurrentTime = 0;
  session.lastWallMs = nowMs;
  session.qualifiedSent = false;
  session.isWaiting = false;
  session.isPaused = false;
  session.isSeeking = false;
}

export function syncQualifiedPlaySeeking(isSeeking: boolean, currentTime: number): void {
  if (!session) return;
  session.isSeeking = isSeeking;
  if (isSeeking) {
    session.lastCurrentTime = currentTime;
    session.lastWallMs = Date.now();
  }
}

export function onQualifiedPlayWaiting(currentTime: number): void {
  if (!session) return;
  session.isWaiting = true;
  session.lastCurrentTime = currentTime;
  session.lastWallMs = Date.now();
}

export function onQualifiedPlayPlaying(currentTime: number): void {
  if (!session) return;
  session.isWaiting = false;
  session.isPaused = false;
  session.lastCurrentTime = currentTime;
  session.lastWallMs = Date.now();
}

export function onQualifiedPlayPause(currentTime: number): void {
  if (!session) return;
  session.isPaused = true;
  session.lastCurrentTime = currentTime;
  session.lastWallMs = Date.now();
}

export function onQualifiedPlaySeeked(currentTime: number): void {
  if (!session) return;
  session.isSeeking = false;
  session.lastCurrentTime = currentTime;
  session.lastWallMs = Date.now();
}

/**
 * Call from throttled audio timeupdate when duration is known.
 */
export function tickQualifiedPlayAccumulation(
  currentTime: number,
  playbackRate: number,
  isPlaying: boolean
): void {
  if (!session || session.qualifiedSent || inFlightSend) return;

  if (!isPlaying) {
    session.isPaused = true;
    session.lastCurrentTime = currentTime;
    session.lastWallMs = Date.now();
    return;
  }

  session.isPaused = false;
  runAccumulationTick(currentTime, playbackRate, Date.now());
}

async function submitQualifiedPlay(active: SessionState): Promise<void> {
  if (active.qualifiedSent || inFlightSend) return;
  inFlightSend = true;

  try {
    const authUser = getUser();
    if (authUser?.id && active.artistUserId && authUser.id === active.artistUserId) {
      active.qualifiedSent = true;
      return;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const auth = getAuthHeader();
    if ('Authorization' in auth) {
      Object.assign(headers, auth);
    } else {
      headers['X-Listener-Anon-Id'] = getOrCreateListenerAnonId();
    }

    const response = await fetch('/api/record-qualified-play', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        albumId: active.albumSlug,
        trackId: active.logicalTrackId,
        playbackSessionId: active.playbackSessionId,
        durationListenedSeconds: Math.floor(active.accumulatedSeconds),
        ...('Authorization' in auth ? {} : { listenerAnonId: headers['X-Listener-Anon-Id'] }),
      }),
      keepalive: true,
    });

    if (response.ok) {
      active.qualifiedSent = true;
    }
  } catch {
    /* ignore — analytics must not break playback */
  } finally {
    inFlightSend = false;
  }
}

/** Resolve artist id from player state when starting a session. */
export function resolveArtistUserIdForPlayerTrack(input: {
  albumMetaUserId?: string | null;
  queueAlbumMetaUserId?: string | null;
}): string | null {
  return resolveArtistUserId(input.albumMetaUserId, input.queueAlbumMetaUserId);
}
