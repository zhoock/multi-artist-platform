/**
 * Один смысловой блок (band / session / …) должен совпадать по normalize(title) в разных локалях.
 * Union id из en + ru + root в `buildMergedAlbumDetails` даёт несколько строк с разными id для одного kind —
 * здесь классификация и слияние в один блок на kind для отображения и сохранения.
 */

import type { IInterface, detailsProps } from '@models';
import { mergeAlignedSemanticBlockContent } from '@entities/album/lib/albumDetailListItemId';
import type { SupportedLang } from '@shared/model/lang';

export type AlbumDetailSemanticKind =
  | 'bandMembers'
  | 'sessionMusicians'
  | 'producing'
  | 'mastering'
  | 'recordedAt'
  | 'mixedAt';

export const ALBUM_DETAIL_SEMANTIC_KIND_ORDER: AlbumDetailSemanticKind[] = [
  'bandMembers',
  'sessionMusicians',
  'recordedAt',
  'mixedAt',
  'mastering',
  'producing',
];

export function normalizeAlbumDetailTitle(t: string): string {
  return t.toLowerCase().replace(/[:.]/g, '').trim();
}

let staticTitleToKindCache: Map<string, AlbumDetailSemanticKind> | null = null;

function getStaticTitleToKindMap(): Map<string, AlbumDetailSemanticKind> {
  if (staticTitleToKindCache) return staticTitleToKindCache;
  const m = new Map<string, AlbumDetailSemanticKind>();
  const n = normalizeAlbumDetailTitle;

  m.set(n('Session musicians'), 'sessionMusicians');
  m.set(n('Сессионные музыканты'), 'sessionMusicians');

  m.set(n('Band members'), 'bandMembers');
  m.set(n('Исполнители'), 'bandMembers');
  m.set(n('Участники группы'), 'bandMembers');

  m.set(n('Producing'), 'producing');
  m.set(n('Продюсирование'), 'producing');
  m.set(n('Продюсер'), 'producing');

  m.set(n('Mastered By'), 'mastering');
  m.set(n('Мастеринг'), 'mastering');

  m.set(n('Recorded At'), 'recordedAt');
  m.set(n('Запись'), 'recordedAt');

  m.set(n('Mixed At'), 'mixedAt');
  m.set(n('Сведение'), 'mixedAt');

  staticTitleToKindCache = m;
  return m;
}

/** Классификация заголовка блока (статические варианты + опционально строки из ui.dashboard). */
export function classifyAlbumDetailSemanticKind(
  title: string,
  ui?: IInterface
): AlbumDetailSemanticKind | null {
  const t = normalizeAlbumDetailTitle(title);
  if (!t) return null;
  const m = new Map(getStaticTitleToKindMap());
  const d = ui?.dashboard;
  if (d?.bandMembers?.trim()) m.set(normalizeAlbumDetailTitle(d.bandMembers.trim()), 'bandMembers');
  if (d?.sessionMusicians?.trim())
    m.set(normalizeAlbumDetailTitle(d.sessionMusicians.trim()), 'sessionMusicians');
  if (d?.producing?.trim()) m.set(normalizeAlbumDetailTitle(d.producing.trim()), 'producing');
  if (d?.masteredBy?.trim()) m.set(normalizeAlbumDetailTitle(d.masteredBy.trim()), 'mastering');
  if (d?.recordedAt?.trim()) m.set(normalizeAlbumDetailTitle(d.recordedAt.trim()), 'recordedAt');
  if (d?.mixedAt?.trim()) m.set(normalizeAlbumDetailTitle(d.mixedAt.trim()), 'mixedAt');
  return m.get(t) ?? null;
}

const CANONICAL_TITLE: Record<AlbumDetailSemanticKind, { en: string; ru: string }> = {
  bandMembers: { en: 'Band members', ru: 'Исполнители' },
  sessionMusicians: { en: 'Session musicians', ru: 'Сессионные музыканты' },
  producing: { en: 'Producing', ru: 'Продюсирование' },
  mastering: { en: 'Mastered By', ru: 'Мастеринг' },
  recordedAt: { en: 'Recorded At', ru: 'Запись' },
  mixedAt: { en: 'Mixed At', ru: 'Сведение' },
};

export function canonicalAlbumDetailTitleForKind(
  kind: AlbumDetailSemanticKind,
  lang: SupportedLang
): string {
  return lang === 'ru' ? CANONICAL_TITLE[kind].ru : CANONICAL_TITLE[kind].en;
}

function contentLengthScore(content: detailsProps['content']): number {
  return Array.isArray(content) ? content.length : 0;
}

/** Несколько блоков одного kind (разные id из union) → один блок: min(id), канонический title под lang, лучший по объёму content. */
export function mergeAlbumDetailBlocksForKind(
  kind: AlbumDetailSemanticKind,
  blocks: detailsProps[],
  lang: SupportedLang
): detailsProps {
  const sorted = [...blocks].sort((a, b) => a.id - b.id);
  const id = Math.min(...sorted.map((b) => b.id));
  let best = sorted[0];
  let bestScore = contentLengthScore(best.content);
  for (const b of sorted) {
    const s = contentLengthScore(b.content);
    if (s > bestScore) {
      best = b;
      bestScore = s;
    }
  }
  const title = canonicalAlbumDetailTitleForKind(kind, lang);
  return { ...best, id, title };
}

