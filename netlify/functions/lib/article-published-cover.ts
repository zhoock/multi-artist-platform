export type ArticleCoverRow = {
  img?: string | null;
  published_img?: string | null;
  is_draft?: boolean | null;
  has_draft_changes?: boolean | null;
};

export function normalizeArticleCoverKey(raw: string | null | undefined): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

/** Public/catalog responses: use published snapshot when draft changes are pending. */
export function resolvePublicArticleImg(
  article: ArticleCoverRow,
  usePublishedSnapshot: boolean
): string {
  const live = normalizeArticleCoverKey(article.img);
  const published = normalizeArticleCoverKey(article.published_img);
  const isDraft = article.is_draft ?? false;

  if (!usePublishedSnapshot) {
    return live;
  }

  if (!isDraft) {
    return published || live;
  }

  return live;
}

/** Do not delete storage objects that are still referenced by the public snapshot. */
export function shouldDeleteReplacedArticleCoverKey(
  replacedKey: string | null | undefined,
  publishedSnapshotKey: string | null | undefined
): boolean {
  const replaced = normalizeArticleCoverKey(replacedKey);
  if (!replaced) return false;
  const published = normalizeArticleCoverKey(publishedSnapshotKey);
  return replaced !== published;
}

export type ArticleCoverWriteInput = {
  curIsDraft: boolean;
  curHasDraftChanges: boolean;
  curImg: string | null;
  curPublishedImg: string | null;
  isExplicitPublish: boolean;
  isDraftRequest: boolean;
  hasWorkingPatch: boolean;
  requestedImg?: string | null;
};

export type ArticleCoverWriteState = {
  img: string | null;
  publishedImg: string | null;
  hasDraftChanges: boolean;
};

/**
 * Derive img / published_img for locale upsert.
 * - Never-published draft: img only, published_img stays null.
 * - Published + save draft: img = working copy, published_img frozen.
 * - Publish: img and published_img both promoted to working copy.
 */
export function resolveArticleCoverWriteState(
  input: ArticleCoverWriteInput
): ArticleCoverWriteState {
  const curImg = normalizeArticleCoverKey(input.curImg) || null;
  const curPublished = normalizeArticleCoverKey(input.curPublishedImg) || null;
  let img =
    input.requestedImg !== undefined
      ? normalizeArticleCoverKey(input.requestedImg) || null
      : curImg;
  let publishedImg = curPublished;
  let hasDraftChanges = input.curHasDraftChanges;

  if (input.isExplicitPublish) {
    hasDraftChanges = false;
    if (input.requestedImg !== undefined) {
      img = normalizeArticleCoverKey(input.requestedImg) || null;
    }
    publishedImg = img;
    return { img, publishedImg, hasDraftChanges };
  }

  if (input.isDraftRequest) {
    hasDraftChanges = false;
    publishedImg = null;
    if (input.requestedImg !== undefined) {
      img = normalizeArticleCoverKey(input.requestedImg) || null;
    }
    return { img, publishedImg, hasDraftChanges };
  }

  if (input.hasWorkingPatch && !input.curIsDraft) {
    hasDraftChanges = true;
    if (publishedImg == null && curImg) {
      publishedImg = curImg;
    }
    if (input.requestedImg !== undefined) {
      img = normalizeArticleCoverKey(input.requestedImg) || null;
    }
    return { img, publishedImg, hasDraftChanges };
  }

  if (input.requestedImg !== undefined) {
    img = normalizeArticleCoverKey(input.requestedImg) || null;
  }

  return { img, publishedImg, hasDraftChanges };
}
