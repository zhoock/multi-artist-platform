import { describe, test, expect } from '@jest/globals';

import { markdownToRichText, richTextToMarkdown } from '../markdownAdapter';
import { EMPTY_RICH_TEXT, type RichText } from '../types';

describe('markdownToRichText', () => {
  test('parses plain text into a single unmarked run', () => {
    expect(markdownToRichText('Просто текст')).toEqual([{ text: 'Просто текст', marks: [] }]);
  });

  test('parses **bold**', () => {
    expect(markdownToRichText('**Жирный**')).toEqual([
      { text: 'Жирный', marks: [{ type: 'bold' }] },
    ]);
  });

  test('parses _italic_', () => {
    expect(markdownToRichText('_Курсив_')).toEqual([
      { text: 'Курсив', marks: [{ type: 'italic' }] },
    ]);
  });

  test('parses ~~strike~~', () => {
    expect(markdownToRichText('~~Зачёркнутый~~')).toEqual([
      { text: 'Зачёркнутый', marks: [{ type: 'strike' }] },
    ]);
  });

  test('parses <u>underline</u>', () => {
    expect(markdownToRichText('<u>Подчёркнутый</u>')).toEqual([
      { text: 'Подчёркнутый', marks: [{ type: 'underline' }] },
    ]);
  });

  test('parses a link, keeping raw href', () => {
    expect(markdownToRichText('[OpenAI](https://openai.com)')).toEqual([
      { text: 'OpenAI', marks: [{ type: 'link', href: 'https://openai.com' }] },
    ]);
  });

  test('parses nested bold + italic into a run with both marks', () => {
    expect(markdownToRichText('**Жирный _внутри_**')).toEqual([
      { text: 'Жирный ', marks: [{ type: 'bold' }] },
      { text: 'внутри', marks: [{ type: 'bold' }, { type: 'italic' }] },
    ]);
  });

  test('parses a link wrapping bold', () => {
    expect(markdownToRichText('[**жирная ссылка**](https://x.dev)')).toEqual([
      { text: 'жирная ссылка', marks: [{ type: 'link', href: 'https://x.dev' }, { type: 'bold' }] },
    ]);
  });

  test('keeps unsafe javascript: links as literal text', () => {
    expect(markdownToRichText('[x](javascript:alert(1))')).toEqual([
      { text: '[x](javascript:alert(1))', marks: [] },
    ]);
  });

  test('keeps unmatched markers as plain text', () => {
    expect(markdownToRichText('осталось 5 * 3 и _одиночное')).toEqual([
      { text: 'осталось 5 * 3 и _одиночное', marks: [] },
    ]);
  });

  test('empty string maps to EMPTY_RICH_TEXT', () => {
    expect(markdownToRichText('')).toEqual(EMPTY_RICH_TEXT);
  });

  test('null/undefined map to EMPTY_RICH_TEXT', () => {
    expect(markdownToRichText(null)).toEqual(EMPTY_RICH_TEXT);
    expect(markdownToRichText(undefined)).toEqual(EMPTY_RICH_TEXT);
  });
});

describe('richTextToMarkdown', () => {
  test('serializes a plain run', () => {
    expect(richTextToMarkdown([{ text: 'Просто текст', marks: [] }])).toBe('Просто текст');
  });

  test('serializes bold/italic/strike/underline', () => {
    expect(richTextToMarkdown([{ text: 'x', marks: [{ type: 'bold' }] }])).toBe('**x**');
    expect(richTextToMarkdown([{ text: 'x', marks: [{ type: 'italic' }] }])).toBe('_x_');
    expect(richTextToMarkdown([{ text: 'x', marks: [{ type: 'strike' }] }])).toBe('~~x~~');
    expect(richTextToMarkdown([{ text: 'x', marks: [{ type: 'underline' }] }])).toBe('<u>x</u>');
  });

  test('serializes a link', () => {
    expect(
      richTextToMarkdown([
        { text: 'OpenAI', marks: [{ type: 'link', href: 'https://openai.com' }] },
      ])
    ).toBe('[OpenAI](https://openai.com)');
  });

  test('canonicalizes marks order to MARK_RENDER_ORDER regardless of input order', () => {
    const boldFirst = richTextToMarkdown([
      { text: 'x', marks: [{ type: 'bold' }, { type: 'italic' }] },
    ]);
    const italicFirst = richTextToMarkdown([
      { text: 'x', marks: [{ type: 'italic' }, { type: 'bold' }] },
    ]);
    expect(boldFirst).toBe('**_x_**');
    expect(italicFirst).toBe('**_x_**');
  });

  test('link is the outermost wrapper', () => {
    expect(
      richTextToMarkdown([
        { text: 'x', marks: [{ type: 'bold' }, { type: 'link', href: 'https://x.dev' }] },
      ])
    ).toBe('[**x**](https://x.dev)');
  });

  test('groups consecutive runs sharing a link href into one link', () => {
    const rt: RichText = [
      { text: 'жирная ', marks: [{ type: 'link', href: 'https://x.dev' }, { type: 'bold' }] },
      { text: 'ссылка', marks: [{ type: 'link', href: 'https://x.dev' }] },
    ];
    expect(richTextToMarkdown(rt)).toBe('[**жирная **ссылка](https://x.dev)');
  });

  test('skips empty-text runs without emitting bare delimiters', () => {
    expect(richTextToMarkdown([{ text: '', marks: [{ type: 'bold' }] }])).toBe('');
  });

  test('does not serialize reserved marks (code), keeps inner text', () => {
    expect(richTextToMarkdown([{ text: 'x', marks: [{ type: 'code' }] }])).toBe('x');
  });

  test('empty / null / undefined / EMPTY_RICH_TEXT serialize to empty string', () => {
    expect(richTextToMarkdown([])).toBe('');
    expect(richTextToMarkdown(null)).toBe('');
    expect(richTextToMarkdown(undefined)).toBe('');
    expect(richTextToMarkdown(EMPTY_RICH_TEXT)).toBe('');
  });
});

describe('round-trip stability', () => {
  const cases = [
    'Просто текст',
    '**Жирный**',
    '_Курсив_',
    '~~Зачёркнутый~~',
    '<u>Подчёркнутый</u>',
    '[OpenAI](https://openai.com)',
    '**Жирный _внутри_**',
    '[**жирная ссылка**](https://x.dev)',
    'смешанный **bold** и _italic_ и ~~strike~~',
    'осталось 5 * 3 и _одиночное',
    '[x](javascript:alert(1))',
  ];

  test.each(cases)('markdown → RichText → markdown is identical for %p', (md) => {
    expect(richTextToMarkdown(markdownToRichText(md))).toBe(md);
  });

  test.each(cases)('the transform is idempotent for %p', (md) => {
    const once = richTextToMarkdown(markdownToRichText(md));
    const twice = richTextToMarkdown(markdownToRichText(once));
    expect(twice).toBe(once);
  });

  test('canonicalizes non-canonical mark order on first pass, then stays stable', () => {
    const once = richTextToMarkdown(markdownToRichText('_**x**_'));
    expect(once).toBe('**_x_**');
    expect(richTextToMarkdown(markdownToRichText(once))).toBe(once);
  });
});