/**
 * После `buildMergedAlbumDetails`: один ряд на семантический kind, канонический заголовок под `lang`.
 * `ui` — те же подписи dashboard, что и при сохранении из формы.
 */
export function dedupeMergedAlbumDetailsForDisplay(
  details: detailsProps[],
  lang: SupportedLang,
  ui?: IInterface
): detailsProps[] {
  const custom: detailsProps[] = [];
  const byKind = new Map<AlbumDetailSemanticKind, detailsProps[]>();

  for (const d of details) {
    const k = classifyAlbumDetailSemanticKind(d.title, ui);
    if (!k) {
      custom.push(d);
      continue;
    }
    const arr = byKind.get(k) ?? [];
    arr.push(d);
    byKind.set(k, arr);
  }

  const semantic: detailsProps[] = [];
  for (const kind of ALBUM_DETAIL_SEMANTIC_KIND_ORDER) {
    const group = byKind.get(kind);
    if (!group?.length) continue;
    semantic.push(
      group.length === 1
        ? {
            ...group[0],
            title: canonicalAlbumDetailTitleForKind(kind, lang),
          }
        : mergeAlbumDetailBlocksForKind(kind, group, lang)
    );
  }

  return [...semantic, ...custom];
}

function parseDetailsPropsArray(raw: unknown): detailsProps[] {
  if (!Array.isArray(raw)) return [];
  const out: detailsProps[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const id = (x as detailsProps).id;
    if (typeof id !== 'number' || !Number.isFinite(id)) continue;
    const title = (x as detailsProps).title;
    if (typeof title !== 'string') continue;
    out.push(x as detailsProps);
  }
  return out;
}

function semanticBlocksByKindFromDetails(
  details: detailsProps[],
  lang: SupportedLang,
  ui?: IInterface
): Map<AlbumDetailSemanticKind, detailsProps> {
  const byKind = new Map<AlbumDetailSemanticKind, detailsProps[]>();
  for (const d of details) {
    const k = classifyAlbumDetailSemanticKind(d.title, ui);
    if (!k) continue;
    const arr = byKind.get(k) ?? [];
    arr.push(d);
    byKind.set(k, arr);
  }
  const out = new Map<AlbumDetailSemanticKind, detailsProps>();
  for (const kind of ALBUM_DETAIL_SEMANTIC_KIND_ORDER) {
    const group = byKind.get(kind);
    if (!group?.length) continue;
    out.set(
      kind,
      group.length === 1
        ? {
            ...group[0],
            title: canonicalAlbumDetailTitleForKind(kind, lang),
          }
        : mergeAlbumDetailBlocksForKind(kind, group, lang)
    );
  }
  return out;
}

export type MergeSemanticSourceIntoLocaleDetailsOptions = {
  /**
   * Локаль сохранения: контент семантических блоков — только из формы (`semanticSourceDetails`);
   * если блока в форме нет (удалён / пусто), старый блок из БД не подставляется.
   * Вторая локаль: длина и состав слотов как в форме; текст по слоту — из существующей локали, иначе fallback из формы.
   */
  preferSemanticSourceForContent?: boolean;
};

function isSemanticBlockContentEmpty(block: detailsProps | undefined): boolean {
  if (!block) return true;
  const c = block.content;
  if (Array.isArray(c)) return c.length === 0;
  return c == null || c === '';
}

/**
 * Семантические блоки: см. `MergeSemanticSourceIntoLocaleDetailsOptions`.
 * Заголовки — канонические для `targetLang`. Не-смысловые блоки остаются из `existingLocaleDetails`.
 */
export function mergeSemanticSourceIntoLocaleDetails(
  existingLocaleDetails: unknown,
  semanticSourceDetails: detailsProps[],
  targetLang: SupportedLang,
  ui?: IInterface,
  options?: MergeSemanticSourceIntoLocaleDetailsOptions
): detailsProps[] {
  const existing = parseDetailsPropsArray(existingLocaleDetails);
  const custom = existing.filter((d) => !classifyAlbumDetailSemanticKind(d.title, ui));

  const existingByKind = semanticBlocksByKindFromDetails(existing, targetLang, ui);
  const sourceByKind = semanticBlocksByKindFromDetails(semanticSourceDetails, targetLang, ui);

  const preferSource = options?.preferSemanticSourceForContent === true;

  const semantic: detailsProps[] = [];
  for (const kind of ALBUM_DETAIL_SEMANTIC_KIND_ORDER) {
    const ex = existingByKind.get(kind);
    const src = sourceByKind.get(kind);

    if (preferSource) {
      if (!src || isSemanticBlockContentEmpty(src)) continue;
      semantic.push({
        ...src,
        title: canonicalAlbumDetailTitleForKind(kind, targetLang),
      });
      continue;
    }

    if (!src || isSemanticBlockContentEmpty(src)) continue;

    if (!ex || isSemanticBlockContentEmpty(ex)) {
      semantic.push({
        ...src,
        title: canonicalAlbumDetailTitleForKind(kind, targetLang),
      });
      continue;
    }

    const mergedContent = mergeAlignedSemanticBlockContent(ex.content, src.content);
    semantic.push({
      ...ex,
      content: mergedContent,
      title: canonicalAlbumDetailTitleForKind(kind, targetLang),
    });
  }

  return [...semantic, ...custom];
}
