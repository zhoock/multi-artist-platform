import { describe, expect, test } from '@jest/globals';
import type { ArticledetailsProps } from '@models';

import {
  resolveArticleLockedBodySize,
  resolveLockedArticleBodyBlocks,
  splitArticleDetailsForArchiveGate,
} from '../splitArticleDetailsForArchiveGate';

describe('splitArticleDetailsForArchiveGate', () => {
  test('includes first image and first paragraph only, not section heading', () => {
    const details: ArticledetailsProps[] = [
      { id: 1, title: 'Section' },
      { id: 2, img: 'hero.jpg' },
      { id: 3, content: 'First visible paragraph' },
      { id: 4, content: 'Hidden paragraph' },
    ];

    expect(splitArticleDetailsForArchiveGate(details)).toEqual({
      previewDetails: [
        { id: 2, img: 'hero.jpg' },
        { id: 3, content: 'First visible paragraph' },
      ],
      lockedDetails: [
        { id: 1, title: 'Section' },
        { id: 4, content: 'Hidden paragraph' },
      ],
    });
  });

  test('includes only first text when image lives in the same block', () => {
    const details: ArticledetailsProps[] = [
      { id: 1, title: 'BOSS DS-1', img: 'ds1.jpg', content: 'First pedal caption' },
      { id: 2, title: 'RAT', img: 'rat.jpg', content: 'Hidden pedal caption' },
    ];

    expect(splitArticleDetailsForArchiveGate(details)).toEqual({
      previewDetails: [
        { id: 1, title: 'BOSS DS-1', img: 'ds1.jpg', content: 'First pedal caption' },
      ],
      lockedDetails: [{ id: 2, title: 'RAT', img: 'rat.jpg', content: 'Hidden pedal caption' }],
    });
  });

  test('includes paragraph before first image and skips long middle content', () => {
    const details: ArticledetailsProps[] = [
      { id: 1, title: 'About' },
      { id: 2, content: 'Lead paragraph' },
      { id: 3, content: 'A'.repeat(400) },
      { id: 4, content: 'More middle text' },
      { id: 5, img: 'hero.jpg' },
      { id: 6, content: 'Hidden paragraph' },
    ];

    expect(splitArticleDetailsForArchiveGate(details)).toEqual({
      previewDetails: [
        { id: 2, content: 'Lead paragraph' },
        { id: 5, img: 'hero.jpg' },
      ],
      lockedDetails: [
        { id: 1, title: 'About' },
        { id: 3, content: 'A'.repeat(400) },
        { id: 4, content: 'More middle text' },
        { id: 6, content: 'Hidden paragraph' },
      ],
    });
  });

  test('adds one extra short text block when enough content remains locked', () => {
    const details: ArticledetailsProps[] = [
      { id: 1, title: 'Intro' },
      { id: 2, content: 'Opening paragraph' },
      { id: 3, img: 'hero.jpg' },
      { id: 4, content: 'Short teaser after image' },
      { id: 5, content: 'Hidden paragraph one' },
      { id: 6, content: 'Hidden paragraph two' },
    ];

    expect(splitArticleDetailsForArchiveGate(details)).toEqual({
      previewDetails: [
        { id: 2, content: 'Opening paragraph' },
        { id: 3, img: 'hero.jpg' },
        { id: 4, content: 'Short teaser after image' },
      ],
      lockedDetails: [
        { id: 1, title: 'Intro' },
        { id: 5, content: 'Hidden paragraph one' },
        { id: 6, content: 'Hidden paragraph two' },
      ],
    });
  });

  test('puts all blocks in locked section when there is no paragraph or image', () => {
    const details: ArticledetailsProps[] = [
      { id: 1, title: 'Only heading' },
      { id: 2, title: 'Another heading' },
    ];

    expect(splitArticleDetailsForArchiveGate(details)).toEqual({
      previewDetails: [],
      lockedDetails: details,
    });
  });

  test('treats carousel as first image and keeps following text locked', () => {
    const details: ArticledetailsProps[] = [
      { id: 1, title: 'Intro' },
      { id: 2, content: 'Teaser paragraph' },
      { id: 3, images: ['a.jpg', 'b.jpg'] },
      { id: 4, content: 'After carousel' },
    ];

    expect(splitArticleDetailsForArchiveGate(details)).toEqual({
      previewDetails: [
        { id: 2, content: 'Teaser paragraph' },
        { id: 3, images: ['a.jpg', 'b.jpg'] },
      ],
      lockedDetails: [
        { id: 1, title: 'Intro' },
        { id: 4, content: 'After carousel' },
      ],
    });
  });

  test('does not add extra short text when only one locked block remains', () => {
    const details: ArticledetailsProps[] = [
      { id: 1, content: 'Lead paragraph' },
      { id: 2, img: 'hero.jpg' },
      { id: 3, content: 'Only locked paragraph' },
    ];

    expect(splitArticleDetailsForArchiveGate(details)).toEqual({
      previewDetails: [
        { id: 1, content: 'Lead paragraph' },
        { id: 2, img: 'hero.jpg' },
      ],
      lockedDetails: [{ id: 3, content: 'Only locked paragraph' }],
    });
  });

  test('resolveLockedArticleBodyBlocks returns all details when preview is empty', () => {
    const details = [
      { id: 1, title: 'Intro' },
      { id: 2, title: 'No text' },
    ];
    const split = splitArticleDetailsForArchiveGate(details);

    expect(resolveLockedArticleBodyBlocks(details, split)).toEqual(details);
  });

  test('resolveArticleLockedBodySize scales with content volume', () => {
    expect(resolveArticleLockedBodySize([], 0)).toBe('compact');
    expect(resolveArticleLockedBodySize([{ content: 'Short' }], 0)).toBe('compact');
    expect(
      resolveArticleLockedBodySize(
        [
          { content: ['a', 'b', 'c'] },
          { img: 'x.jpg' },
          { title: 'More' },
          { content: 'paragraph' },
        ],
        0
      )
    ).toBe('medium');
  });
});
