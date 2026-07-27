import { ShoppingBag as ShoppingBagIcon } from 'lucide-react';

import type { IInterface } from '@models';
import { DashboardEmptyState } from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

type MyPurchasesEmptyStateProps = {
  ui: IInterface | null | undefined;
};

const PURCHASES_EMPTY_ICON_SIZE = 108;

export function MyPurchasesEmptyState({ ui }: MyPurchasesEmptyStateProps) {
  const copy = ui?.dashboard?.myPurchases;

  return (
    <DashboardEmptyState
      variant="tab"
      icon={<ShoppingBagIcon {...dashboardActionIconProps({ size: PURCHASES_EMPTY_ICON_SIZE })} />}
      title={copy?.emptyTitle ?? 'No purchases yet'}
      description={
        copy?.emptyDescription ??
        'Purchased albums will appear here.\nYou can download them anytime.'
      }
      descriptionMultiline
    />
  );
}
