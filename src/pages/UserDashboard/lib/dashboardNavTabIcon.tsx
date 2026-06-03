import {
  CreditCard as CreditCardIcon,
  Disc as DiscIcon,
  FileText as FileTextIcon,
  Link2 as Link2Icon,
  Lock as LockIcon,
  ShoppingBag as ShoppingBagIcon,
  SlidersHorizontal as SlidersHorizontalIcon,
  User as UserIcon,
  type LucideIcon,
} from 'lucide-react';

import type { DashboardTab } from '@shared/lib/accountType';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

const DASHBOARD_NAV_TAB_ICONS: Record<DashboardTab, LucideIcon> = {
  profile: UserIcon,
  albums: DiscIcon,
  posts: FileTextIcon,
  mixer: SlidersHorizontalIcon,
  archive: LockIcon,
  'payment-settings': CreditCardIcon,
  'my-purchases': ShoppingBagIcon,
  'social-links': Link2Icon,
};

export function DashboardNavTabIcon({ tab }: { tab: DashboardTab }) {
  const Icon = DASHBOARD_NAV_TAB_ICONS[tab];

  return (
    <Icon
      {...dashboardActionIconProps({
        size: 16,
        className: 'user-dashboard__nav-item-icon',
      })}
    />
  );
}
