export type HelpRequestStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export type HelpArticleSlug = string;
export type HelpCategorySlug = string;

export type HelpListItem = {
  id?: string | number;
  text: string;
};

export type HelpListContent = string | string[] | HelpListItem[];

export type HelpContentBlockKind =
  | 'paragraph'
  | 'title'
  | 'subtitle'
  | 'quote'
  | 'list'
  | 'divider'
  | 'image'
  | 'carousel';

/** Rich-text block inside a help article — independent from artist article details. */
export type HelpContentBlock = {
  blockId?: string;
  blockKind?: HelpContentBlockKind;
  title?: string;
  subtitle?: string;
  content?: HelpListContent;
  img?: string | string[];
  caption?: string;
};

/** Article metadata for catalog listings, category pages, and future search indexing. */
export type HelpArticleSummary = {
  slug: HelpArticleSlug;
  categorySlug: HelpCategorySlug;
  title: string;
  description: string;
  updatedAt: string;
  sortOrder?: number;
  /** Reserved for full-text search — not used yet. */
  searchKeywords?: string[];
};

export type HelpCategory = {
  slug: HelpCategorySlug;
  title: string;
  description?: string;
  sortOrder?: number;
};

/** Catalog index loaded eagerly on help routes. */
export type HelpCatalog = {
  version: number;
  categories: HelpCategory[];
  articles: HelpArticleSummary[];
};

/** Full article payload — loaded lazily per slug. */
export type HelpArticle = HelpArticleSummary & {
  blocks: HelpContentBlock[];
};

export type HelpArticleEntry = {
  status: HelpRequestStatus;
  error: string | null;
  data: HelpArticle | null;
};

export type HelpCatalogEntry = {
  status: HelpRequestStatus;
  error: string | null;
  data: HelpCatalog | null;
  lastUpdated: number | null;
};

export type HelpLangState = {
  catalog: HelpCatalogEntry;
  articlesBySlug: Record<HelpArticleSlug, HelpArticleEntry>;
};

export type HelpState = {
  en: HelpLangState;
  ru: HelpLangState;
};
