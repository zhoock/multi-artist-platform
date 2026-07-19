/**
 * Merge per-locale track rows that share the same track_id.
 *
 * Localized / presentation fields: keep the first row (caller sorts by lang preference).
 * Technical fields: aggregate across locales — never first-wins.
 *
 * `stems_visibility` is NOT localizable: POST /api/update-stems-visibility writes the same
 * value to every locale row of (user, album_id, track_id). When rows diverge (legacy data),
 * we take the most open value so Mixer listing does not hide stems due to a stale locale.
 */

import {
  normalizeStemsVisibility,
  type StemsVisibility,
} from '../../../src/shared/lib/stems/stemsVisibility';
import {
  normalizeTrackVisibility,
  type TrackVisibility,
} from '../../../src/shared/lib/tracks/trackVisibility';

export type CatalogTrackLocaleRow = {
  album_pk: string;
  track_id: string;
  duration: number | null;
  visibility: string | null;
  stems_visibility: string | null;
  has_stems: boolean | null;
};

const VISIBILITY_OPENNESS: Record<TrackVisibility, number> = {
  public: 2,
  subscribers_only: 1,
  hidden: 0,
};

function mostOpenTrackVisibility(
  a: string | null | undefined,
  b: string | null | undefined
): string {
  const na = normalizeTrackVisibility(a);
  const nb = normalizeTrackVisibility(b);
  return VISIBILITY_OPENNESS[na] >= VISIBILITY_OPENNESS[nb] ? na : nb;
}

function mostOpenStemsVisibility(
  a: string | null | undefined,
  b: string | null | undefined
): StemsVisibility {
  const na = normalizeStemsVisibility(a);
  const nb = normalizeStemsVisibility(b);
  return VISIBILITY_OPENNESS[na] >= VISIBILITY_OPENNESS[nb] ? na : nb;
}

/**
 * @param rows Locale rows for one track_id, ordered by preferred lang first.
 */
export function mergeCatalogTrackLocales(rows: CatalogTrackLocaleRow[]): CatalogTrackLocaleRow {
  if (rows.length === 0) {
    throw new Error('mergeCatalogTrackLocales: empty rows');
  }
  if (rows.length === 1) {
    return rows[0];
  }

  const first = rows[0];
  let has_stems = first.has_stems === true;
  let duration = first.duration;
  let visibility = first.visibility;
  let stems_visibility = first.stems_visibility;

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.has_stems === true) {
      has_stems = true;
    }
    if (typeof row.duration === 'number' && !Number.isNaN(row.duration)) {
      if (typeof duration !== 'number' || Number.isNaN(duration) || row.duration > duration) {
        duration = row.duration;
      }
    }
    visibility = mostOpenTrackVisibility(visibility, row.visibility);
    stems_visibility = mostOpenStemsVisibility(stems_visibility, row.stems_visibility);
  }

  return {
    ...first,
    has_stems,
    duration,
    visibility,
    stems_visibility,
  };
}
