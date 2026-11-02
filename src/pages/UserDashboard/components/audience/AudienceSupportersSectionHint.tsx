import React from 'react';
import { CircleHelp as CircleHelpIcon } from 'lucide-react';

import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

import { useDashboardHoverTooltip } from '../../lib/useDashboardHoverTooltip';

type AudienceSupportersSectionHintProps = {
  ariaLabel: string;
  tooltipText: string;
};

export function AudienceSupportersSectionHint({
  ariaLabel,
  tooltipText,
}: AudienceSupportersSectionHintProps) {
  const {
    triggerRef,
    tooltipId,
    tooltipOpen,
    showTooltip,
    scheduleHideTooltip,
    togglePinnedTooltip,
    renderTooltipPortal,
  } = useDashboardHoverTooltip({
    tooltipClassName: 'audience-tab__panel-hint-tooltip audience-tab__panel-hint-tooltip--portal',
  });

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className="audience-tab__panel-title-hint"
        aria-label={ariaLabel}
        aria-expanded={tooltipOpen}
        aria-describedby={tooltipOpen ? tooltipId : undefined}
        onMouseEnter={showTooltip}
        onMouseLeave={scheduleHideTooltip}
        onClick={togglePinnedTooltip}
      >
        <CircleHelpIcon {...dashboardActionIconProps({ size: 14 })} aria-hidden />
      </button>
      {renderTooltipPortal(<p className="audience-tab__panel-hint-tooltip-text">{tooltipText}</p>)}
    </>
  );
}
