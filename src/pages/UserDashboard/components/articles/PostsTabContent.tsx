import React from 'react';
import clsx from 'clsx';

import {
  ArticleCoverImage,
  ArticleCoverPlaceholder,
  getArticlePreviewContent,
} from '@entities/article';
import type { IArticles, IInterface } from '@models';
import { formatDate } from '@shared/api/albums';
import { EmailVerificationOnboarding } from '@shared/lib/emailVerification';
import { renderMarkdownViaRichText } from '@shared/lib/richText';
import { normalizeTrackVisibility, type TrackVisibility } from '@shared/lib/tracks/trackVisibility';
import type { SupportedLang } from '@shared/model/lang';
import { DashboardCard, DashboardRow } from '@shared/ui/dashboard';
import {
  getDashboardRowFlashProps,
  type DashboardRowFlash,
} from '../../lib/dashboardRowStateFlash';
import { DashboardExpandChevron } from '../../lib/dashboardExpandChevron';
import { ArticleAccessControl } from './ArticleAccessControl';
import { ArticleListStatus } from './ArticleListStatus';
import { ArticlesEmptyState } from './ArticlesEmptyState';
import { ArticlesListSkeleton } from './ArticlesListSkeleton';
import { getArticleListDraftBadge, isArticlePublished } from './articleVisibilityOptions';

export type ArticleCoverUploadState = {
  preview: string | null;
  status: 'idle' | 'uploading' | 'uploaded' | 'error';
  progress: number;
  error: string | null;
  dragActive: boolean;
};

type PostsTabContentProps = {
  emailVerified: boolean;
  articlesStatus: string;
  articlesError: string | null | undefined;
  articles: IArticles[];
  expandedArticleId: string | null;
  articleAccessMenuArticleId: string | null;
  articleCoverUpload: Record<string, ArticleCoverUploadState>;
  dashboardRowFlashes: Record<string, DashboardRowFlash>;
  ui: IInterface | null;
  lang: SupportedLang;
  onToggleArticle: (articleId: string | null) => void;
  onArticleAccessMenuChange: (articleId: string | null) => void;
  onArticleVisibilityChange: (articleId: string, visibility: TrackVisibility) => void;
  onArticleCoverDrag: (articleId: string, e: React.DragEvent) => void;
  onArticleCoverDrop: (articleId: string, e: React.DragEvent) => void;
  onArticleCoverFileInput: (articleId: string, e: React.ChangeEvent<HTMLInputElement>) => void;
  onEditArticle: (article: IArticles) => void;
  onDeleteArticle: (article: IArticles) => void;
  onCreateArticle: () => void;
};

type ArticleCoverUploadBlockProps = {
  article: IArticles;
  articleOwnerId: string | undefined;
  coverState: ArticleCoverUploadState | undefined;
  ui: IInterface | null;
  onArticleCoverDrag: PostsTabContentProps['onArticleCoverDrag'];
  onArticleCoverDrop: PostsTabContentProps['onArticleCoverDrop'];
  onArticleCoverFileInput: PostsTabContentProps['onArticleCoverFileInput'];
};

