// src/pages/UserDashboard/components/blocks/BlockList.tsx
import React, { useRef, useEffect } from 'react';
import type { RichText } from '@shared/lib/richText';
import { isRichTextEmpty } from '@shared/lib/richText';
import { createListItem, type ArticleListItem } from '../modals/article/EditArticleModalV2.utils';
import { useLocalMarkdownBuffer } from './useLocalMarkdownBuffer';

interface BlockListProps {
  value: ArticleListItem[];
  onChange: (items: ArticleListItem[]) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onBackspace?: (isEmpty: boolean, atStart?: boolean) => void;
}

export function BlockList({ value, onChange, onFocus, onBlur, onBackspace }: BlockListProps) {
  const items = value.length > 0 ? value : [createListItem('')];

  const handleItemChange = (index: number, content: RichText) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], content };
    onChange(newItems.filter((item) => !isRichTextEmpty(item.content)));
  };

  const handleItemKeyDown = (index: number, e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const newItems = [...items];
      newItems.splice(index + 1, 0, createListItem(''));
      onChange(newItems);
      setTimeout(() => {
        const nextInput = document.querySelector(
          `.edit-article-v2__block--list-item:nth-child(${index + 2}) textarea`
        ) as HTMLTextAreaElement;
        nextInput?.focus();
      }, 0);
    } else if (e.key === 'Backspace') {
      const textarea = e.currentTarget;
      if (textarea.value === '' && items.length > 1) {
        e.preventDefault();
        const newItems = items.filter((_, i) => i !== index);
        onChange(newItems);
        if (index > 0) {
          setTimeout(() => {
            const prevInput = document.querySelector(
              `.edit-article-v2__block--list-item:nth-child(${index}) textarea`
            ) as HTMLTextAreaElement;
            prevInput?.focus();
          }, 0);
        } else {
          onBackspace?.(newItems.length === 0, false);
        }
      } else if (textarea.value === '' && items.length === 1) {
        e.preventDefault();
        onBackspace?.(true, false);
      }
    }
  };

  return (
    <ul className="edit-article-v2__block edit-article-v2__block--list">
      {items.map((item, index) => (
        <ListItem
          key={item.id}
          value={item.content}
          onChange={(content) => handleItemChange(index, content)}
          onKeyDown={(e) => handleItemKeyDown(index, e)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={`Элемент ${index + 1}`}
        />
      ))}
    </ul>
  );
}

interface ListItemProps {
  value: RichText;
  onChange: (content: RichText) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
}

function ListItem({ value, onChange, onKeyDown, onFocus, onBlur, placeholder }: ListItemProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { localMarkdown, handleChange } = useLocalMarkdownBuffer(value, onChange);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [localMarkdown]);

  return (
    <li className="edit-article-v2__block--list-item">
      <textarea
        ref={textareaRef}
        className="edit-article-v2__block"
        value={localMarkdown}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={1}
      />
    </li>
  );
}
