import React from 'react';
import clsx from 'clsx';
import { Pencil as PencilIcon, Trash2 as Trash2Icon } from 'lucide-react';

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
import {
  DashboardCard,
  DashboardCta,
  DashboardExpandableRowTrigger,
  DashboardIconButton,
} from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
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

type PostsTabContentProps = {
  emailVerified: boolean;
  articlesStatus: string;
  articlesError: string | null | undefined;
  articles: IArticles[];
  expandedArticleId: string | null;
  articleAccessMenuArticleId: string | null;
  dashboardRowFlashes: Record<string, DashboardRowFlash>;
  ui: IInterface | null;
  lang: SupportedLang;
  onToggleArticle: (articleId: string | null) => void;
  onArticleAccessMenuChange: (articleId: string | null) => void;
  onArticleVisibilityChange: (articleId: string, visibility: TrackVisibility) => void;
  onEditArticle: (article: IArticles) => void;
  onDeleteArticle: (article: IArticles) => void;
  onCreateArticle: () => void;
};

export function PostsTabContent({
  emailVerified,
  articlesStatus,
  articlesError,
  articles,
  expandedArticleId,
  articleAccessMenuArticleId,
  dashboardRowFlashes,
  ui,
  lang,
  onToggleArticle,
  onArticleAccessMenuChange,
  onArticleVisibilityChange,
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
        {articles.map((article) => {
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
          const preview = isExpanded ? getArticlePreviewContent(article) : null;

          return (
            <DashboardCard
              key={article.articleId}
              interactive
              className={clsx(
                'user-dashboard__album-card',
                'dashboard-article-row',
                articleRowFlash.className,
                {
                  'user-dashboard__album-card--expanded': isExpanded,
                }
              )}
              style={articleRowFlash.style}
              data-visibility-flash={articleRowFlash['data-visibility-flash']}
            >
              <DashboardExpandableRowTrigger
                id={`dashboard-article-row-${article.articleId}`}
                expanded={isExpanded}
                onToggle={() => onToggleArticle(isExpanded ? null : article.articleId)}
                aria-label={isExpanded ? 'Collapse article' : 'Expand article'}
                className={clsx('user-dashboard__album-header', 'user-dashboard__album-item', {
                  'user-dashboard__album-item--access-menu-open':
                    articleAccessMenuArticleId === article.articleId,
                })}
              >
                <span className="user-dashboard__expanded-track-chevron" aria-hidden>
                  <DashboardExpandChevron expanded={isExpanded} />
                </span>
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
                    <DashboardIconButton
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditArticle(article);
                      }}
                      aria-label={ui?.dashboard?.editArticle ?? 'Edit Article'}
                    >
                      <PencilIcon {...dashboardActionIconProps()} />
                    </DashboardIconButton>
                    <DashboardIconButton
                      destructive
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteArticle(article);
                      }}
                      aria-label={ui?.dashboard?.deleteArticle ?? 'Delete article'}
                    >
                      <Trash2Icon {...dashboardActionIconProps()} />
                    </DashboardIconButton>
                  </div>
                </div>
              </DashboardExpandableRowTrigger>

              {isExpanded && preview ? (
                <div className="user-dashboard__album-body user-dashboard__album-expanded user-dashboard__album-expanded--kit user-dashboard__album-expanded--article">
                  <div className="user-dashboard__article-description">
                    {renderMarkdownViaRichText(preview.markdown)}
                    {preview.truncated ? '\u2026' : null}
                  </div>
                </div>
              ) : null}
            </DashboardCard>
          );
        })}
      </div>

      <div className="user-dashboard__albums-upload-divider" aria-hidden />

      <div className="user-dashboard__upload-action">
        <DashboardCta onClick={onCreateArticle}>
          {ui?.dashboard?.uploadNewArticle ?? 'Upload New Article'}
        </DashboardCta>
      </div>
    </div>
  );
}
