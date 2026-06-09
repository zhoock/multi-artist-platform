import { describe, test, expect } from '@jest/globals';

import { groupRuns, type RenderNode } from '../renderTree';
import type { RichTextNode } from '../types';

const bold = { type: 'bold' as const };
const italic = { type: 'italic' as const };

function text(value: string): RenderNode {
  return { kind: 'text', text: value };
}

describe('groupRuns', () => {
  test('plain run → single text node', () => {
    expect(groupRuns([{ text: 'Просто', marks: [] }])).toEqual([text('Просто')]);
  });

  test('single mark run → mark node wrapping text', () => {
    expect(groupRuns([{ text: 'Жирный', marks: [bold] }])).toEqual([
      { kind: 'mark', mark: bold, children: [text('Жирный')] },
    ]);
  });

  test('groups [bold] [bold,italic] [bold] under one bold with inner em', () => {
    const runs: RichTextNode[] = [
      { text: 'text1', marks: [bold] },
      { text: 'text2', marks: [bold, italic] },
      { text: 'text3', marks: [bold] },
    ];
    expect(groupRuns(runs)).toEqual([
      {
        kind: 'mark',
        mark: bold,
        children: [
          text('text1'),
          { kind: 'mark', mark: italic, children: [text('text2')] },
          text('text3'),
        ],
      },
    ]);
  });

  test('does NOT merge [bold] [italic] [bold] across a non-bold run', () => {
    const runs: RichTextNode[] = [
      { text: 't1', marks: [bold] },
      { text: 't2', marks: [italic] },
      { text: 't3', marks: [bold] },
    ];
    expect(groupRuns(runs)).toEqual([
      { kind: 'mark', mark: bold, children: [text('t1')] },
      { kind: 'mark', mark: italic, children: [text('t2')] },
      { kind: 'mark', mark: bold, children: [text('t3')] },
    ]);
  });

  test('greedy: [bold] [bold,italic] [italic] keeps trailing italic separate', () => {
    const runs: RichTextNode[] = [
      { text: 't0', marks: [bold] },
      { text: 't1', marks: [bold, italic] },
      { text: 't2', marks: [italic] },
    ];
    expect(groupRuns(runs)).toEqual([
      {
        kind: 'mark',
        mark: bold,
        children: [text('t0'), { kind: 'mark', mark: italic, children: [text('t1')] }],
      },
      { kind: 'mark', mark: italic, children: [text('t2')] },
    ]);
  });

  test('mark order in node array does not affect the tree (order independence)', () => {
    const a = groupRuns([{ text: 'x', marks: [bold, italic] }]);
    const b = groupRuns([{ text: 'x', marks: [italic, bold] }]);
    expect(a).toEqual(b);
    expect(a).toEqual([
      {
        kind: 'mark',
        mark: bold,
        children: [{ kind: 'mark', mark: italic, children: [text('x')] }],
      },
    ]);
  });

  describe('link nesting', () => {
    test('single run [bold, link] → link is outermost within the run', () => {
      const link = { type: 'link' as const, href: 'https://x.dev' };
      expect(groupRuns([{ text: 'OpenAI', marks: [bold, link] }])).toEqual([
        {
          kind: 'mark',
          mark: link,
          children: [{ kind: 'mark', mark: bold, children: [text('OpenAI')] }],
        },
      ]);
    });

    test('[bold] [bold,link] → shared bold wraps, link only on its run', () => {
      const link = { type: 'link' as const, href: 'https://x.dev' };
      const runs: RichTextNode[] = [
        { text: 'text1', marks: [bold] },
        { text: 'text2', marks: [bold, link] },
      ];
      expect(groupRuns(runs)).toEqual([
        {
          kind: 'mark',
          mark: bold,
          children: [text('text1'), { kind: 'mark', mark: link, children: [text('text2')] }],
        },
      ]);
    });

    test('different hrefs on adjacent runs are not grouped', () => {
      const linkA = { type: 'link' as const, href: 'https://a.dev' };
      const linkB = { type: 'link' as const, href: 'https://b.dev' };
      const runs: RichTextNode[] = [
        { text: 'a', marks: [linkA] },
        { text: 'b', marks: [linkB] },
      ];
      expect(groupRuns(runs)).toEqual([
        { kind: 'mark', mark: linkA, children: [text('a')] },
        { kind: 'mark', mark: linkB, children: [text('b')] },
      ]);
    });
  });

  describe('empty handling', () => {
    test('drops empty-text runs before grouping', () => {
      const runs: RichTextNode[] = [
        { text: '', marks: [bold] },
        { text: 'visible', marks: [bold] },
      ];
      expect(groupRuns(runs)).toEqual([{ kind: 'mark', mark: bold, children: [text('visible')] }]);
    });

    test('empty input → empty tree', () => {
      expect(groupRuns([])).toEqual([]);
      expect(groupRuns([{ text: '', marks: [] }])).toEqual([]);
    });
  });
});
