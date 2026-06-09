import { useEffect, useRef, useState } from 'react';

import { markdownToRichText, richTextToMarkdown } from './markdownAdapter';
import type { RichText } from './types';

/**
 * Локальный markdown-буфер поверх канонической RichText-модели (вариант B).
 *
 * Source of truth — `content: RichText` в родителе. Textarea редактирует
 * локальную markdown-строку и на каждый ввод эмитит `markdownToRichText(buffer)`
 * наверх. Value textarea НЕ перевычисляется из content на каждом рендере, иначе
 * round-trip канонизировал бы ввод (`_**x**_` → `**_x_**`) и каретка прыгала бы.
 *
 * Resync буфера из content происходит только на внешние изменения
 * (load / undo-redo / split / merge / смена типа блока): такое изменение даёт
 * канонический markdown, отличный от того, что буфер только что эмитил.
 * Собственное эхо (родитель вернул наш же ввод) распознаётся по совпадению
 * канонического markdown и игнорируется.
 */
export function useLocalMarkdownBuffer(
  content: RichText,
  onChange: (content: RichText) => void
): { localMarkdown: string; handleChange: (nextMarkdown: string) => void } {
  const [localMarkdown, setLocalMarkdown] = useState(() => richTextToMarkdown(content));
  const lastEmittedCanonicalRef = useRef<string>(richTextToMarkdown(content));

  useEffect(() => {
    const incoming = richTextToMarkdown(content);
    if (incoming === lastEmittedCanonicalRef.current) return; // эхо собственного ввода
    setLocalMarkdown(incoming);
    lastEmittedCanonicalRef.current = incoming;
  }, [content]);

  const handleChange = (nextMarkdown: string) => {
    setLocalMarkdown(nextMarkdown);
    const nextContent = markdownToRichText(nextMarkdown);
    lastEmittedCanonicalRef.current = richTextToMarkdown(nextContent);
    onChange(nextContent);
  };

  return { localMarkdown, handleChange };
}
