import { markdownToRichText } from '../markdownAdapter';
import {
  getActiveMarks,
  getLinkAtSelection,
  getMarkRange,
  isCollapsedSelection,
} from '../selection';
import type { RichText } from '../types';

function md(markdown: string): RichText {
  return markdownToRichText(markdown);
}

describe('isCollapsedSelection', () => {
  it('returns true when from equals to', () => {
    expect(isCollapsedSelection(3, 3)).toBe(true);
    expect(isCollapsedSelection(0, 0)).toBe(true);
  });

  it('returns false for non-empty range', () => {
    expect(isCollapsedSelection(0, 3)).toBe(false);
    expect(isCollapsedSelection(3, 0)).toBe(false);
  });
});

describe('getActiveMarks', () => {
  it('returns bold for bold selection', () => {
    const content = md('**abc**');
    expect(getActiveMarks(content, 0, 3)).toEqual(new Set(['bold']));
  });

  it('returns bold and italic for nested selection', () => {
    const content = md('**_abc_**');
    expect(getActiveMarks(content, 0, 3)).toEqual(new Set(['bold', 'italic']));
  });

  it('returns link for linked selection', () => {
    const content = md('[abc](https://x.dev)');
    expect(getActiveMarks(content, 0, 3)).toEqual(new Set(['link']));
  });

  it('returns underline for underlined selection', () => {
    const content = md('<u>abc</u>');
    expect(getActiveMarks(content, 0, 3)).toEqual(new Set(['underline']));
  });

  it('returns strike for strikethrough selection', () => {
    const content = md('~~abc~~');
    expect(getActiveMarks(content, 0, 3)).toEqual(new Set(['strike']));
  });

  it('intersects marks across multiple runs in selection', () => {
    const content: RichText = [
      { text: 'ab', marks: [{ type: 'bold' }] },
      { text: 'c', marks: [{ type: 'bold' }, { type: 'italic' }] },
    ];
    expect(getActiveMarks(content, 0, 3)).toEqual(new Set(['bold']));
  });

  it('returns partial intersection when only some runs share a mark', () => {
    const content: RichText = [
      { text: 'ab', marks: [{ type: 'bold' }] },
      { text: 'c', marks: [{ type: 'italic' }] },
    ];
    expect(getActiveMarks(content, 0, 3)).toEqual(new Set());
  });

  it('returns empty set for empty selection on empty block', () => {
    const content = md('');
    expect(getActiveMarks(content, 0, 0)).toEqual(new Set());
  });

  it('returns marks at caret for collapsed selection', () => {
    const content = md('**abc**');
    expect(getActiveMarks(content, 1, 1)).toEqual(new Set(['bold']));
  });

  it('returns empty set for collapsed caret outside formatted runs', () => {
    const content: RichText = [
      { text: 'a', marks: [] },
      { text: 'b', marks: [{ type: 'bold' }] },
    ];
    expect(getActiveMarks(content, 0, 0)).toEqual(new Set());
  });

  it('does not include link when selection spans different hrefs', () => {
    const content: RichText = [
      { text: 'a', marks: [{ type: 'link', href: 'https://a.dev' }] },
      { text: 'b', marks: [{ type: 'link', href: 'https://b.dev' }] },
    ];
    expect(getActiveMarks(content, 0, 2)).toEqual(new Set());
  });
});

describe('getLinkAtSelection', () => {
  it('returns href when entire selection is one link', () => {
    const content = md('[abc](https://x.dev)');
    expect(getLinkAtSelection(content, 0, 3)).toBe('https://x.dev');
  });

  it('returns null when selection is not linked', () => {
    const content = md('plain');
    expect(getLinkAtSelection(content, 0, 5)).toBeNull();
  });

  it('returns null when link is not active on full selection', () => {
    const content: RichText = [
      { text: 'a', marks: [{ type: 'link', href: 'https://a.dev' }] },
      { text: 'b', marks: [{ type: 'link', href: 'https://b.dev' }] },
    ];
    expect(getLinkAtSelection(content, 0, 2)).toBeNull();
  });

  it('returns null for collapsed caret without link', () => {
    const content = md('hello');
    expect(getLinkAtSelection(content, 2, 2)).toBeNull();
  });
});

describe('getMarkRange', () => {
  it('returns full bold range for offset inside bold text', () => {
    const content = md('x **abc** y');
    expect(getMarkRange(content, 3, 'bold')).toEqual({ from: 2, to: 5 });
  });

  it('returns full link range for offset inside link', () => {
    const content = md('[abc](https://x.dev)');
    expect(getMarkRange(content, 1, 'link')).toEqual({ from: 0, to: 3 });
  });

  it('expands across adjacent runs with the same mark', () => {
    const content: RichText = [
      { text: 'ab', marks: [{ type: 'bold' }] },
      { text: 'c', marks: [{ type: 'bold' }, { type: 'italic' }] },
    ];
    expect(getMarkRange(content, 2, 'bold')).toEqual({ from: 0, to: 3 });
  });

  it('returns null when mark is absent at offset', () => {
    const content = md('plain');
    expect(getMarkRange(content, 0, 'bold')).toBeNull();
  });

  it('stops at run boundary when mark differs', () => {
    const content: RichText = [
      { text: 'ab', marks: [{ type: 'bold' }] },
      { text: 'c', marks: [{ type: 'italic' }] },
    ];
    expect(getMarkRange(content, 0, 'bold')).toEqual({ from: 0, to: 2 });
  });

  it('returns italic subrange inside bold+italic run', () => {
    const content: RichText = [{ text: 'abc', marks: [{ type: 'bold' }, { type: 'italic' }] }];
    expect(getMarkRange(content, 1, 'italic')).toEqual({ from: 0, to: 3 });
  });
});
