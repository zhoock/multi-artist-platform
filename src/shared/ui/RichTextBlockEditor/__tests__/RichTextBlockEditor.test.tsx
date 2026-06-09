import { describe, test, expect, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import { markdownToRichText } from '@shared/lib/richText';
import { RichTextBlockEditor } from '@shared/ui/RichTextBlockEditor';

describe('RichTextBlockEditor', () => {
  test('shows textarea by default and preview after toggle', () => {
    render(<RichTextBlockEditor content={markdownToRichText('**abc**')} onChange={jest.fn()} />);

    expect(screen.getByRole('textbox')).toBeTruthy();
    expect(screen.queryByTestId('rich-text-block-editor-preview')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(screen.queryByRole('textbox')).toBeNull();
    const preview = screen.getByTestId('rich-text-block-editor-preview');
    expect(preview.querySelector('strong')?.textContent).toBe('abc');
  });

  test('renders bold in preview', () => {
    render(
      <RichTextBlockEditor
        content={markdownToRichText('**abc**')}
        onChange={jest.fn()}
        mode="preview"
      />
    );

    const preview = screen.getByTestId('rich-text-block-editor-preview');
    expect(preview.innerHTML).toBe('<strong>abc</strong>');
  });

  test('renders nested bold+italic in preview', () => {
    render(
      <RichTextBlockEditor
        content={markdownToRichText('**_abc_**')}
        onChange={jest.fn()}
        mode="preview"
      />
    );

    const preview = screen.getByTestId('rich-text-block-editor-preview');
    expect(preview.innerHTML).toBe('<strong><em>abc</em></strong>');
  });

  test('renders link in preview', () => {
    render(
      <RichTextBlockEditor
        content={markdownToRichText('[OpenAI](https://openai.com)')}
        onChange={jest.fn()}
        mode="preview"
      />
    );

    const link = screen.getByRole('link', { name: 'OpenAI' });
    expect(link.getAttribute('href')).toBe('https://openai.com');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  test('renders strike in preview', () => {
    render(
      <RichTextBlockEditor
        content={markdownToRichText('~~abc~~')}
        onChange={jest.fn()}
        mode="preview"
      />
    );

    const preview = screen.getByTestId('rich-text-block-editor-preview');
    expect(preview.querySelector('s')?.textContent).toBe('abc');
  });

  test('rich mode renders contentEditable with rendered RichText', () => {
    render(
      <RichTextBlockEditor
        content={markdownToRichText('**_abc_**')}
        onChange={jest.fn()}
        mode="rich"
      />
    );

    const rich = screen.getByTestId('rich-text-block-editor-rich');
    expect(rich.getAttribute('contenteditable')).toBe('true');
    expect(rich.innerHTML).toBe('<strong><em>abc</em></strong>');
  });

  test('switching to rich mode swaps textarea for contentEditable', () => {
    render(<RichTextBlockEditor content={markdownToRichText('abc')} onChange={jest.fn()} />);

    expect(screen.getByRole('textbox')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Rich' }));
    expect(screen.getByTestId('rich-text-block-editor-rich')).toBeTruthy();
  });
});
