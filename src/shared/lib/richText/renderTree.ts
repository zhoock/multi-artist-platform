// src/shared/lib/richText/renderTree.ts
import { markRenderOrderIndex } from './markOrder';
import type { InlineMark, RichTextNode } from './types';

/**
 * Промежуточное render-дерево (AST), которое строится из flat-run storage
 * только на этапе рендера. Storage (RichTextNode[]) не меняется.
 *
 * Аналог inline-AST в markdown / Slate / Lexical: соседние runs с общей внешней
 * mark группируются в один узел-обёртку, а не рендерятся независимо.
 *
 *   RichTextNode[] → groupRuns() → RenderNode[] → renderTreeToReact() → ReactNode
 *
 * Алгоритм повторяет принцип markdownAdapter.emit(): на каждом уровне берётся
 * самая внешняя (по MARK_RENDER_ORDER) ещё не применённая mark первого run
 * сегмента, сегмент расширяется вправо на все соседние runs с той же mark,
 * и содержимое группируется рекурсивно. Дублирование с emit() намеренное
 * (общий рефактор вне рамок этого этапа).
 */
export type RenderNode =
  | { kind: 'text'; text: string }
  | { kind: 'mark'; mark: InlineMark; children: RenderNode[] };

/**
 * Идентичность mark для группировки: учитывает payload (href/id/tag), чтобы
 * разные ссылки/упоминания/хэштеги не сливались в одну обёртку.
 */
function markIdentity(mark: InlineMark): string {
  switch (mark.type) {
    case 'link':
      return `link:${mark.href}`;
    case 'mention':
      return `mention:${mark.id}:${mark.label ?? ''}`;
    case 'hashtag':
      return `hashtag:${mark.tag}`;
    default:
      return mark.type;
  }
}

/** Индекс самой внешней (по MARK_RENDER_ORDER) ещё не применённой mark в run. */
function outermostMarkIndex(marks: InlineMark[], active: Set<string>): number {
  let bestIndex = -1;
  let bestOrder = -1;
  marks.forEach((mark, index) => {
    if (active.has(markIdentity(mark))) return;
    const order = markRenderOrderIndex(mark.type);
    if (order > bestOrder) {
      bestOrder = order;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function group(runs: RichTextNode[], active: Set<string>): RenderNode[] {
  const result: RenderNode[] = [];
  let i = 0;

  while (i < runs.length) {
    const markIndex = outermostMarkIndex(runs[i].marks, active);

    if (markIndex === -1) {
      if (runs[i].text !== '') {
        result.push({ kind: 'text', text: runs[i].text });
      }
      i += 1;
      continue;
    }

    const mark = runs[i].marks[markIndex];
    const key = markIdentity(mark);

    let j = i;
    while (j < runs.length && runs[j].marks.some((m) => markIdentity(m) === key)) {
      j += 1;
    }

    const nextActive = new Set(active);
    nextActive.add(key);
    result.push({
      kind: 'mark',
      mark,
      children: group(runs.slice(i, j), nextActive),
    });
    i = j;
  }

  return result;
}

/**
 * Строит render-дерево из flat-runs. Pure, без React/JSX.
 * Пустые runs (text === '') отбрасываются до группировки (как в renderRichText
 * и richTextToMarkdown). Пустой вход → [].
 */
export function groupRuns(runs: RichTextNode[]): RenderNode[] {
  const nonEmpty = runs.filter((run) => run.text !== '');
  return group(nonEmpty, new Set<string>());
}
