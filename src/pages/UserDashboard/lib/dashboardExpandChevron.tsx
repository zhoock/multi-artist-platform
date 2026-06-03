import { ChevronDown as ChevronDownIcon, ChevronRight as ChevronRightIcon } from 'lucide-react';

import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

const expandChevronIconProps = dashboardActionIconProps({
  size: 18,
  className: 'user-dashboard__album-arrow-icon',
});

type DashboardExpandChevronProps = {
  expanded: boolean;
};

export function DashboardExpandChevron({ expanded }: DashboardExpandChevronProps) {
  if (expanded) {
    return <ChevronDownIcon {...expandChevronIconProps} />;
  }

  return <ChevronRightIcon {...expandChevronIconProps} />;
}
