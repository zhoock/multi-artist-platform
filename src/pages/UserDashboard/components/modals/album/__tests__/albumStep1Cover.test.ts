/**
 * Album Wizard step 1 — front vs back cover validation and merge for save.
 */

import { describe, expect, test } from '@jest/globals';
import {
  getAlbumStep1InvalidFields,
  hasAlbumCoverForStep1,
  makeEmptyForm,
} from '../EditAlbumModal.utils';
import { mergeAlbumCoverPayloadForSave } from '@shared/lib/albumCoverStorage';

const BG = {
  primary: [1, 2, 3] as [number, number, number],
  secondary: [4, 5, 6] as [number, number, number],
};

describe('album step 1 cover requirements', () => {
  const baseForm = () => ({
    ...makeEmptyForm(),
    title: 'Rubber Soul',
    releaseDate: '03/10/1965',
    upcEan: '075992444825',
    description: 'Test album',
  });

  test('1 — new album: both covers empty → front invalid', () => {
    const form = baseForm();
    const invalid = getAlbumStep1InvalidFields(form, {
      cover: { albumArtPreview: null, coverDraftKey: null },
    });
    expect(invalid).toContain('cover');
  });

  test('2 — only front cover present → step 1 valid (no cover error)', () => {
    const form = baseForm();
    const invalid = getAlbumStep1InvalidFields(form, {
      cover: { albumArtPreview: 'https://cdn/preview.webp', coverDraftKey: 'draft' },
    });
    expect(invalid).not.toContain('cover');
  });

  test('3 — front + back previews → still valid', () => {
    const form = { ...baseForm(), backCoverArt: null };
    const invalid = getAlbumStep1InvalidFields(form, {
      cover: { albumArtPreview: 'front.webp', coverDraftKey: null },
    });
    expect(invalid).not.toContain('cover');
  });

  test('4 — only back cover file does not satisfy front requirement', () => {
    const form = {
      ...baseForm(),
      backCoverArt: new File(['x'], 'back.jpg', { type: 'image/jpeg' }),
    };
    expect(hasAlbumCoverForStep1(form, { albumArtPreview: null, coverDraftKey: null })).toBe(false);
    const invalid = getAlbumStep1InvalidFields(form, {
      cover: { albumArtPreview: null, coverDraftKey: null },
    });
    expect(invalid).toContain('cover');
  });

  test('5 — missing back cover does not block step 1 when front is valid', () => {
    const form = baseForm();
    const invalid = getAlbumStep1InvalidFields(form, {
      cover: { albumArtPreview: 'front', coverDraftKey: null },
    });
    expect(invalid).not.toContain('cover');
  });
});

describe('mergeAlbumCoverPayloadForSave', () => {
  test('6 — existing album without back: no cover patch when nothing changed', () => {
    const merged = mergeAlbumCoverPayloadForSave({
      prior: { img: 'front-base', playerBackground: BG },
      front: null,
      backBaseName: null,
    });
    expect(merged).toBeUndefined();
  });

  test('7 — existing album with back preserved when only front updates', () => {
    const merged = mergeAlbumCoverPayloadForSave({
      prior: { img: 'old-front', playerBackground: BG, backImg: 'old-back' },
      front: { img: 'new-front', playerBackground: BG },
      backBaseName: null,
    });
    expect(merged).toEqual({
      img: 'new-front',
      playerBackground: BG,
      backImg: 'old-back',
    });
  });

  test('8 — back replacement merges with existing front', () => {
    const merged = mergeAlbumCoverPayloadForSave({
      prior: { img: 'front-base', playerBackground: BG, backImg: 'old-back' },
      front: null,
      backBaseName: 'new-back-base',
    });
    expect(merged).toEqual({
      img: 'front-base',
      playerBackground: BG,
      backImg: 'new-back-base',
    });
  });

  test('9 — front upload still produces canonical payload', () => {
    const merged = mergeAlbumCoverPayloadForSave({
      prior: { img: '' },
      front: { img: 'new-front', playerBackground: BG },
      backBaseName: null,
    });
    expect(merged).toEqual({ img: 'new-front', playerBackground: BG });
  });
});
