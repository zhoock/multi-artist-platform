import { useState } from 'react';
import { describe, test, expect, jest } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';

import { getSelectionOffsets, markdownToRichText, restoreSelection } from '@shared/lib/richText';
import { RichTextBlockEditor } from '@shared/ui/RichTextBlockEditor';

function RichHarness({ initial = 'abc' }: { initial?: string }) {
  const [content, setContent] = useState(() => markdownToRichText(initial));
  return <RichTextBlockEditor content={content} onChange={setContent} mode="rich" />;
}

describe('RichTextBlockEditor', () => {
  test('deleteContentForward keeps caret at end after deleting last character (abc| → ab|)', async () => {
    render(<RichHarness />);

    const root = await waitFor(() => screen.getByTestId('rich-text-block-editor-rich'));
    await waitFor(() => {
      expect(root.textContent).toBe('abc');
    });

    root.focus();
    restoreSelection(root, 2, 2);

    act(() => {
      root.dispatchEvent(
        new InputEvent('beforeinput', {
          inputType: 'deleteContentForward',
          bubbles: true,
          cancelable: true,
        })
      );
    });

    await waitFor(() => {
      expect(root.textContent).toBe('ab');
    });
    expect(getSelectionOffsets(root)).toEqual({ from: 2, to: 2 });
  });

  test('shows rich editor by default without mode toggles', async () => {
    render(<RichTextBlockEditor content={markdownToRichText('**abc**')} onChange={jest.fn()} />);

    expect(screen.queryByRole('button', { name: 'Markdown' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rich' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Preview' })).toBeNull();
    expect(screen.getByTestId('rich-text-block-editor-rich')).toBeTruthy();
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

  test('preview mode hides contentEditable when set via prop', () => {
    render(
      <RichTextBlockEditor
        content={markdownToRichText('abc')}
        onChange={jest.fn()}
        mode="preview"
      />
    );

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
