import { mapMarkdownOffsetToPlain, mapPlainOffsetToMarkdown } from '../markdownAdapter';
import {
  cloneRichText,
  insertText,
  isRichTextEmpty,
  richTextToPlainText,
  splitRichTextAt,
} from '../operations';
import type { RichText } from '../types';

describe('richTextToPlainText / isRichTextEmpty', () => {
  it('concatenates node text without markdown', () => {
    const rt: RichText = [
      { text: 'Hello ', marks: [] },
      { text: 'world', marks: [{ type: 'bold' }] },
    ];
    expect(richTextToPlainText(rt)).toBe('Hello world');
  });

  it('treats null/undefined as empty', () => {
    expect(richTextToPlainText(null)).toBe('');
    expect(richTextToPlainText(undefined)).toBe('');
    expect(isRichTextEmpty(null)).toBe(true);
    expect(isRichTextEmpty(undefined)).toBe(true);
  });

  it('detects whitespace-only content as empty', () => {
    expect(isRichTextEmpty([{ text: '', marks: [] }])).toBe(true);
    expect(isRichTextEmpty([{ text: '   ', marks: [] }])).toBe(true);
    expect(isRichTextEmpty([{ text: 'x', marks: [] }])).toBe(false);
  });
});

describe('cloneRichText', () => {
  it('produces an independent deep copy', () => {
    const rt: RichText = [{ text: 'a', marks: [{ type: 'bold' }] }];
    const copy = cloneRichText(rt);
    expect(copy).toEqual(rt);
    expect(copy).not.toBe(rt);
    expect(copy[0]).not.toBe(rt[0]);
    expect(copy[0].marks).not.toBe(rt[0].marks);
    copy[0].text = 'b';
    copy[0].marks.push({ type: 'italic' });
    expect(rt[0].text).toBe('a');
    expect(rt[0].marks).toHaveLength(1);
  });
});

describe('splitRichTextAt', () => {
  it('splits a single plain node into two', () => {
    const rt: RichText = [{ text: 'Hello world', marks: [] }];
    const [before, after] = splitRichTextAt(rt, 5);
    expect(before).toEqual([{ text: 'Hello', marks: [] }]);
    expect(after).toEqual([{ text: ' world', marks: [] }]);
  });

  it('preserves marks across the split point', () => {
    const rt: RichText = [{ text: 'bolded', marks: [{ type: 'bold' }] }];
    const [before, after] = splitRichTextAt(rt, 3);
    expect(before).toEqual([{ text: 'bol', marks: [{ type: 'bold' }] }]);
    expect(after).toEqual([{ text: 'ded', marks: [{ type: 'bold' }] }]);
  });

  it('returns empty leaf for boundary splits', () => {
    const rt: RichText = [{ text: 'abc', marks: [] }];
    const [beforeStart, afterStart] = splitRichTextAt(rt, 0);
    expect(beforeStart).toEqual([{ text: '', marks: [] }]);
    expect(afterStart).toEqual([{ text: 'abc', marks: [] }]);

    const [beforeEnd, afterEnd] = splitRichTextAt(rt, 3);
    expect(beforeEnd).toEqual([{ text: 'abc', marks: [] }]);
    expect(afterEnd).toEqual([{ text: '', marks: [] }]);
  });

  it('splits across node boundaries', () => {
    const rt: RichText = [
      { text: 'ab', marks: [] },
      { text: 'cd', marks: [{ type: 'italic' }] },
    ];
    const [before, after] = splitRichTextAt(rt, 3);
    expect(before).toEqual([
      { text: 'ab', marks: [] },
      { text: 'c', marks: [{ type: 'italic' }] },
    ]);
    expect(after).toEqual([{ text: 'd', marks: [{ type: 'italic' }] }]);
  });
});

describe('insertText', () => {
  it('inserts plain text at offset', () => {
    const rt: RichText = [{ text: 'Helloworld', marks: [] }];
    expect(insertText(rt, 5, ' ')).toEqual([{ text: 'Hello world', marks: [] }]);
  });

  it('inherits marks from the character to the left', () => {
    const rt: RichText = [{ text: 'bold', marks: [{ type: 'bold' }] }];
    expect(insertText(rt, 2, 'XX')).toEqual([{ text: 'boXXld', marks: [{ type: 'bold' }] }]);
  });

  it('inserts without marks at the very start', () => {
    const rt: RichText = [{ text: 'bold', marks: [{ type: 'bold' }] }];
    expect(insertText(rt, 0, 'X')).toEqual([
      { text: 'X', marks: [] },
      { text: 'bold', marks: [{ type: 'bold' }] },
    ]);
  });

  it('returns normalized clone for empty insertion', () => {
    const rt: RichText = [{ text: 'abc', marks: [] }];
    expect(insertText(rt, 1, '')).toEqual([{ text: 'abc', marks: [] }]);
  });
});

describe('mapMarkdownOffsetToPlain', () => {
  it('maps offsets in plain markdown 1:1', () => {
    expect(mapMarkdownOffsetToPlain('hello', 0)).toBe(0);
    expect(mapMarkdownOffsetToPlain('hello', 3)).toBe(3);
    expect(mapMarkdownOffsetToPlain('hello', 5)).toBe(5);
  });

  it('skips bold markers', () => {
    // **ab**  → plain "ab"
    expect(mapMarkdownOffsetToPlain('**ab**', 0)).toBe(0); // before '*'
    expect(mapMarkdownOffsetToPlain('**ab**', 2)).toBe(0); // before 'a'
    expect(mapMarkdownOffsetToPlain('**ab**', 3)).toBe(1); // between a,b
    expect(mapMarkdownOffsetToPlain('**ab**', 4)).toBe(2); // after 'b'
    expect(mapMarkdownOffsetToPlain('**ab**', 6)).toBe(2); // end
  });

  it('skips link syntax, keeps label as plain', () => {
    // [text](url) → plain "text"
    const md = '[text](https://x.dev)';
    expect(mapMarkdownOffsetToPlain(md, 0)).toBe(0); // '['
    expect(mapMarkdownOffsetToPlain(md, 1)).toBe(0); // 't'
    expect(mapMarkdownOffsetToPlain(md, 5)).toBe(4); // after label
    expect(mapMarkdownOffsetToPlain(md, md.length)).toBe(4); // end
  });

  it('handles underline tags', () => {
    // <u>ab</u> → plain "ab"
    const md = '<u>ab</u>';
    expect(mapMarkdownOffsetToPlain(md, 3)).toBe(0); // before 'a'
    expect(mapMarkdownOffsetToPlain(md, 5)).toBe(2); // after 'b'
    expect(mapMarkdownOffsetToPlain(md, md.length)).toBe(2);
  });

  it('treats unclosed markers as literal text', () => {
    expect(mapMarkdownOffsetToPlain('**ab', 4)).toBe(4);
  });
});

describe('mapPlainOffsetToMarkdown', () => {
  it('round-trips through markdown offsets', () => {
    const md = '**ab**';
    expect(mapPlainOffsetToMarkdown(md, 0)).toBe(0);
    expect(mapPlainOffsetToMarkdown(md, 1)).toBe(3);
    expect(mapPlainOffsetToMarkdown(md, 2)).toBe(4);
  });

  it('clamps beyond range to markdown length', () => {
    const md = '**ab**';
    expect(mapPlainOffsetToMarkdown(md, 99)).toBe(4);
  });
});
