/**
 * Single rule for which tracks the public surfaces present (album page, artist catalog,
 * `?artist=` album payload). SQL gates mirror it in netlify/functions/lib/public-track-sql.ts.
 *
 * Missing processing status means a pre-pipeline row / schema without the column → `ready`.
 */

import { normalizeStemsVisibility } from '../stems/stemsVisibility';
import { normalizeTrackVisibility } from './trackVisibility';

/** Ordinary listenable track: not hidden and main audio fully processed. */
export function isPublicPlayableTrack(
  visibility: unknown,
  processingStatus: string | null | undefined
): boolean {
  return (
    normalizeTrackVisibility(visibility) !== 'hidden' && (processingStatus ?? 'ready') === 'ready'
  );
}

/** Hidden track whose stems stay available in Mixer; listed regardless of main-audio status. */
export function isMixerOnlyTrack(visibility: unknown, stemsVisibility: unknown): boolean {
  return (
    normalizeTrackVisibility(visibility) === 'hidden' &&
    normalizeStemsVisibility(stemsVisibility) !== 'hidden'
  );
}

export function isPublicListedTrack(
  visibility: unknown,
  stemsVisibility: unknown,
  processingStatus: string | null | undefined
): boolean {
  return (
    isPublicPlayableTrack(visibility, processingStatus) ||
    isMixerOnlyTrack(visibility, stemsVisibility)
  );
}
