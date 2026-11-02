import type { ReactNode } from 'react';

import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import { Popup, PopupCloseButton } from '@shared/ui/popup';

import './AudienceAnalyticsListModal.scss';

type AudienceAnalyticsListModalShellProps = {
  isOpen: boolean;
  titleId: string;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
};

/**
 * Full-screen list surface — same Popup + `dashboard-fullscreen-shell` pattern as Edit Album / Edit Article.
 */
export function AudienceAnalyticsListModalShell({
  isOpen,
  titleId,
  title,
  closeLabel,
  onClose,
  children,
}: AudienceAnalyticsListModalShellProps) {
  return (
    <Popup isActive={isOpen} onClose={onClose} aria-labelledby={titleId}>
      <div className="audience-analytics-fullscreen">
        <div className="audience-analytics-fullscreen__card">
          <header className="audience-analytics-fullscreen__header">
            <h2 id={titleId} className="audience-analytics-fullscreen__title">
              {title}
            </h2>
            <PopupCloseButton
              type="button"
              className="audience-analytics-fullscreen__close"
              aria-label={closeLabel}
            >
              <ModalCloseIcon />
            </PopupCloseButton>
          </header>
          <div className="audience-analytics-fullscreen__body">
            <div className="audience-analytics-fullscreen__content-column">{children}</div>
          </div>
        </div>
      </div>
    </Popup>
  );
}
