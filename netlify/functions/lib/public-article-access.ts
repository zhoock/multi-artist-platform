/**
 * Public article access policy: visibility, articleLocked, and body redaction.
 * Uses the same preview split as the client partial paywall (splitArticleDetailsForArchiveGate).
 */

import { splitArticleDetailsForArchiveGate } from '../../../src/entities/article/lib/splitArticleDetailsForArchiveGate';
import { resolveEffectiveContentVisibility } from '../../../src/shared/lib/payment/artistMonetization';
import {
  normalizeTrackVisibility,
  type TrackVisibility,
} from '../../../src/shared/lib/tracks/trackVisibility';
import type { ArticledetailsProps } from '../../../src/models';
import type { SupportedLang } from './types';

export interface PublicArticleLocalePayload {
  nameArticle: string;
  description: string;
  details: unknown[];
}

export interface PublicArticleData {
  id: string;
  userId?: string;
  articleId: string;
  nameArticle: string;
  img: string;
  date: string;
  details: unknown[];
  description: string;
  isDraft?: boolean;
  hasDraftChanges?: boolean;
  visibility?: TrackVisibility;
  articleLocked?: boolean;
  updatedAt?: string;
  lang?: string;
  translations?: Partial<Record<SupportedLang, PublicArticleLocalePayload>>;
}

/** Safe preview blocks only — locked body never leaves the server. */
export function previewDetailsOnly(details: unknown[]): unknown[] {
  if (!Array.isArray(details) || details.length === 0) return [];
  const { previewDetails } = splitArticleDetailsForArchiveGate(details as ArticledetailsProps[]);
  return previewDetails;
}

/**
 * Strip full article body for subscribers_only viewers without premium access.
 * Metadata (title, cover, date, visibility, articleLocked) is preserved.
 */
export function redactLockedArticleBodyForPublicApi(article: PublicArticleData): PublicArticleData {
  const redactLocale = (locale: PublicArticleLocalePayload): PublicArticleLocalePayload => ({
    nameArticle: locale.nameArticle,
    description: '',
    details: previewDetailsOnly(locale.details),
  });

  let translations: PublicArticleData['translations'];
  if (article.translations) {
    translations = {};
    for (const [lang, locale] of Object.entries(article.translations)) {
      if (locale) {
        translations[lang as SupportedLang] = redactLocale(locale);
      }
    }
  }

  return {
    ...article,
    articleLocked: true,
    description: '',
    details: previewDetailsOnly(article.details),
    translations,
  };
}

/**
 * Публичный каталог: скрытые статьи не отдаём; subscribers_only без premium —
 * articleLocked + preview-only body (partial paywall above gate).
 * Пока у артиста нет монетизации, subscribers_only ведёт себя как public.
 */
export function applyPublicArticleAccessPolicy(
  articles: PublicArticleData[],
  ctx: { hasPremiumAccess: boolean; monetizationEnabled: boolean }
): PublicArticleData[] {
  const withoutHidden = articles.filter((a) => normalizeTrackVisibility(a.visibility) !== 'hidden');

  return withoutHidden.map((a) => {
    const visibility = resolveEffectiveContentVisibility(
      normalizeTrackVisibility(a.visibility),
      ctx.monetizationEnabled
    );
    const needLock = visibility === 'subscribers_only' && !ctx.hasPremiumAccess;
    if (needLock) {
      return redactLockedArticleBodyForPublicApi({ ...a, visibility });
    }
    return { ...a, visibility, articleLocked: false };
  });
}
