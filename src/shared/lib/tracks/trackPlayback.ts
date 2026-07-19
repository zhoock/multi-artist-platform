import { normalizeTrackVisibility } from './trackVisibility';

/** Minimal track shape for playback gating (TracksProps or PlayerTrack). */
export type PlaybackGateTrack = {
  src?: string;
  visibility?: 'public' | 'subscribers_only' | 'hidden' | string | null;
  playbackLocked?: boolean;
};

/**
 * Трек нельзя воспроизводить без premium (playbackLocked / пустой src у subscribers_only).
 * Плеер полагается на ответ API: подписка на артиста даёт src и playbackLocked: false.
 */
export function isTrackPlaybackBlocked(track: PlaybackGateTrack | undefined): boolean {
  if (!track) return true;
  const vis = normalizeTrackVisibility(track.visibility);
  const hasSrc = Boolean(String(track.src ?? '').trim());
  if (vis === 'subscribers_only') {
    return !hasSrc;
  }
  if (track.playbackLocked) return true;
  return false;
}

/** Первый играбельный индекс вокруг запрошенного; −1 если все заблокированы. */
export function resolveFirstPlayableIndex(
  playlist: PlaybackGateTrack[],
  requestedIndex: number
): number {
  if (!playlist.length) return -1;
  const clamped = Math.max(0, Math.min(requestedIndex, playlist.length - 1));
  if (!isTrackPlaybackBlocked(playlist[clamped])) return clamped;
  for (let i = clamped; i < playlist.length; i++) {
    if (!isTrackPlaybackBlocked(playlist[i])) return i;
  }
  for (let i = clamped - 1; i >= 0; i--) {
    if (!isTrackPlaybackBlocked(playlist[i])) return i;
  }
  return -1;
}

/**
 * Следующий/прежний играбельный индекс от `startIdx` (не проверяя сам `startIdx`), с обходом по кольцу.
 */
export function findAdjacentPlayableIndex(
  playlist: PlaybackGateTrack[],
  startIdx: number,
  direction: 1 | -1
): number {
  const n = playlist.length;
  if (n === 0) return -1;
  for (let step = 1; step < n; step++) {
    const idx = (startIdx + direction * step + n * 1000) % n;
    if (!isTrackPlaybackBlocked(playlist[idx])) return idx;
  }
  return -1;
}
