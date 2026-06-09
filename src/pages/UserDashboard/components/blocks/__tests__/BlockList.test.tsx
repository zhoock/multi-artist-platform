import { describe, test, expect, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import React, { useState } from 'react';

jest.mock('@shared/lib/richText', () => {
  const actual = jest.requireActual('@shared/lib/richText') as Record<string, unknown>;
  return {
    ...actual,
    getDefaultEditorMode: () => 'textarea',
    isMarkdownEditorEnabled: () => true,
  };
});

import { markdownToRichText, richTextToPlainText, type RichText } from '@shared/lib/richText';
import { createListItem } from '../../modals/article/EditArticleModalV2.utils';
import { BlockList } from '../BlockList';

function BlockListHarness({
  initialItems,
  onConvertToParagraph = jest.fn(),
  onInsertParagraphAfter = jest.fn(),
}: {
  initialItems: ReturnType<typeof createListItem>[];
  onConvertToParagraph?: (content: RichText) => void;
  onInsertParagraphAfter?: () => void;
}) {
  const [items, setItems] = useState(initialItems);

  return (
    <BlockList
      blockId="list-block"
      value={items}
      onChange={setItems}
      onConvertToParagraph={onConvertToParagraph}
      onInsertParagraphAfter={onInsertParagraphAfter}
    />
  );
}

describe('BlockList', () => {
  test('Enter at end of item inserts a new list item', () => {
    render(<BlockListHarness initialItems={[createListItem('hello')]} />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(5, 5);
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

    expect(screen.getAllByRole('textbox')).toHaveLength(2);
  });

  test('Enter on empty item with multiple items exits list and inserts paragraph after', () => {
    const onInsertParagraphAfter = jest.fn();
    render(
      <BlockListHarness
        initialItems={[createListItem('first'), createListItem('')]}
        onInsertParagraphAfter={onInsertParagraphAfter}
      />
    );

    const textareas = screen.getAllByRole('textbox') as HTMLTextAreaElement[];
    const emptyItem = textareas[1];
    emptyItem.focus();
    fireEvent.keyDown(emptyItem, { key: 'Enter', code: 'Enter' });

    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(onInsertParagraphAfter).toHaveBeenCalledTimes(1);
  });

  test('Enter on empty single item converts list to paragraph', () => {
    const onConvertToParagraph = jest.fn();
    render(
      <BlockListHarness
        initialItems={[createListItem('')]}
        onConvertToParagraph={onConvertToParagraph}
      />
    );

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.focus();
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

    expect(onConvertToParagraph).toHaveBeenCalledTimes(1);
  });

  test('Backspace on empty first item converts merged list content to paragraph', () => {
    const onConvertToParagraph = jest.fn();
    render(
      <BlockListHarness
        initialItems={[createListItem(''), createListItem('second')]}
        onConvertToParagraph={onConvertToParagraph}
      />
    );

    const textareas = screen.getAllByRole('textbox') as HTMLTextAreaElement[];
    textareas[0].focus();
    fireEvent.keyDown(textareas[0], { key: 'Backspace', code: 'Backspace' });

    expect(onConvertToParagraph).toHaveBeenCalledTimes(1);
    expect(richTextToPlainText(onConvertToParagraph.mock.calls[0][0] as RichText)).toBe('second');
  });

  test('Backspace on empty non-first item merges with previous item', () => {
    render(<BlockListHarness initialItems={[createListItem('first'), createListItem('')]} />);

    const textareas = screen.getAllByRole('textbox') as HTMLTextAreaElement[];
    textareas[1].focus();
    fireEvent.keyDown(textareas[1], { key: 'Backspace', code: 'Backspace' });

    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('first');
  });
});