function ArticleCoverUploadBlock({
  article,
  articleOwnerId,
  coverState,
  ui,
  onArticleCoverDrag,
  onArticleCoverDrop,
  onArticleCoverFileInput,
}: ArticleCoverUploadBlockProps) {
  const hasCover = article.img || coverState?.preview;

  return (
    <>
      <input
        type="file"
        id={`article-cover-input-${article.articleId}`}
        accept="image/*"
        className="user-dashboard__article-cover-file-input"
        onChange={(e) => onArticleCoverFileInput(article.articleId, e)}
      />

      {hasCover ? (
        <div className="user-dashboard__article-cover-wrap">
          <div className="user-dashboard__article-cover-preview-shell">
            <div className="user-dashboard__article-cover-preview">
              {coverState?.preview ? (
                <img
                  src={coverState.preview}
                  alt="Article cover preview"
                  className="user-dashboard__article-cover-image"
                />
              ) : article.img && articleOwnerId ? (
                <ArticleCoverImage
                  img={article.img}
                  userId={articleOwnerId}
                  role="admin"
                  alt="Article cover preview"
                  className="user-dashboard__article-cover-image"
                  debugLabel={`UserDashboard:articleCoverPreview:${article.articleId}`}
                />
              ) : (
                <ArticleCoverPlaceholder
                  alt="Article cover preview"
                  className="user-dashboard__article-cover-image"
                />
              )}
            </div>
          </div>

          <div className="user-dashboard__article-cover-actions">
            <div className="user-dashboard__article-cover-buttons">
              <label
                htmlFor={`article-cover-input-${article.articleId}`}
                className="user-dashboard__article-cover-button"
              >
                {ui?.dashboard?.replace ?? 'Replace'}
              </label>
            </div>

            {coverState?.status === 'uploading' && (
              <div className="user-dashboard__article-cover-status">
                <div className="user-dashboard__article-cover-progress">
                  <div
                    className="user-dashboard__article-cover-progress-bar"
                    style={{ width: `${coverState.progress}%` }}
                  />
                </div>
                <span className="user-dashboard__article-cover-status-text">
                  {ui?.dashboard?.uploading ?? 'Uploading...'}
                </span>
              </div>
            )}

            {coverState?.status === 'uploaded' && (
              <div className="user-dashboard__article-cover-status">
                <span className="user-dashboard__article-cover-status-text user-dashboard__article-cover-status-text--success">
                  {ui?.dashboard?.uploaded ?? 'Uploaded'}
                </span>
              </div>
            )}

            {coverState?.status === 'error' && coverState.error && (
              <div className="user-dashboard__article-cover-status">
                <span className="user-dashboard__article-cover-status-text user-dashboard__article-cover-status-text--error">
                  {ui?.dashboard?.error ?? 'Error'}: {coverState.error}
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div
          className={clsx(
            'user-dashboard__article-cover-dropzone',
            coverState?.dragActive && 'user-dashboard__article-cover-dropzone--active'
          )}
          onDragEnter={(e) => onArticleCoverDrag(article.articleId, e)}
          onDragLeave={(e) => onArticleCoverDrag(article.articleId, e)}
          onDragOver={(e) => onArticleCoverDrag(article.articleId, e)}
          onDrop={(e) => onArticleCoverDrop(article.articleId, e)}
        >
          <div className="user-dashboard__article-cover-dropzone-text">
            {ui?.dashboard?.dragImageHereOr ?? 'Drag image here or'}
          </div>
          <label
            htmlFor={`article-cover-input-${article.articleId}`}
            className="user-dashboard__article-cover-file-label"
          >
            {ui?.dashboard?.chooseFile ?? 'Choose file'}
          </label>
        </div>
      )}
    </>
  );
}

export function PostsTabContent({
  emailVerified,
  articlesStatus,
  articlesError,
  articles,
  expandedArticleId,
  articleAccessMenuArticleId,
  articleCoverUpload,
  dashboardRowFlashes,
  ui,
  lang,
  onToggleArticle,
  onArticleAccessMenuChange,
  onArticleVisibilityChange,
  onArticleCoverDrag,
  onArticleCoverDrop,
  onArticleCoverFileInput,
  onEditArticle,
  onDeleteArticle,
  onCreateArticle,
}: PostsTabContentProps) {
  if (!emailVerified) {
    return <EmailVerificationOnboarding context="posts" />;
  }

  if (articlesStatus === 'loading') {
    return (
      <div className="user-dashboard__section">
        <ArticlesListSkeleton count={4} />
      </div>
    );
  }

  if (articlesError) {
    return (
      <div className="user-dashboard__section">
        <div className="user-dashboard__error">
          {ui?.dashboard?.errorLoadingArticles ?? 'Error loading articles'}: {articlesError}
        </div>
      </div>
    );
  }

  if (articles.length === 0) {
    return <ArticlesEmptyState ui={ui} onCreateArticle={onCreateArticle} />;
  }

  return (
    <div className="user-dashboard__section">
      <div className="user-dashboard__albums-list">
        {articles.map((article, index) => {
          const isExpanded = expandedArticleId === article.articleId;
          const articleVisibility = normalizeTrackVisibility(article.visibility);
          const articleDraftBadge = getArticleListDraftBadge(article);
          const articleIsPublished = isArticlePublished(article);

          if (article.img && !article.userId) {
            console.error('[BUG] article.userId missing', {
              articleId: article.articleId,
              context: 'articlesList',
            });
          }

          const articleOwnerId = article.userId;
          const articleRowFlash = getDashboardRowFlashProps(
            `dashboard-article-row-${article.articleId}`,
            dashboardRowFlashes
          );
          const coverState = articleCoverUpload[article.articleId];
          const preview = isExpanded ? getArticlePreviewContent(article) : null;

          return (
            <React.Fragment key={article.articleId}>
              <div
                id={`dashboard-article-row-${article.articleId}`}
                className={clsx(
                  'user-dashboard__album-item',
                  'dashboard-article-row',
                  articleRowFlash.className,
                  {
                    'user-dashboard__album-item--expanded': isExpanded,
                    'user-dashboard__album-item--access-menu-open':
                      articleAccessMenuArticleId === article.articleId,
                  }
                )}
                style={articleRowFlash.style}
                data-visibility-flash={articleRowFlash['data-visibility-flash']}
                onClick={() => onToggleArticle(isExpanded ? null : article.articleId)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggleArticle(isExpanded ? null : article.articleId);
                  }
                }}
                aria-label={isExpanded ? 'Collapse article' : 'Expand article'}
              >
                <div className="user-dashboard__album-thumbnail user-dashboard__album-thumbnail--article">
                  {article.img ? (
                    articleOwnerId ? (
                      <ArticleCoverImage
                        img={article.img}
                        userId={articleOwnerId}
                        role="admin"
                        alt={article.nameArticle}
                        loading="lazy"
                        decoding="async"
                        debugLabel={`UserDashboard:articleThumb:${article.articleId}`}
                      />
                    ) : (
                      <ArticleCoverPlaceholder
                        alt={article.nameArticle}
                        loading="lazy"
                        decoding="async"
                      />
                    )
                  ) : (
                    <ArticleCoverPlaceholder
                      alt={article.nameArticle}
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                </div>
                <div className="user-dashboard__album-info">
                  <div className="user-dashboard__album-title-row">
                    <div className="user-dashboard__album-title">{article.nameArticle}</div>
                    <ArticleListStatus
                      draftBadge={articleDraftBadge}
                      ui={ui ?? undefined}
                      lang={lang}
                    />
                  </div>
                  {article.date ? (
                    <div className="user-dashboard__album-date">{formatDate(article.date)}</div>
                  ) : null}
                </div>
                <div
                  className="user-dashboard__album-item-actions"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {articleIsPublished ? (
                    <ArticleAccessControl
                      articleId={article.articleId}
                      visibility={articleVisibility}
                      ui={ui ?? undefined}
                      lang={lang}
                      menuOpen={articleAccessMenuArticleId === article.articleId}
                      onMenuOpenChange={(open) =>
                        onArticleAccessMenuChange(open ? article.articleId : null)
                      }
                      onPickVisibility={(v) => void onArticleVisibilityChange(article.articleId, v)}
                      getRowElement={() =>
                        document.getElementById(`dashboard-article-row-${article.articleId}`)
                      }
                    />
                  ) : null}
                  <div className="user-dashboard__album-arrow">
                    <DashboardExpandChevron expanded={isExpanded} />
                  </div>
                </div>
              </div>

              {isExpanded ? (
                <DashboardCard className="user-dashboard__album-expanded user-dashboard__album-expanded--article user-dashboard__album-expanded--kit">
                  <DashboardRow
                    label={ui?.dashboard?.articleCover ?? 'Article Cover'}
                    variant="start"
                  >
                    <ArticleCoverUploadBlock
                      article={article}
                      articleOwnerId={articleOwnerId}
                      coverState={coverState}
                      ui={ui}
                      onArticleCoverDrag={onArticleCoverDrag}
                      onArticleCoverDrop={onArticleCoverDrop}
                      onArticleCoverFileInput={onArticleCoverFileInput}
                    />
                  </DashboardRow>

                  {preview ? (
                    <div className="user-dashboard__article-description">
                      {renderMarkdownViaRichText(preview.markdown)}
                      {preview.truncated ? '\u2026' : null}
                    </div>
                  ) : null}

                  <div className="user-dashboard__article-actions">
                    <button
                      type="button"
                      className="user-dashboard__edit-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditArticle(article);
                      }}
                    >
                      {ui?.dashboard?.editArticle ?? 'Edit Article'}
                    </button>
                    <button
                      type="button"
                      className="user-dashboard__delete-article-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteArticle(article);
                      }}
                      title={ui?.dashboard?.deleteArticle ?? 'Delete article'}
                      aria-label={ui?.dashboard?.deleteArticle ?? 'Delete article'}
                    >
                      {ui?.dashboard?.deleteArticle ?? 'Delete article'}
                    </button>
                  </div>
                </DashboardCard>
              ) : null}

              {index < articles.length - 1 ? (
                <div className="user-dashboard__album-divider" />
              ) : null}
            </React.Fragment>
          );
        })}
      </div>

      <div className="user-dashboard__upload-action">
        <button type="button" className="dashboard-empty-state__cta" onClick={onCreateArticle}>
          {ui?.dashboard?.uploadNewArticle ?? 'Upload New Article'}
        </button>
      </div>
    </div>
  );
}
