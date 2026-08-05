import clsx from 'clsx';
import { CreditCard, Lock, Plus, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { DashboardButton } from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import { Popup, PopupCloseButton } from '@shared/ui/popup';

import './billingModals.scss';

type BillingModalShellProps = {
  isOpen: boolean;
  titleId: string;
  headerIcon: LucideIcon;
  title: string;
  closeLabel: string;
  loading?: boolean;
  onClose: () => void;
  children: ReactNode;
  footerNote: string;
  cancelLabel: string;
  confirmLabel: string;
  onConfirm: () => void;
};

export function BillingModalShell({
  isOpen,
  titleId,
  headerIcon: HeaderIcon,
  title,
  closeLabel,
  loading = false,
  onClose,
  children,
  footerNote,
  cancelLabel,
  confirmLabel,
  onConfirm,
}: BillingModalShellProps) {
  return (
    <Popup
      isActive={isOpen}
      onClose={onClose}
      closeBlocked={loading}
      publicBackdrop
      aria-labelledby={titleId}
    >
      <div className="billing-modal">
        <div className="billing-modal__card">
          <div className="billing-modal__topbar">
            <span className="billing-modal__header-icon" aria-hidden>
              <HeaderIcon {...dashboardActionIconProps({ size: 20 })} />
            </span>
            <PopupCloseButton
              type="button"
              className="billing-modal__close"
              aria-label={closeLabel}
              disabled={loading}
            >
              <ModalCloseIcon />
            </PopupCloseButton>
          </div>

          <h2 id={titleId} className="billing-modal__title">
            {title}
          </h2>

          <div className="billing-modal__body">{children}</div>

          <footer className="dashboard-modal-footer billing-modal__actions">
            <DashboardButton variant="outline" disabled={loading} onClick={onClose}>
              {cancelLabel}
            </DashboardButton>
            <DashboardButton
              variant="outline"
              className="billing-modal__primary-button"
              loading={loading}
              disabled={loading}
              onClick={onConfirm}
            >
              {confirmLabel}
            </DashboardButton>
          </footer>

          <p className="billing-modal__footer-note">
            <Lock className="billing-modal__footer-note-icon" size={14} aria-hidden />
            {footerNote}
          </p>
        </div>
      </div>
    </Popup>
  );
}

type BillingModalInfoCardProps = {
  icon: LucideIcon;
  title: string;
  variant?: 'accent' | 'neutral';
  mutedIcon?: boolean;
  children: ReactNode;
};

export function BillingModalInfoCard({
  icon: Icon,
  title,
  variant = 'accent',
  mutedIcon = false,
  children,
}: BillingModalInfoCardProps) {
  return (
    <div className={clsx('billing-modal__info-card', `billing-modal__info-card--${variant}`)}>
      <span
        className={clsx('billing-modal__info-icon', mutedIcon && 'billing-modal__info-icon--muted')}
        aria-hidden
      >
        <Icon {...dashboardActionIconProps({ size: 18 })} />
      </span>
      <div className="billing-modal__info-content">
        <p className="billing-modal__info-title">{title}</p>
        {children}
      </div>
    </div>
  );
}

export function BillingModalIntro({ children }: { children: ReactNode }) {
  return <p className="billing-modal__intro">{children}</p>;
}

export function BillingModalNote({ children }: { children: ReactNode }) {
  return <p className="billing-modal__note">{children}</p>;
}

export function BillingModalInfoText({ children }: { children: ReactNode }) {
  return <p className="billing-modal__info-text">{children}</p>;
}

export function BillingModalPaymentAddIcon() {
  return (
    <span className="billing-modal__empty-icon billing-modal__empty-icon--payment-add" aria-hidden>
      <CreditCard {...dashboardActionIconProps({ size: 22, strokeWidth: 1.5 })} />
      <Plus
        className="billing-modal__empty-icon-plus"
        {...dashboardActionIconProps({ size: 12, strokeWidth: 2 })}
      />
    </span>
  );
}

export function BillingModalEmptyState({
  icon: Icon,
  iconVariant,
  title,
  body,
}: {
  icon?: LucideIcon;
  iconVariant?: 'payment-add';
  title: string;
  body: string;
}) {
  const iconNode =
    iconVariant === 'payment-add' ? (
      <BillingModalPaymentAddIcon />
    ) : Icon ? (
      <span className="billing-modal__empty-icon" aria-hidden>
        <Icon {...dashboardActionIconProps({ size: 22 })} />
      </span>
    ) : null;

  return (
    <div className="billing-modal__empty-state">
      {iconNode}
      <p className="billing-modal__empty-title">{title}</p>
      <p className="billing-modal__empty-text">{body}</p>
    </div>
  );
}

export function BillingModalLinkButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="billing-modal__link-button"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function BillingModalDateHighlight({ children }: { children: ReactNode }) {
  return <span className="billing-modal__info-highlight">{children}</span>;
}
