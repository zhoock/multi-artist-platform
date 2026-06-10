import { useState } from 'react';
import { describe, test, expect, jest } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';

import {
  getSelectionOffsets,
  markdownToRichText,
  restoreSelection,
  richTextToPlainText,
} from '@shared/lib/richText';
import type { RichText } from '@shared/lib/richText';
import { RichTextBlockEditor } from '@shared/ui/RichTextBlockEditor';

function RichHarness({ initial = 'abc' }: { initial?: string }) {
  const [content, setContent] = useState(() => markdownToRichText(initial));
  return <RichTextBlockEditor content={content} onChange={setContent} mode="rich" />;
}

function dispatchShiftEnter(root: HTMLElement): void {
  root.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Enter',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
  );
  root.dispatchEvent(
    new InputEvent('beforeinput', {
      inputType: 'insertLineBreak',
      bubbles: true,
      cancelable: true,
    })
  );
  root.dispatchEvent(
    new InputEvent('beforeinput', {
      inputType: 'insertParagraph',
      bubbles: true,
      cancelable: true,
    })
  );
}

function MultilineHarness() {
  const [content, setContent] = useState<RichText>(() => [{ text: 'abc\ndef', marks: [] }]);
  return <RichTextBlockEditor content={content} onChange={setContent} mode="rich" />;
}

function dispatchBackspace(root: HTMLElement): void {
  root.dispatchEvent(
    new InputEvent('beforeinput', {
      inputType: 'deleteContentBackward',
      bubbles: true,
      cancelable: true,
    })
  );
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

  test('Shift+Enter inserts soft line break on first keydown (abc| → abc\\n|)', async () => {
    render(<RichHarness initial="abc" />);

    const root = await waitFor(() => screen.getByTestId('rich-text-block-editor-rich'));
    await waitFor(() => {
      expect(root.textContent).toBe('abc');
    });

    root.focus();
    restoreSelection(root, 3, 3);

    act(() => {
      dispatchShiftEnter(root);
    });

    // Настоящий <br> + sentinel: иначе contentEditable не показывает каретку на новой строке.
    await waitFor(() => {
      expect(root.querySelectorAll('br').length).toBe(2);
    });
    expect(root.querySelector('br[data-rich-trailing]')).toBeTruthy();
    expect(getSelectionOffsets(root)).toEqual({ from: 4, to: 4 });

    // Каретка стоит между настоящим <br> и sentinel — браузер рисует её на новой строке.
    const selection = window.getSelection()!;
    const range = selection.getRangeAt(0);
    expect(range.startContainer).toBe(root);
    expect(range.startOffset).toBe(2);
  });

  test('Shift+Enter is not reverted when parent props lag behind optimistic DOM sync', async () => {
    let latestContent: RichText = markdownToRichText('abc');
    const onChange = jest.fn((next: RichText) => {
      latestContent = next;
    });

    const { rerender } = render(
      <RichTextBlockEditor content={latestContent} onChange={onChange} mode="rich" />
    );

    const root = await waitFor(() => screen.getByTestId('rich-text-block-editor-rich'));
    root.focus();
    restoreSelection(root, 3, 3);

    act(() => {
      dispatchShiftEnter(root);
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(richTextToPlainText(latestContent)).toBe('abc\n');
    expect(root.querySelector('br')).toBeTruthy();
    expect(getSelectionOffsets(root)).toEqual({ from: 4, to: 4 });

    act(() => {
      rerender(
        <RichTextBlockEditor content={markdownToRichText('abc')} onChange={onChange} mode="rich" />
      );
    });

    expect(root.querySelector('br')).toBeTruthy();
    expect(getSelectionOffsets(root)).toEqual({ from: 4, to: 4 });

    act(() => {
      rerender(<RichTextBlockEditor content={latestContent} onChange={onChange} mode="rich" />);
    });

    expect(root.querySelector('br')).toBeTruthy();
    expect(getSelectionOffsets(root)).toEqual({ from: 4, to: 4 });
  });

  test('Enter at end of multiline block requests new block without splitting (abc\\ndef| → new block)', async () => {
    const onRichEnter = jest.fn();
    const onChange = jest.fn();
    const content: RichText = [{ text: 'abc\ndef', marks: [] }];

    render(
      <RichTextBlockEditor
        content={content}
        onChange={onChange}
        onRichEnter={onRichEnter}
        mode="rich"
      />
    );

    const root = await waitFor(() => screen.getByTestId('rich-text-block-editor-rich'));
    await waitFor(() => {
      expect(root.querySelectorAll('br').length).toBe(1);
    });

    root.focus();
    restoreSelection(root, 7, 7);

    act(() => {
      root.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          shiftKey: false,
          bubbles: true,
          cancelable: true,
        })
      );
    });

    expect(onRichEnter).toHaveBeenCalledWith({ atEnd: true, offset: 7 });
    expect(onChange).not.toHaveBeenCalled();
    expect(richTextToPlainText(content)).toBe('abc\ndef');
  });

  test('deleteContentBackward after newline removes each character (abc\\ndef| Backspace×3 → abc\\n|)', async () => {
    render(<MultilineHarness />);

    const root = await waitFor(() => screen.getByTestId('rich-text-block-editor-rich'));
    await waitFor(() => {
      expect(root.querySelector('br')).toBeTruthy();
    });

    root.focus();
    restoreSelection(root, 7, 7);
    expect(getSelectionOffsets(root)).toEqual({ from: 7, to: 7 });

    act(() => {
      dispatchBackspace(root);
    });
    await waitFor(() => {
      expect(getSelectionOffsets(root)).toEqual({ from: 6, to: 6 });
    });

    act(() => {
      dispatchBackspace(root);
    });
    await waitFor(() => {
      expect(getSelectionOffsets(root)).toEqual({ from: 5, to: 5 });
    });

    act(() => {
      dispatchBackspace(root);
    });
    await waitFor(() => {
      expect(getSelectionOffsets(root)).toEqual({ from: 4, to: 4 });
    });
    expect(root.querySelector('br[data-rich-trailing]')).toBeTruthy();
  });
});
