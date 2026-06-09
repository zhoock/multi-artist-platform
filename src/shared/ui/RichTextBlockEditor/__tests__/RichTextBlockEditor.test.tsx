import { describe, test, expect, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { markdownToRichText } from '@shared/lib/richText';
import { RichTextBlockEditor } from '@shared/ui/RichTextBlockEditor';

describe('RichTextBlockEditor', () => {
  test('shows rich editor by default with Rich and Preview mode toggles', async () => {
    render(<RichTextBlockEditor content={markdownToRichText('**abc**')} onChange={jest.fn()} />);

    expect(screen.queryByRole('button', { name: 'Markdown' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Rich' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeTruthy();
    expect(screen.getByTestId('rich-text-block-editor-rich')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(screen.queryByTestId('rich-text-block-editor-rich')).toBeNull();
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

  test('rich mode renders contentEditable with rendered RichText', async () => {
    render(
      <RichTextBlockEditor
        content={markdownToRichText('**_abc_**')}
        onChange={jest.fn()}
        mode="rich"
      />
    );

    const rich = screen.getByTestId('rich-text-block-editor-rich');
    expect(rich.getAttribute('contenteditable')).toBe('true');
    await waitFor(() => {
      expect(rich.innerHTML).toBe('<strong><em>abc</em></strong>');
    });
  });

  test('switching to preview mode hides contentEditable', () => {
    render(<RichTextBlockEditor content={markdownToRichText('abc')} onChange={jest.fn()} />);

    expect(screen.getByTestId('rich-text-block-editor-rich')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.queryByTestId('rich-text-block-editor-rich')).toBeNull();
    expect(screen.getByTestId('rich-text-block-editor-preview')).toBeTruthy();
  });

  test('applies variant-specific block class on rich surface', async () => {
    render(
      <RichTextBlockEditor
        content={markdownToRichText('Title')}
        onChange={jest.fn()}
        variant="title"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('rich-text-block-editor-rich').className).toContain(
        'edit-article-v2__block--title'
      );
    });
  });

  test('applies list-item variant class on rich surface', async () => {
    render(
      <RichTextBlockEditor
        content={markdownToRichText('Item')}
        onChange={jest.fn()}
        variant="list-item"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('rich-text-block-editor-rich').className).toContain(
        'edit-article-v2__block'
      );
    });
  });
});
