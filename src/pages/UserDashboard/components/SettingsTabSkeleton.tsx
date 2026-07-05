import React from 'react';
import '@shared/ui/skeleton/skeleton.scss';
import './articles/ArticlesListSkeleton.scss';

/**
 * Скелетон вкладки Settings — секции настроек.
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
        {[0, 1, 2, 3, 4, 5].map((section) => (
          <div key={section} className="user-dashboard__settings-skeleton-section">
            <div className="skeleton skeleton--bar skeleton--bar-short user-dashboard__settings-skeleton-section-title" />
            <div className="user-dashboard__settings-skeleton-card">
              {[0, 1, 2].map((row) => (
                <div key={row} className="user-dashboard__settings-skeleton-field">
                  <div className="skeleton skeleton--bar skeleton--bar-short" />
                  <div className="skeleton skeleton--bar skeleton--bar-medium user-dashboard__settings-skeleton-input" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
