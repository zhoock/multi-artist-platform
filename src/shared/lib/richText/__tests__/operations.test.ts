import { describe, expect, it } from '@jest/globals';

import { EMPTY_RICH_TEXT } from '../types';
import {
  mergeAdjacentNodes,
  normalizeRichText,
  removeLink,
  setLink,
  splitNode,
  toggleMark,
} from '../operations';

describe('mergeAdjacentNodes', () => {
  it('merges adjacent nodes with identical marks', () => {
    const input = [
      { text: 'Hel', marks: [{ type: 'bold' as const }] },
      { text: 'lo', marks: [{ type: 'bold' as const }] },
    ];

    expect(mergeAdjacentNodes(input)).toEqual([{ text: 'Hello', marks: [{ type: 'bold' }] }]);
  });

  it('does not merge nodes with different marks', () => {
    const input = [
      { text: 'Hello', marks: [{ type: 'bold' as const }] },
      { text: ' world', marks: [] },
    ];

    expect(mergeAdjacentNodes(input)).toEqual(input);
  });
});

describe('normalizeRichText', () => {
  it('removes empty nodes including those with marks', () => {
    const input = [
      { text: '', marks: [{ type: 'bold' as const }] },
      { text: 'Hello', marks: [] },
    ];

    expect(normalizeRichText(input)).toEqual([{ text: 'Hello', marks: [] }]);
  });

  it('merges adjacent nodes with identical marks', () => {
    const input = [
      { text: 'Hel', marks: [{ type: 'bold' as const }] },
      { text: 'lo', marks: [{ type: 'bold' as const }] },
    ];

    expect(normalizeRichText(input)).toEqual([{ text: 'Hello', marks: [{ type: 'bold' }] }]);
  });

  it('returns EMPTY_RICH_TEXT shape when everything is empty', () => {
    expect(normalizeRichText([])).toEqual(EMPTY_RICH_TEXT);
    expect(normalizeRichText([{ text: '', marks: [{ type: 'bold' as const }] }])).toEqual(
      EMPTY_RICH_TEXT
    );
  });
});

describe('splitNode', () => {
  it('splits a node at offset preserving marks', () => {
    const input = [{ text: 'Hello world', marks: [{ type: 'bold' as const }] }];

    expect(splitNode(input, 0, 5)).toEqual([
      { text: 'Hello', marks: [{ type: 'bold' }] },
      { text: ' world', marks: [{ type: 'bold' }] },
    ]);
  });
});

describe('toggleMark', () => {
  it('applies bold to a subrange', () => {
    const input = [{ text: 'Hello world', marks: [] }];

    expect(toggleMark(input, 6, 11, { type: 'bold' })).toEqual([
      { text: 'Hello ', marks: [] },
      { text: 'world', marks: [{ type: 'bold' }] },
    ]);
  });

  it('removes bold when toggled again on the same range', () => {
    const boldWorld = toggleMark([{ text: 'Hello world', marks: [] }], 6, 11, {
      type: 'bold',
    });

    expect(toggleMark(boldWorld, 6, 11, { type: 'bold' })).toEqual([
      { text: 'Hello world', marks: [] },
    ]);
  });

  it('supports bold and italic on the same range independently', () => {
    const bold = toggleMark([{ text: 'текст', marks: [] }], 0, 5, { type: 'bold' });
    const boldItalic = toggleMark(bold, 0, 5, { type: 'italic' });

    expect(boldItalic).toEqual([{ text: 'текст', marks: [{ type: 'bold' }, { type: 'italic' }] }]);

    const boldOnly = toggleMark(boldItalic, 0, 5, { type: 'italic' });
    expect(boldOnly).toEqual([{ text: 'текст', marks: [{ type: 'bold' }] }]);
  });
});

describe('setLink', () => {
  it('sets a single link mark on the selected range', () => {
    const input = [{ text: 'OpenAI site', marks: [] }];

    expect(setLink(input, 0, 6, 'https://openai.com')).toEqual([
      { text: 'OpenAI', marks: [{ type: 'link', href: 'https://openai.com' }] },
      { text: ' site', marks: [] },
    ]);
  });

  it('replaces an existing link mark in the range', () => {
    const input = [
      { text: 'OpenAI', marks: [{ type: 'link' as const, href: 'https://old.example' }] },
    ];

    expect(setLink(input, 0, 6, 'https://openai.com')).toEqual([
      { text: 'OpenAI', marks: [{ type: 'link', href: 'https://openai.com' }] },
    ]);
  });
});

describe('removeLink', () => {
  it('removes only link marks and keeps other marks', () => {
    const input = [
      {
        text: 'OpenAI',
        marks: [{ type: 'bold' as const }, { type: 'link' as const, href: 'https://openai.com' }],
      },
    ];

    expect(removeLink(input, 0, 6)).toEqual([{ text: 'OpenAI', marks: [{ type: 'bold' }] }]);
  });
});

describe('operations invariants', () => {
  it('never returns an empty RichText array', () => {
    const cleared = toggleMark(EMPTY_RICH_TEXT, 0, 0, { type: 'bold' });
    expect(cleared).toEqual(EMPTY_RICH_TEXT);
    expect(cleared.length).toBeGreaterThan(0);
  });
});
