import { ShoppingBag as ShoppingBagIcon } from 'lucide-react';

import type { IInterface } from '@models';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

type MyPurchasesEmptyStateProps = {
  ui: IInterface | null | undefined;
};

const PURCHASES_EMPTY_ICON_SIZE = 108;

export function MyPurchasesEmptyState({ ui }: MyPurchasesEmptyStateProps) {
  const copy = ui?.dashboard?.myPurchases;

  return (
    <div className="user-dashboard__tab-empty" role="status">
      <div className="user-dashboard__tab-empty-inner">
        <ShoppingBagIcon
          className="user-dashboard__tab-empty-icon"
          {...dashboardActionIconProps({ size: PURCHASES_EMPTY_ICON_SIZE })}
        />
        <h3 className="user-dashboard__tab-empty-title">
          {copy?.emptyTitle ?? 'No purchases yet'}
        </h3>
        <p className="user-dashboard__tab-empty-description user-dashboard__tab-empty-description--multiline">
          {copy?.emptyDescription ??
            'Purchased albums will appear here.\nYou can download them and get access to updates.'}
        </p>
      </div>
    </div>
  );
}
