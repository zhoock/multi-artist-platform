import { type CSSProperties } from 'react';

import { DashboardCard } from '@shared/ui/dashboard';

export type CollectionSlotsIndicatorCopy = {
  sectionLabel: string;
  usageCount: string;
  activeSlotsLabel: string;
};

type Props = {
  slotsUsed: number;
  slotsLimit: number;
  copy: CollectionSlotsIndicatorCopy;
};

export function CollectionSlotsIndicator({ slotsUsed, slotsLimit, copy }: Props) {
  const usageCountLabel = copy.usageCount
    .replace('{used}', String(slotsUsed))
    .replace('{limit}', String(slotsLimit));
  const slotsProgress =
    slotsLimit <= 0 ? 0 : Math.min(100, Math.round((slotsUsed / slotsLimit) * 100));

  return (
    <DashboardCard className="collection-billing__usage-card collection__slots-indicator">
      <h3 className="collection-billing__section-title">{copy.sectionLabel}</h3>
      <p className="collection-billing__usage-count">
        <span className="collection-billing__usage-count-value">{usageCountLabel}</span>{' '}
        {copy.activeSlotsLabel}
      </p>
      <div
        className="collection-billing__usage-progress"
        aria-hidden
        style={{ '--collection-slots-progress': `${slotsProgress}%` } as CSSProperties}
      >
        <span className="collection-billing__usage-progress-fill" />
      </div>
    </DashboardCard>
  );
}
