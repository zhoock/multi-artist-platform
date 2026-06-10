import './ArticleEditSkeleton.scss';

export function ArticleEditSkeleton() {
  return (
    <div className="edit-article-v2">
      <div className="edit-article-v2__container">
        {/* Header skeleton */}
        <div className="edit-article-v2__header">
          <div className="edit-article-v2__history">
            <div className="skeleton skeleton--bar skeleton--bar-button" />
            <div className="skeleton skeleton--bar skeleton--bar-button" />
          </div>
          <div className="edit-article-v2__header-end">
            <div className="skeleton skeleton--bar skeleton--bar-status" />
            <div className="skeleton skeleton--bar skeleton--bar-button" />
          </div>
        </div>

        {/* Content skeleton */}
        <div className="edit-article-v2__content">
          <div className="edit-article-v2__content-column">
            <div className="skeleton skeleton--bar skeleton--bar-title" />
            <div className="article-edit-skeleton__top">
              <div className="skeleton skeleton--bar skeleton--bar-short" />
              <div className="skeleton skeleton--bar skeleton--bar-medium" />
              <div className="skeleton skeleton--bar skeleton--bar-short" />
            </div>
            <div className="skeleton skeleton--content-area" />
          </div>
        </div>
      </div>
    </div>
  );
}
