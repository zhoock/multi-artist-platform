import React from 'react';
import '@shared/ui/skeleton/skeleton.scss';
import './articles/ArticlesListSkeleton.scss';

/**
 * Скелетон вкладки Settings — hero + поля + действия.
 */
export function SettingsTabSkeleton() {
  return (
    <div
      className="user-dashboard__tab-skeleton user-dashboard__settings-tab-skeleton"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="skeleton skeleton--bar skeleton--bar-title user-dashboard__tab-skeleton-title" />
      <div className="user-dashboard__settings-skeleton-inner">
        <div className="user-dashboard__settings-skeleton-hero">
          <div className="user-dashboard__settings-skeleton-avatar-wrap">
            <div className="skeleton skeleton--image user-dashboard__settings-skeleton-avatar-circle" />
          </div>
          <div className="skeleton skeleton--bar skeleton--bar-medium user-dashboard__settings-skeleton-name" />
          <div className="skeleton skeleton--bar skeleton--bar-short user-dashboard__settings-skeleton-status" />
          <div className="skeleton skeleton--bar user-dashboard__settings-skeleton-description" />
          <div className="skeleton skeleton--bar skeleton--bar-medium user-dashboard__settings-skeleton-open" />
        </div>

        {[0, 1].map((i) => (
          <div key={i} className="user-dashboard__settings-skeleton-field">
            <div className="skeleton skeleton--bar skeleton--bar-short" />
            <div className="skeleton skeleton--bar skeleton--bar-medium user-dashboard__settings-skeleton-input" />
          </div>
        ))}

        <div className="user-dashboard__settings-skeleton-actions">
          <div className="skeleton skeleton--bar skeleton--bar-medium user-dashboard__settings-skeleton-btn" />
          <div className="skeleton skeleton--bar skeleton--bar-medium user-dashboard__settings-skeleton-btn" />
        </div>
      </div>
    </div>
  );
}
