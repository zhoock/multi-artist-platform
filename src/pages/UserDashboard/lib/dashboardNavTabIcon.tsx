import {
  CreditCard as CreditCardIcon,
  Disc as DiscIcon,
  FileText as FileTextIcon,
  HeartHandshake as HeartHandshakeIcon,
  Link2 as Link2Icon,
  ShoppingBag as ShoppingBagIcon,
  Settings as SettingsIcon,
  SlidersHorizontal as SlidersHorizontalIcon,
  type LucideIcon,
} from 'lucide-react';

import type { DashboardTab } from '@shared/lib/accountType';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

const DASHBOARD_NAV_TAB_ICONS: Record<DashboardTab, LucideIcon> = {
  settings: SettingsIcon,
  albums: DiscIcon,
  posts: FileTextIcon,
  mixer: SlidersHorizontalIcon,
  collection: HeartHandshakeIcon,
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
