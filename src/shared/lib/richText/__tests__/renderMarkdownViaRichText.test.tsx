import { describe, test, expect } from '@jest/globals';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';

import { renderInlineMarkdown } from '../../renderInlineMarkdown';
import { renderMarkdownViaRichText } from '../renderMarkdownViaRichText';
import { EMPTY_RICH_TEXT } from '../types';

/**
 * Parity: renderInlineMarkdown(markdown) ≡ renderMarkdownViaRichText(markdown)
 *
 * Сравниваем итоговую HTML-структуру (innerHTML), не ReactNode.
 */

function html(node: ReactNode): string {
  const { container } = render(<div>{node}</div>);
  return (container.firstChild as HTMLElement).innerHTML;
}

function inlineMarkdownHtml(markdown: string | null | undefined): string {
  return html(renderInlineMarkdown(markdown));
}

function bridgeHtml(markdown: string | null | undefined): string {
  return html(renderMarkdownViaRichText(markdown));
}

function expectParity(markdown: string | null | undefined): void {
  expect(bridgeHtml(markdown)).toBe(inlineMarkdownHtml(markdown));
}

describe('renderMarkdownViaRichText parity vs renderInlineMarkdown', () => {
  describe('plain', () => {
    test('hello', () => {
      expectParity('hello');
    });
  });

  describe('bold', () => {
    test('**hello**', () => {
      expectParity('**hello**');
    });
  });

  describe('italic', () => {
    test('_hello_', () => {
      expectParity('_hello_');
    });
  });

  describe('strike', () => {
    test('~~hello~~', () => {
      expectParity('~~hello~~');
    });
  });

  describe('link', () => {
    test('[text](https://example.com)', () => {
      expectParity('[text](https://example.com)');
    });
  });

  describe('nested', () => {
    test('**Жирный _внутри_**', () => {
      expectParity('**Жирный _внутри_**');
    });
  });

  describe('link inside bold', () => {
    test('**текст [ссылка](https://x.dev)**', () => {
      expectParity('**текст [ссылка](https://x.dev)**');
    });
  });

  describe('multiple runs', () => {
    test('**bold** _italic_ ~~strike~~', () => {
      expectParity('**bold** _italic_ ~~strike~~');
    });
  });

  describe('unsafe href', () => {
    test('[x](javascript:alert(1))', () => {
      expectParity('[x](javascript:alert(1))');
    });
  });

  describe('empty', () => {
    test('null', () => {
      expectParity(null);
    });

    test('undefined', () => {
      expectParity(undefined);
    });

    test("''", () => {
      expectParity('');
    });

    test('EMPTY_RICH_TEXT via empty string input', () => {
      expect(html(renderMarkdownViaRichText(''))).toBe('');
      expect(inlineMarkdownHtml('')).toBe('');
    });
  });

  describe('by-design gaps — block ArticlePage swap until resolved', () => {
    test.failing('underline (<u>x</u>) — legacy renderer does not parse <u>', () => {
      expectParity('<u>x</u>');
    });

    test.failing('canonical order (_**x**_) — legacy <em><strong>, RichText <strong><em>', () => {
      expectParity('_**x**_');
    });
  });
});
