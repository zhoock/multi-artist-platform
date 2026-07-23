/**
 * Locale flatten / edit-field resolution for Dashboard `AlbumEditable`.
 * Does not mutate `translations`. Public album pages use `resolveAlbumDetailsDisplay`.
 */

import type { SupportedLang } from '@shared/model/lang';
import type { AlbumEditable, TracksProps, detailsProps } from '@models';
import { CANONICAL_GENRES } from '@shared/constants/canonicalGenres';
import {
  buildTranslationFallbackLocales,
  DEFAULT_CONTENT_LOCALE,
  isTranslationValueMissing,
  resolveTranslationString,
  TRANSLATION_LOCALE_ORDER,
} from '@shared/lib/i18n/resolveTranslationFallback';
import {
  ALBUM_DETAIL_SEMANTIC_KIND_ORDER,
  classifyAlbumDetailSemanticKind,
  canonicalAlbumDetailTitleForKind,
  dedupeMergedAlbumDetailsForDisplay,
  mergeAlbumDetailBlocksForKind,
  type AlbumDetailSemanticKind,
} from './albumDetailSemanticKind';

const GENRE_DETAIL_TITLES = new Set(['Genre', 'Genres', 'Жанр', 'Жанры']);

/** Откуда взято значение в форме редактирования (для подписи fallback). */
export type AlbumEditFieldSource = SupportedLang | 'root';

export type ResolvedAlbumEditDetailBlockMeta = {
  isFallback: boolean;
  source: AlbumEditFieldSource;
};

export type ResolvedAlbumEditField = {
  value: string;
  /** true, если значение не из `translations[lang]` (другая локаль или корень). */
  isFallback: boolean;
  source: AlbumEditFieldSource;
};

export type ResolvedAlbumEditDetails = {
  details: detailsProps[];
  /** Совпадает по индексу с `details` после merge (та же модель, что и display). */
  blocksMeta: ResolvedAlbumEditDetailBlockMeta[];
  /** true, если хотя бы один блок с данными из другой локали или корня. */
  isFallback: boolean;
};

export function resolveTrackForDisplay(track: TracksProps, lang: SupportedLang): TracksProps {
  const title = resolveTranslationString(
    {
      en: track.translations?.en?.title,
      ru: track.translations?.ru?.title,
    },
    lang
  );
  const authorship = resolveTranslationString(
    {
      en: track.translations?.en?.authorship,
      ru: track.translations?.ru?.authorship,
    },
    lang
  );

  const resolvedTitle = !isTranslationValueMissing(title) ? title : track.title;
  const resolvedContent = track.lyrics?.content ?? track.content ?? '';
  const resolvedAuthorship = !isTranslationValueMissing(authorship)
    ? authorship
    : (track.lyrics?.authorship ?? track.authorship ?? '');

  return {
    ...track,
    title: resolvedTitle,
    content: resolvedContent,
    authorship: resolvedAuthorship || undefined,
  };
}

export function stripGenreDetailBlocks(details: detailsProps[]): detailsProps[] {
  return details.filter(
    (d) =>
      d &&
      typeof d === 'object' &&
      !GENRE_DETAIL_TITLES.has(String((d as { title?: string }).title ?? ''))
  );
}

