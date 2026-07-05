import React from 'react';
import { DashboardCard } from '@shared/ui/dashboard';
import '@shared/ui/dashboard/style.scss';
import '@shared/ui/skeleton/skeleton.scss';
import './ArticlesListSkeleton.scss';

interface ArticlesListSkeletonProps {
  count?: number;
}

export function ArticlesListSkeleton({ count = 4 }: ArticlesListSkeletonProps) {
  return (
    <div className="user-dashboard__albums-list">
      {Array.from({ length: count }).map((_, index) => (
        <DashboardCard key={index} className="user-dashboard__album-item">
          <div className="user-dashboard__album-thumbnail user-dashboard__album-thumbnail--article">
            <div className="skeleton skeleton--image" />
          </div>
          <div className="user-dashboard__album-info">
            <div className="skeleton skeleton--bar skeleton--bar-title" />
            <div className="skeleton skeleton--bar skeleton--bar-medium" />
            <div className="skeleton skeleton--bar skeleton--bar-short" />
          </div>
          <div className="user-dashboard__album-arrow">
            <div className="skeleton skeleton--arrow" />
          </div>
        </DashboardCard>
      ))}
    </div>
  );
}
