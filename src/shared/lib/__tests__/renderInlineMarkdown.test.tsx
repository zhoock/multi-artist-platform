import { describe, test, expect } from '@jest/globals';
import { render } from '@testing-library/react';

import { renderInlineMarkdown } from '../renderInlineMarkdown';

function html(text: string | null | undefined): string {
  const { container } = render(<div>{renderInlineMarkdown(text)}</div>);
  return (container.firstChild as HTMLElement).innerHTML;
}

describe('renderInlineMarkdown', () => {
  test('renders **bold** as <strong>', () => {
    expect(html('**Жирный**')).toBe('<strong>Жирный</strong>');
  });

  test('renders _italic_ as <em>', () => {
    expect(html('_Курсив_')).toBe('<em>Курсив</em>');
  });

  test('renders ~~strikethrough~~ as <s>', () => {
    expect(html('~~Зачёркнутый~~')).toBe('<s>Зачёркнутый</s>');
  });

  test('renders [text](url) as a safe blank link', () => {
    expect(html('[OpenAI](https://openai.com)')).toBe(
      '<a href="https://openai.com" target="_blank" rel="noopener noreferrer">OpenAI</a>'
    );
  });

  test('renders italic nested inside bold', () => {
    expect(html('**Жирный _внутри_**')).toBe('<strong>Жирный <em>внутри</em></strong>');
  });

  test('renders a link nested inside bold', () => {
    expect(html('**Жирный [со ссылкой](https://x.dev)**')).toBe(
      '<strong>Жирный <a href="https://x.dev" target="_blank" rel="noopener noreferrer">со ссылкой</a></strong>'
    );
  });

  test('leaves plain content without markdown unchanged', () => {
    expect(html('Просто текст без разметки')).toBe('Просто текст без разметки');
  });

  test('keeps unmatched markers as plain text', () => {
    expect(html('осталось 5 * 3 и _одиночное')).toBe('осталось 5 * 3 и _одиночное');
  });

  test('drops unsafe javascript: links to plain text', () => {
    expect(html('[x](javascript:alert(1))')).toBe('[x](javascript:alert(1))');
  });

  test('normalizes scheme-less external links to https', () => {
    expect(html('[site](example.com)')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">site</a>'
    );
  });
});
