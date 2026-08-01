import React, { type KeyboardEvent } from 'react';
import clsx from 'clsx';
import { Pencil as PencilIcon, Trash2 as Trash2Icon } from 'lucide-react';

import { ArticleCoverImage, ArticleCoverPlaceholder } from '@entities/article';
import type { IArticles, IInterface } from '@models';
import { formatDate } from '@shared/api/albums';
import { EmailVerificationOnboarding } from '@shared/lib/emailVerification';
import { normalizeTrackVisibility, type TrackVisibility } from '@shared/lib/tracks/trackVisibility';
import type { SupportedLang } from '@shared/model/lang';
import { DashboardButton, DashboardCard, DashboardLoadingState } from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import {
  getDashboardRowFlashProps,
  type DashboardRowFlash,
} from '../../lib/dashboardRowStateFlash';
import { ArticleAccessControl } from './ArticleAccessControl';
import { ArticleListStatus } from './ArticleListStatus';
import { ArticlesEmptyState } from './ArticlesEmptyState';
import { getArticleListDraftBadge, isArticlePublished } from './articleVisibilityOptions';
import { bindDashboardPreloadIntentHandlers } from '../../lib/bindDashboardPreloadIntentHandlers';

type PostsTabContentProps = {
  emailVerified: boolean;
  articlesStatus: string;
  articlesError: string | null | undefined;
  articles: IArticles[];
  articleAccessMenuArticleId: string | null;
  dashboardRowFlashes: Record<string, DashboardRowFlash>;
  ui: IInterface | null;
  lang: SupportedLang;
  onArticleAccessMenuChange: (articleId: string | null) => void;
  onArticleVisibilityChange: (articleId: string, visibility: TrackVisibility) => void;
  onEditArticle: (article: IArticles) => void;
  onDeleteArticle: (article: IArticles) => void;
  onCreateArticle: () => void;
  onPreloadCreateArticle?: () => void;
};

export function PostsTabContent({
  emailVerified,
  articlesStatus,
  articlesError,
  articles,
  articleAccessMenuArticleId,
  dashboardRowFlashes,
  ui,
  lang,
  onArticleAccessMenuChange,
  onArticleVisibilityChange,
  onEditArticle,
  onDeleteArticle,
  onCreateArticle,
  onPreloadCreateArticle,
}: PostsTabContentProps) {
  const createArticlePreloadHandlers = bindDashboardPreloadIntentHandlers(onPreloadCreateArticle);
  if (!emailVerified) {
    return <EmailVerificationOnboarding context="posts" />;
  }

  if (articlesStatus === 'loading' || (articlesStatus === 'idle' && articles.length === 0)) {
    return (
      <div className="user-dashboard__section">
        <DashboardLoadingState className="user-dashboard__tab-loading" />
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
    return (
      <ArticlesEmptyState
        ui={ui}
        onCreateArticle={onCreateArticle}
        onPreloadCreateArticle={onPreloadCreateArticle}
      />
    );
  }

  return (
    <div className="user-dashboard__section">
      <div className="user-dashboard__albums-list">
        {articles.map((article) => {
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
          const editLabel = ui?.dashboard?.editArticle ?? 'Edit Article';
          const openEditor = () => onEditArticle(article);

          const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openEditor();
            }
          };

          return (
            <DashboardCard
              key={article.articleId}
              interactive
              className={clsx(
                'user-dashboard__album-card',
                'dashboard-article-row',
                articleRowFlash.className
              )}
              style={articleRowFlash.style}
              data-visibility-flash={articleRowFlash['data-visibility-flash']}
            >
              <div
                id={`dashboard-article-row-${article.articleId}`}
                className={clsx('user-dashboard__album-header', 'user-dashboard__album-item', {
                  'user-dashboard__album-item--access-menu-open':
                    articleAccessMenuArticleId === article.articleId,
                })}
                onClick={openEditor}
                onKeyDown={handleRowKeyDown}
                role="button"
                tabIndex={0}
                aria-label={article.nameArticle || editLabel}
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
                  <div className="user-dashboard__expanded-track-actions">
                    <DashboardButton
                      variant="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditor();
                      }}
                      aria-label={editLabel}
                    >
                      <PencilIcon {...dashboardActionIconProps()} />
                    </DashboardButton>
                    <DashboardButton
                      variant="icon"
                      destructive
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteArticle(article);
                      }}
                      aria-label={ui?.dashboard?.deleteArticle ?? 'Delete article'}
                    >
                      <Trash2Icon {...dashboardActionIconProps()} />
                    </DashboardButton>
                  </div>
                </div>
              </div>
            </DashboardCard>
          );
        })}
      </div>

      <div className="user-dashboard__albums-upload-divider" aria-hidden />

      <div className="user-dashboard__upload-action">
        <DashboardButton
          variant="primary"
          onClick={onCreateArticle}
          {...createArticlePreloadHandlers}
        >
          {ui?.dashboard?.uploadNewArticle ?? 'Upload New Article'}
        </DashboardButton>
      </div>
    </div>
  );
}
