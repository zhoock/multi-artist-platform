import { describe, expect, it } from '@jest/globals';
import { mergeCatalogTrackLocales, type CatalogTrackLocaleRow } from '../mergeCatalogTrackLocales';

function row(
  partial: Partial<CatalogTrackLocaleRow> & Pick<CatalogTrackLocaleRow, 'track_id'>
): CatalogTrackLocaleRow {
  return {
    album_pk: partial.album_pk ?? 'pk',
    track_id: partial.track_id,
    duration: partial.duration ?? 100,
    visibility: partial.visibility ?? 'public',
    stems_visibility: partial.stems_visibility ?? 'public',
    has_stems: partial.has_stems ?? false,
  };
}

describe('mergeCatalogTrackLocales', () => {
  it('ORs has_stems across locales (ru false + en true → true)', () => {
    const merged = mergeCatalogTrackLocales([
      row({ track_id: '2', album_pk: 'ru', has_stems: false }),
      row({ track_id: '2', album_pk: 'en', has_stems: true }),
    ]);
    expect(merged.has_stems).toBe(true);
    expect(merged.album_pk).toBe('ru'); // first locale kept as base
  });

  it('keeps has_stems false when no locale has stems', () => {
    const merged = mergeCatalogTrackLocales([
      row({ track_id: '1', has_stems: false }),
      row({ track_id: '1', has_stems: false }),
    ]);
    expect(merged.has_stems).toBe(false);
  });

  it('takes most open stems_visibility across locales', () => {
    const merged = mergeCatalogTrackLocales([
      row({ track_id: '1', stems_visibility: 'hidden' }),
      row({ track_id: '1', stems_visibility: 'public' }),
    ]);
    expect(merged.stems_visibility).toBe('public');
  });

  it('takes most open track visibility and max duration', () => {
    const merged = mergeCatalogTrackLocales([
      row({ track_id: '1', visibility: 'hidden', duration: 10 }),
      row({ track_id: '1', visibility: 'subscribers_only', duration: 200 }),
    ]);
    expect(merged.visibility).toBe('subscribers_only');
    expect(merged.duration).toBe(200);
  });
});