function readGenreCodesFromRelease(release: AlbumEditable['release'] | undefined): string[] {
  if (!release || typeof release !== 'object') return [];
  const raw = (release as Record<string, unknown>).genreCodes;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

function formatGenreDetailLine(codes: string[], lang: SupportedLang): string {
  if (codes.length === 0) return '';
  const words = codes
    .map((code) => {
      const opt = CANONICAL_GENRES.find((g) => g.code === code.trim().toLowerCase());
      const raw = opt ? (lang === 'ru' ? opt.label.ru : opt.label.en) : code.trim();
      return raw.toLowerCase();
    })
    .filter((w) => w.length > 0);
  if (words.length === 0) return '';
  const first = words[0].charAt(0).toUpperCase() + words[0].slice(1);
  const rest = words.slice(1);
  const body = rest.length > 0 ? [first, ...rest].join(', ') : first;
  return `${body}.`;
}

function injectGenreDetailIfNeeded(
  details: detailsProps[],
  album: AlbumEditable,
  lang: SupportedLang
): detailsProps[] {
  const codes = readGenreCodesFromRelease(album.release);
  if (codes.length === 0) return details;
  const line = formatGenreDetailLine(codes, lang);
  if (!line) return details;
  const base = stripGenreDetailBlocks(details);
  const title = lang === 'ru' ? 'Жанр' : 'Genre';
  return [{ id: 1, title, content: [line] } as detailsProps, ...base];
}

function albumTranslationStrings(
  album: AlbumEditable,
  field: 'fullName' | 'description'
): Partial<Record<SupportedLang, string | null | undefined>> {
  return {
    en: album.translations?.en?.[field],
    ru: album.translations?.ru?.[field],
  };
}

/** Поля кредитов обложки хранятся в `translations[lang]`, не в общем `release`. */
export type AlbumCoverCreditField = 'photographer' | 'photographerURL' | 'designer' | 'designerURL';

/**
 * Кредиты обложки — строго по локали (без en↔ru fallback).
 * Пустая строка в `translations[lang]` значит «поле очищено», а не «подставь другую локаль».
 * Legacy: только `release` для старых данных, если у текущей локали ключа ещё нет.
 */
export function resolveAlbumCoverCreditFieldForEdit(
  album: AlbumEditable,
  field: AlbumCoverCreditField,
  lang: SupportedLang
): ResolvedAlbumEditField {
  const raw = album.translations?.[lang]?.[field];
  if (typeof raw === 'string') {
    return { value: raw.trim(), isFallback: false, source: lang };
  }
  const rel =
    album.release && typeof album.release === 'object'
      ? (album.release as Record<string, unknown>)
      : undefined;
  const legacy = rel?.[field];
  if (typeof legacy === 'string' && legacy.trim()) {
    return { value: legacy.trim(), isFallback: true, source: 'root' };
  }
  return { value: '', isFallback: false, source: 'root' };
}

/**
 * Публичная страница: кредиты только из текущей локали, затем legacy `release`.
 */
export function resolveAlbumCoverReleaseFieldsForDisplay(
  album: AlbumEditable,
  lang: SupportedLang
): Record<AlbumCoverCreditField, string> {
  const fields: AlbumCoverCreditField[] = [
    'photographer',
    'photographerURL',
    'designer',
    'designerURL',
  ];
  const out = {} as Record<AlbumCoverCreditField, string>;
  for (const f of fields) {
    const raw = album.translations?.[lang]?.[f];
    if (typeof raw === 'string') {
      out[f] = raw.trim();
      continue;
    }
    const rel =
      album.release && typeof album.release === 'object'
        ? (album.release as Record<string, unknown>)
        : undefined;
    const legacy = rel?.[f];
    out[f] = typeof legacy === 'string' ? legacy.trim() : '';
  }
  return out;
}

/**
 * Нормализация массива блоков details (иногда JSONB приходит строкой).
 */
function parseDetailsBlocks(raw: unknown): detailsProps[] {
  if (typeof raw === 'string') {
    try {
      return parseDetailsBlocks(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  const out: detailsProps[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const id = (item as detailsProps).id;
    if (typeof id !== 'number' || !Number.isFinite(id)) continue;
    const title = (item as detailsProps).title;
    if (typeof title !== 'string') continue;
    const content = (item as detailsProps).content;
    out.push({
      id,
      title,
      content: Array.isArray(content) ? content : [],
    });
  }
  return out;
}

/** Пустой / отсутствующий title → идём по цепочке fallback локалей. */
function isDetailTitleEmptyForFallback(title: unknown): boolean {
  if (typeof title !== 'string') return true;
  return title.trim().length === 0;
}

/** Пустой / отсутствующий массив content → fallback на другую локаль. */
function isDetailContentEmptyForFallback(content: unknown): boolean {
  if (!Array.isArray(content)) return true;
  return content.length === 0;
}

function detailsBlocksById(raw: unknown): Map<number, detailsProps> {
  const m = new Map<number, detailsProps>();
  for (const b of parseDetailsBlocks(raw)) {
    const prev = m.get(b.id);
    if (!prev) {
      m.set(b.id, b);
      continue;
    }
    const prevEmpty = isDetailContentEmptyForFallback(prev.content);
    const curEmpty = isDetailContentEmptyForFallback(b.content);
    if (prevEmpty && !curEmpty) m.set(b.id, b);
    else if (!prevEmpty && curEmpty) continue;
    else m.set(b.id, b);
  }
  return m;
}

type DetailLocaleMaps = {
  en: Map<number, detailsProps>;
  ru: Map<number, detailsProps>;
  root: Map<number, detailsProps>;
};

function buildAlbumDetailLocaleMaps(album: AlbumEditable): DetailLocaleMaps {
  return {
    en: detailsBlocksById(album.translations?.en?.details),
    ru: detailsBlocksById(album.translations?.ru?.details),
    root: detailsBlocksById(album.details),
  };
}

/**
 * Union всех числовых `id` из `translations.en.details`, `translations.ru.details` и корневого `details` (legacy).
 * Один id — один смысловой блок; отображение собирается в `buildMergedAlbumDetails` по цепочке fallback локалей.
 */
function collectAllDetailBlockIds(album: AlbumEditable): Set<number> {
  const ids = new Set<number>();
  for (const b of parseDetailsBlocks(album.translations?.en?.details)) ids.add(b.id);
  for (const b of parseDetailsBlocks(album.translations?.ru?.details)) ids.add(b.id);
  for (const b of parseDetailsBlocks(album.details)) ids.add(b.id);
  return ids;
}

function resolveDetailBlockTitleWithSource(
  blockId: number,
  chain: SupportedLang[],
  maps: DetailLocaleMaps
): { value: string; source: AlbumEditFieldSource } {
  for (const loc of chain) {
    const b = maps[loc].get(blockId);
    if (!b) continue;
    if (isDetailTitleEmptyForFallback(b.title)) continue;
    return { value: (b.title as string).trim(), source: loc };
  }
  const rootBlock = maps.root.get(blockId);
  if (rootBlock && !isDetailTitleEmptyForFallback(rootBlock.title)) {
    return { value: (rootBlock.title as string).trim(), source: 'root' };
  }
  return { value: '', source: 'root' };
}

/** Если в цепочке заголовок не найден, но контент есть — берём title с любой локали (порядок en → ru → root). */
function resolveDetailBlockTitleFallbackAnyWithSource(
  blockId: number,
  maps: DetailLocaleMaps
): { value: string; source: AlbumEditFieldSource } {
  for (const loc of TRANSLATION_LOCALE_ORDER) {
    const b = maps[loc].get(blockId);
    if (!b) continue;
    if (isDetailTitleEmptyForFallback(b.title)) continue;
    return { value: (b.title as string).trim(), source: loc };
  }
  const rootBlock = maps.root.get(blockId);
  if (rootBlock && !isDetailTitleEmptyForFallback(rootBlock.title)) {
    return { value: (rootBlock.title as string).trim(), source: 'root' };
  }
  return { value: '', source: 'root' };
}

function resolveDetailBlockContentWithSource(
  blockId: number,
  chain: SupportedLang[],
  maps: DetailLocaleMaps
): { value: detailsProps['content']; source: AlbumEditFieldSource } {
  for (const loc of chain) {
    const b = maps[loc].get(blockId);
    if (!b) continue;
    if (!Array.isArray(b.content) || b.content.length === 0) continue;

    return { value: b.content as detailsProps['content'], source: loc };
  }
  const rootBlock = maps.root.get(blockId);
  if (rootBlock && Array.isArray(rootBlock.content) && rootBlock.content.length > 0) {
    return { value: rootBlock.content as detailsProps['content'], source: 'root' };
  }
  return { value: [], source: 'root' };
}

function combineDetailBlockFallbackMeta(
  titleSource: AlbumEditFieldSource,
  contentSource: AlbumEditFieldSource,
  lang: SupportedLang
): { isFallback: boolean; source: AlbumEditFieldSource } {
  const isFallback = titleSource !== lang || contentSource !== lang;
  const source: AlbumEditFieldSource =
    titleSource !== lang ? titleSource : contentSource !== lang ? contentSource : lang;
  return { isFallback, source };
}

function mergeAlbumEditDetailBlockMetas(
  metas: ResolvedAlbumEditDetailBlockMeta[],
  lang: SupportedLang
): ResolvedAlbumEditDetailBlockMeta {
  const isFallback = metas.some((m) => m.isFallback);
  const source =
    metas.find((m) => m.source === lang)?.source ??
    metas.find((m) => !m.isFallback)?.source ??
    metas[0].source;
  return { isFallback, source };
}

/**
 * Union id из en/ru/root даёт два блока одного kind с разными id — схлопываем в один ряд + meta.
 */
function dedupeMergedAlbumDetailsWithMeta(
  details: detailsProps[],
  blockMeta: ResolvedAlbumEditDetailBlockMeta[],
  lang: SupportedLang
): { details: detailsProps[]; blockMeta: ResolvedAlbumEditDetailBlockMeta[] } {
  if (details.length !== blockMeta.length) {
    return { details, blockMeta };
  }

  const kindToIndices = new Map<AlbumDetailSemanticKind, number[]>();
  const customIndices: number[] = [];

  details.forEach((d, i) => {
    const k = classifyAlbumDetailSemanticKind(d.title);
    if (!k) customIndices.push(i);
    else {
      const arr = kindToIndices.get(k) ?? [];
      arr.push(i);
      kindToIndices.set(k, arr);
    }
  });

  const outD: detailsProps[] = [];
  const outM: ResolvedAlbumEditDetailBlockMeta[] = [];

  for (const i of customIndices) {
    outD.push(details[i]);
    outM.push(blockMeta[i]);
  }

  for (const kind of ALBUM_DETAIL_SEMANTIC_KIND_ORDER) {
    const indices = kindToIndices.get(kind);
    if (!indices?.length) continue;
    const blocks = indices.map((i) => details[i]);
    const metas = indices.map((i) => blockMeta[i]);
    const mergedD =
      blocks.length === 1
        ? { ...blocks[0], title: canonicalAlbumDetailTitleForKind(kind, lang) }
        : mergeAlbumDetailBlocksForKind(kind, blocks, lang);
    outD.push(mergedD);
    outM.push(mergeAlbumEditDetailBlockMetas(metas, lang));
  }

  return { details: outD, blockMeta: outM };
}

function applyStripGenreBlocksToMerged(
  details: detailsProps[],
  blockMeta: ResolvedAlbumEditDetailBlockMeta[]
): { details: detailsProps[]; blockMeta: ResolvedAlbumEditDetailBlockMeta[] } {
  const outD: detailsProps[] = [];
  const outM: ResolvedAlbumEditDetailBlockMeta[] = [];
  for (let i = 0; i < details.length; i++) {
    const d = details[i];
    const title = String((d as { title?: string }).title ?? '');
    if (GENRE_DETAIL_TITLES.has(title)) continue;
    outD.push(d);
    outM.push(blockMeta[i]);
  }
  return { details: outD, blockMeta: outM };
}

/**
 * Display / edit: union всех `id` из en + ru (+ root), затем для каждого id:
 * - `title` и `content` выбираются по цепочке `buildTranslationFallbackLocales(lang, …)` (сначала текущая локаль, потом fallback);
 * - если блок есть только в RU, при UI `en` данные берутся из `maps.ru` после исчерпания `en`.
 */
function buildMergedAlbumDetails(
  album: AlbumEditable,
  lang: SupportedLang,
  options: { withBlockMeta: boolean; stripGenreBlocks: boolean }
): { details: detailsProps[]; blockMeta: ResolvedAlbumEditDetailBlockMeta[] } {
  const chain = buildTranslationFallbackLocales(
    lang,
    DEFAULT_CONTENT_LOCALE,
    TRANSLATION_LOCALE_ORDER
  );
  const maps = buildAlbumDetailLocaleMaps(album);
  const ids = collectAllDetailBlockIds(album);
  if (ids.size === 0) {
    return { details: [], blockMeta: [] };
  }

  const sortedIds = [...ids].sort((a, b) => a - b);
  const details: detailsProps[] = [];
  const blockMeta: ResolvedAlbumEditDetailBlockMeta[] = [];

  for (const blockId of sortedIds) {
    let titleRes = resolveDetailBlockTitleWithSource(blockId, chain, maps);
    const contentRes = resolveDetailBlockContentWithSource(blockId, chain, maps);
    const hasContent = Array.isArray(contentRes.value) && contentRes.value.length > 0;

    if (!titleRes.value && hasContent) {
      const fb = resolveDetailBlockTitleFallbackAnyWithSource(blockId, maps);
      if (fb.value) titleRes = fb;
    }

    const title = titleRes.value;
    if (!title.trim() && !hasContent) continue;

    details.push({
      id: blockId,
      title: title || '',
      content: hasContent ? contentRes.value : [],
    });
    if (options.withBlockMeta) {
      blockMeta.push(combineDetailBlockFallbackMeta(titleRes.source, contentRes.source, lang));
    }
  }

  if (options.stripGenreBlocks && details.length > 0) {
    return applyStripGenreBlocksToMerged(details, blockMeta);
  }

  return { details, blockMeta };
}

/**
 * Значение поля для формы: та же цепочка, что и на display (current → default → en, ru), затем корень.
 */
export function resolveAlbumFieldForEdit(
  album: AlbumEditable,
  field: 'album' | 'fullName' | 'description',
  lang: SupportedLang
): ResolvedAlbumEditField {
  if (field === 'album') {
    const root = (album.album ?? '').trim();
    if (root) return { value: root, isFallback: false, source: 'root' };
    const legacy = resolveTranslationString(
      {
        en: album.translations?.en?.album,
        ru: album.translations?.ru?.album,
      },
      lang
    );
    if (legacy)
      return {
        value: legacy,
        isFallback: true,
        source: lang,
      };
    return { value: '', isFallback: false, source: 'root' };
  }

  const chain = buildTranslationFallbackLocales(
    lang,
    DEFAULT_CONTENT_LOCALE,
    TRANSLATION_LOCALE_ORDER
  );
  for (const loc of chain) {
    const raw = album.translations?.[loc]?.[field];
    if (typeof raw === 'string' && raw.trim()) {
      return { value: raw.trim(), isFallback: loc !== lang, source: loc };
    }
  }
  let root = '';
  if (field === 'fullName') root = (album.fullName ?? '').trim();
  else root = (album.description ?? '').trim();
  return {
    value: root,
    isFallback: root.length > 0,
    source: 'root',
  };
}

export function getAlbumDetailsForEdit(
  album: AlbumEditable,
  lang: SupportedLang
): ResolvedAlbumEditDetails {
  const stripGenres = readGenreCodesFromRelease(album.release).length > 0;
  const { details, blockMeta } = buildMergedAlbumDetails(album, lang, {
    withBlockMeta: true,
    stripGenreBlocks: stripGenres,
  });
  const deduped = dedupeMergedAlbumDetailsWithMeta(details, blockMeta, lang);
  return {
    details: deduped.details,
    blocksMeta: deduped.blockMeta,
    isFallback: deduped.blockMeta.some((b) => b.isFallback),
  };
}

/** Уникальные источники fallback по нескольким полям (подпись к форме). */
export function collectAlbumEditFallbackSources(
  parts: { isFallback: boolean; source: AlbumEditFieldSource }[]
): AlbumEditFieldSource[] {
  const sources = new Set<AlbumEditFieldSource>();
  for (const p of parts) {
    if (p.isFallback) sources.add(p.source);
  }
  return [...sources];
}

/** Текст предупреждения в формах редактирования (альбом / трек). */
export function buildTranslatedContentEditFallbackNotice(
  sources: AlbumEditFieldSource[],
  lang: SupportedLang
): string | null {
  if (sources.length === 0) return null;
  const label = (s: AlbumEditFieldSource) => {
    if (s === 'root') return lang === 'ru' ? 'основные поля' : 'base fields';
    if (s === 'en') return 'English';
    return 'Русский';
  };
  const joined = [...new Set(sources)].map(label).join(', ');
  if (lang === 'ru') {
    return `Подставлены данные из: ${joined}. Текст песни и синхронизация общие; авторство и название — по локалям.`;
  }
  return `Prefilled from: ${joined}. Lyrics and sync are shared; title and authorship are per locale.`;
}

export function resolveTrackFieldForEdit(
  track: TracksProps,
  field: 'title' | 'content' | 'authorship',
  lang: SupportedLang
): ResolvedAlbumEditField {
  if (field === 'content') {
    const v = (track.lyrics?.content ?? track.content ?? '').trim();
    return { value: v, isFallback: false, source: lang };
  }
  const chain = buildTranslationFallbackLocales(
    lang,
    DEFAULT_CONTENT_LOCALE,
    TRANSLATION_LOCALE_ORDER
  );
  for (const loc of chain) {
    const raw = track.translations?.[loc]?.[field];
    if (typeof raw === 'string' && raw.trim()) {
      return { value: raw.trim(), isFallback: loc !== lang, source: loc };
    }
  }
  let root = '';
  if (field === 'title') root = (track.title ?? '').trim();
  else root = (track.authorship ?? '').trim();
  return {
    value: root,
    isFallback: root.length > 0,
    source: 'root',
  };
}

/** Fallback для обложечных строк: сначала translations, иначе корень (legacy / канон). */
export function resolveAlbumStringField(
  album: AlbumEditable,
  field: 'album' | 'fullName' | 'description',
  lang: SupportedLang
): string {
  if (field === 'album') {
    const root = (album.album ?? '').trim();
    if (root) return root;
    return (
      resolveTranslationString(
        {
          en: album.translations?.en?.album,
          ru: album.translations?.ru?.album,
        },
        lang
      ) || ''
    );
  }
  const fromTranslations = resolveTranslationString(albumTranslationStrings(album, field), lang);
  if (fromTranslations) return fromTranslations;
  if (field === 'fullName') return album.fullName ?? '';
  return album.description ?? '';
}

/** См. `buildMergedAlbumDetails` — та же union по id и fallback по локалям. */
function resolveAlbumDetailsForDisplay(album: AlbumEditable, lang: SupportedLang): detailsProps[] {
  const raw = buildMergedAlbumDetails(album, lang, {
    withBlockMeta: false,
    stripGenreBlocks: false,
  }).details;
  return dedupeMergedAlbumDetailsForDisplay(raw, lang);
}

/**
 * Плоский снимок альбома для отображения (новый объект, `translations` не меняется).
 */
export function resolveAlbumEditableForDisplay(
  album: AlbumEditable,
  lang: SupportedLang
): AlbumEditable {
  const albumTitle = resolveAlbumStringField(album, 'album', lang);
  const fullNameRaw = resolveAlbumStringField(album, 'fullName', lang);
  const fullName =
    fullNameRaw ||
    `${album.artistDisplayName || album.artist || ''}${(album.artistDisplayName || album.artist) && albumTitle ? ' — ' : ''}${albumTitle}`.trim();

  const tracks = (album.tracks ?? []).map((t) => resolveTrackForDisplay(t, lang));

  const rawDetails = resolveAlbumDetailsForDisplay(album, lang);
  const details = injectGenreDetailIfNeeded(rawDetails, album, lang);

  const coverResolved = resolveAlbumCoverReleaseFieldsForDisplay(album, lang);
  const relBase =
    album.release && typeof album.release === 'object'
      ? { ...(album.release as Record<string, unknown>) }
      : {};

  return {
    ...album,
    album: albumTitle,
    fullName,
    description: resolveAlbumStringField(album, 'description', lang),
    details,
    tracks,
    release: {
      ...relBase,
      photographer: coverResolved.photographer,
      photographerURL: coverResolved.photographerURL,
      designer: coverResolved.designer,
      designerURL: coverResolved.designerURL,
    },
  };
}
