import { describe, test, expect } from '@jest/globals';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';

import { renderInlineMarkdown } from '../../renderInlineMarkdown';
import { markdownToRichText } from '../markdownAdapter';
import { renderRichText } from '../renderRichText';
import { EMPTY_RICH_TEXT } from '../types';

/**
 * Parity: renderInlineMarkdown(markdown) ≡ renderRichText(markdownToRichText(markdown))
 *
 * Сравниваем итоговую HTML-структуру (innerHTML), а не ReactNode. Кейсы в
 * describe('known gaps') красные (test.failing) — интеграцию renderRichText
 * в ArticlePage не начинаем, пока они не закрыты.
 */

function html(node: ReactNode): string {
  const { container } = render(<div>{node}</div>);
  return (container.firstChild as HTMLElement).innerHTML;
}

function inlineMarkdownHtml(markdown: string | null | undefined): string {
  return html(renderInlineMarkdown(markdown));
}

function richTextPipelineHtml(markdown: string | null | undefined): string {
  return html(renderRichText(markdownToRichText(markdown)));
}

function expectParity(markdown: string | null | undefined): void {
  expect(richTextPipelineHtml(markdown)).toBe(inlineMarkdownHtml(markdown));
}

describe('render parity: renderInlineMarkdown ≡ renderRichText ∘ markdownToRichText', () => {
  describe('plain text', () => {
    test('plain text without markdown', () => {
      expectParity('Просто текст без разметки');
    });

    test('unmatched markers stay literal', () => {
      expectParity('осталось 5 * 3 и _одиночное');
    });
  });

  describe('single marks', () => {
    test('bold', () => {
      expectParity('**Жирный**');
    });

    test('italic', () => {
      expectParity('_Курсив_');
    });

    test('strike', () => {
      expectParity('~~Зачёркнутый~~');
    });

    test('link', () => {
      expectParity('[OpenAI](https://openai.com)');
    });

    test('scheme-less link normalized to https', () => {
      expectParity('[site](example.com)');
    });
  });

  describe('nested marks (render-tree grouping)', () => {
    test('italic nested inside bold (**Жирный _внутри_**)', () => {
      expectParity('**Жирный _внутри_**');
    });
  });

  describe('link + bold', () => {
    test('bold link label ([**text**](url))', () => {
      expectParity('[**жирная ссылка**](https://x.dev)');
    });

    test('link nested inside bold markdown (**…[link](url)…**)', () => {
      expectParity('**Жирный [со ссылкой](https://x.dev)**');
    });
  });

  describe('multi-run marks', () => {
    test('mixed bold, italic and strike in one string (sibling runs, no nesting)', () => {
      expectParity('смешанный **bold** и _italic_ и ~~strike~~');
    });
  });

  describe('unsafe href', () => {
    test('javascript: link stays literal text', () => {
      expectParity('[x](javascript:alert(1))');
    });
  });

  describe('empty cases', () => {
    test('null', () => {
      expectParity(null);
    });

    test('undefined', () => {
      expectParity(undefined);
    });

    test('empty string', () => {
      expectParity('');
    });

    test('EMPTY_RICH_TEXT via adapter matches empty-string inline output', () => {
      expect(html(renderRichText(EMPTY_RICH_TEXT))).toBe('');
      expect(inlineMarkdownHtml('')).toBe('');
    });
  });

  describe('mark order canonicalization', () => {
    test('canonical markdown (**_x_**) has parity', () => {
      expectParity('**_x_**');
    });

    test('non-canonical markdown (_**x**_) canonicalizes to MARK_RENDER_ORDER HTML on read', () => {
      expect(richTextPipelineHtml('_**x**_')).toBe(inlineMarkdownHtml('**_x_**'));
    });
  });

  describe('known gaps — block ArticlePage integration until resolved', () => {
    /**
     * renderInlineMarkdown не парсит <u>…</u> — отдаёт экранированный литерал.
     * Новый pipeline рендерит настоящий <u>. Нужен парсер underline в legacy renderer
     * или dual-render только для marks, которые редактор реально пишет.
     */
    test.failing('underline (<u>…</u>)', () => {
      expectParity('<u>Подчёркнутый</u>');
    });

    /**
     * Legacy: <em><strong>x</strong></em> (_**x**_) — одиночный run, группировка
     * дерева не применяется. RichText канонизирует по MARK_RENDER_ORDER →
     * <strong><em>x</em></strong>. Намеренное расхождение канонизации.
     */
    test.failing('non-canonical markdown order (_**x**_)', () => {
      expectParity('_**x**_');
    });
  });
});
