import { describe, test, expect } from '@jest/globals';
import { render } from '@testing-library/react';

import { renderRichText } from '../renderRichText';
import { EMPTY_RICH_TEXT, type RichText } from '../types';

function html(richText: RichText | null | undefined): string {
  const { container } = render(<div>{renderRichText(richText)}</div>);
  return (container.firstChild as HTMLElement).innerHTML;
}

describe('renderRichText', () => {
  test('renders bold mark as <strong>', () => {
    expect(html([{ text: 'Жирный', marks: [{ type: 'bold' }] }])).toBe('<strong>Жирный</strong>');
  });

  test('renders italic mark as <em>', () => {
    expect(html([{ text: 'Курсив', marks: [{ type: 'italic' }] }])).toBe('<em>Курсив</em>');
  });

  test('renders strike mark as <s>', () => {
    expect(html([{ text: 'Зачёркнутый', marks: [{ type: 'strike' }] }])).toBe('<s>Зачёркнутый</s>');
  });

  test('renders underline mark as <u>', () => {
    expect(html([{ text: 'Подчёркнутый', marks: [{ type: 'underline' }] }])).toBe(
      '<u>Подчёркнутый</u>'
    );
  });

  test('renders link mark as a safe blank link', () => {
    expect(html([{ text: 'OpenAI', marks: [{ type: 'link', href: 'https://openai.com' }] }])).toBe(
      '<a href="https://openai.com" target="_blank" rel="noopener noreferrer">OpenAI</a>'
    );
  });

  test('renders bold+italic as <strong><em>...</em></strong> regardless of marks order', () => {
    const boldFirst = html([{ text: 'Hello', marks: [{ type: 'bold' }, { type: 'italic' }] }]);
    const italicFirst = html([{ text: 'Hello', marks: [{ type: 'italic' }, { type: 'bold' }] }]);
    expect(boldFirst).toBe('<strong><em>Hello</em></strong>');
    expect(italicFirst).toBe('<strong><em>Hello</em></strong>');
  });

  test('renders link as outermost wrapper around bold', () => {
    expect(
      html([
        {
          text: 'OpenAI',
          marks: [{ type: 'bold' }, { type: 'link', href: 'https://openai.com' }],
        },
      ])
    ).toBe(
      '<a href="https://openai.com" target="_blank" rel="noopener noreferrer"><strong>OpenAI</strong></a>'
    );
  });

  test('drops unsafe href and keeps remaining marks + text', () => {
    expect(
      html([
        {
          text: 'опасно',
          marks: [{ type: 'bold' }, { type: 'link', href: 'javascript:alert(1)' }],
        },
      ])
    ).toBe('<strong>опасно</strong>');
  });

  test('normalizes scheme-less link href to https', () => {
    expect(html([{ text: 'site', marks: [{ type: 'link', href: 'example.com' }] }])).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">site</a>'
    );
  });

  test('renders plain run without marks as text', () => {
    expect(html([{ text: 'Просто текст', marks: [] }])).toBe('Просто текст');
  });

  test('concatenates multiple runs as siblings', () => {
    expect(
      html([
        { text: 'Жирный ', marks: [{ type: 'bold' }] },
        { text: 'обычный', marks: [] },
      ])
    ).toBe('<strong>Жирный </strong>обычный');
  });

  test('returns null for null input', () => {
    expect(renderRichText(null)).toBeNull();
  });

  test('returns null for undefined input', () => {
    expect(renderRichText(undefined)).toBeNull();
  });

  test('returns null for empty array', () => {
    expect(renderRichText([])).toBeNull();
  });

  test('returns null for EMPTY_RICH_TEXT', () => {
    expect(renderRichText(EMPTY_RICH_TEXT)).toBeNull();
  });

  test('returns null when all runs are empty strings', () => {
    expect(renderRichText([{ text: '', marks: [{ type: 'bold' }] }])).toBeNull();
  });

  test('preserves newline characters as <br> elements', () => {
    expect(html([{ text: 'abc\ndef', marks: [] }])).toBe('abc<br>def');
  });

  test('trailing newline gets a sentinel <br> so the caret can render on the new line', () => {
    expect(html([{ text: 'abc\n', marks: [] }])).toBe('abc<br><br data-rich-trailing="true">');
  });
});
