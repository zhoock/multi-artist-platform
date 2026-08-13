import clsx from 'clsx';

import { DashboardButton, DashboardEmptyState } from '@shared/ui/dashboard';
import { AlertModal } from '@shared/ui/alertModal';
import { CreditCard as CreditCardIcon } from 'lucide-react';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

import {
  DisableAutoRenewConfirmModal,
  EnableAutoRenewConfirmModal,
  RebindPaymentMethodModal,
  UnlinkPaymentMethodConfirmModal,
} from './billingModals';
import { CollectionBillingSummary } from './CollectionBillingSummary';
import { useSubscriptionTabController } from './useSubscriptionTabController';

import './billingModals/billingModals.scss';
import './CollectionBillingSummary.scss';
import './SubscriptionContent.scss';

type Props = {
  active: boolean;
  onContentReady?: () => void;
  onContentBusy?: () => void;
  onMountPinChange?: (pinned: boolean) => void;
};

const SUBSCRIPTION_EMPTY_ICON_SIZE = 108;

export function SubscriptionContent({
  active,
  onContentReady,
  onContentBusy,
  onMountPinChange,
}: Props) {
  const controller = useSubscriptionTabController({
    active,
    onContentReady,
    onContentBusy,
    onMountPinChange,
  });

  const {
    lang,
    billing,
    billingScreen,
    billingOverlays,
    billingCopy,
    billingChargeLabel,
    planSlug,
    slotsUsed,
    autoRenewModal,
    setAutoRenewModal,
    unlinkModalOpen,
    setUnlinkModalOpen,
    unlinkModalError,
    setUnlinkModalError,
    renewLoading,
    autoRenewPatchLoading,
    autoRenewModalLoading,
    autoRenewActionsEnabled,
    alertModalMessage,
    setAlertModalMessage,
    alertModalTitle,
    alertModalCloseLabel,
    choosePlanCta,
    shouldBlockShell,
    handleBillingBannerAction,
    handleRenewCurrentPlan,
    handleConfirmAutoRenewPatch,
    handleConfirmAutoRenewRebind,
    handleOpenChangePaymentMethod,
    handleOpenUnlinkPaymentMethod,
    handleConfirmUnlinkPaymentMethod,
    handleDisableAutoRenew,
    handleChangePlan,
    handleUpgradePlan,
    handleCancelScheduledDowngrade,
    openSupportModal,
  } = controller;

  const errorAlertModal = alertModalMessage ? (
    <AlertModal
      isOpen
      title={alertModalTitle}
      message={alertModalMessage}
      variant="error"
      closeLabel={alertModalCloseLabel}
      onClose={() => setAlertModalMessage(null)}
    />
  ) : null;

  if (shouldBlockShell) {
    return errorAlertModal;
  }

  if (billingScreen === 'NONE') {
    return (
      <>
        <section className="subscription__tab subscription__tab--empty">
          <DashboardEmptyState
            variant="tab"
            icon={
              <CreditCardIcon
                {...dashboardActionIconProps({ size: SUBSCRIPTION_EMPTY_ICON_SIZE })}
              />
            }
            title={lang === 'en' ? 'No active subscription' : 'Нет активной подписки'}
            description={
              lang === 'en'
                ? 'Choose a plan to support artists and unlock premium features.'
                : 'Выберите тариф, чтобы поддерживать артистов и получить доступ к премиум-функциям.'
            }
            primaryAction={{
              label: choosePlanCta,
              onClick: () => openSupportModal(),
            }}
          />
        </section>
        {errorAlertModal}
      </>
    );
  }

  return (
    <>
      <DisableAutoRenewConfirmModal
        isOpen={autoRenewModal === 'disable'}
        nextChargeAt={billing.nextChargeAt}
        expiresAt={billing.expiresAt}
        loading={autoRenewModalLoading}
        onCancel={() => setAutoRenewModal(null)}
        onConfirm={() => void handleConfirmAutoRenewPatch()}
      />

      <EnableAutoRenewConfirmModal
        isOpen={autoRenewModal === 'enable'}
        planSlug={planSlug}
        chargeDateLabel={billingChargeLabel}
        nextChargeAt={billing.nextChargeAt}
        paymentMethodTitle={billing.paymentMethodTitle}
        loading={autoRenewModalLoading}
        onCancel={() => setAutoRenewModal(null)}
        onConfirm={() => void handleConfirmAutoRenewPatch()}
        onChangePaymentMethod={() => setAutoRenewModal('enable-rebind')}
      />

      <RebindPaymentMethodModal
        isOpen={autoRenewModal === 'enable-rebind' || autoRenewModal === 'rebind'}
        loading={autoRenewModalLoading}
        onCancel={() => setAutoRenewModal(null)}
        onConfirm={() => void handleConfirmAutoRenewRebind()}
      />

      <UnlinkPaymentMethodConfirmModal
        isOpen={unlinkModalOpen}
        paymentMethodTitle={billing.paymentMethodTitle}
        expiresAt={billing.expiresAt}
        showAutoRenewDisableNote={billingScreen === 'ACTIVE' && billing.autoRenewEnabled}
        loading={autoRenewModalLoading}
        errorMessage={unlinkModalError}
        onCancel={() => {
          setUnlinkModalOpen(false);
          setUnlinkModalError(null);
        }}
        onConfirm={() => void handleConfirmUnlinkPaymentMethod()}
      />

      <section
        className={clsx('subscription__tab', `subscription__tab--${billingScreen.toLowerCase()}`)}
      >
        <div className="user-dashboard__section">
          <div className="user-dashboard__albums-list">
            <CollectionBillingSummary
              screen={billingScreen}
              billing={billing}
              overlays={billingOverlays}
              slotsUsed={slotsUsed}
              lang={lang}
              copy={billingCopy}
              showUsageCard={false}
              changePlanLoading={renewLoading}
              bannerActionLoading={renewLoading || autoRenewPatchLoading}
              cancelScheduledDowngradeLoading={autoRenewPatchLoading}
              autoRenewActionsEnabled={autoRenewActionsEnabled}
              onChangePlan={handleChangePlan}
              onBannerAction={() => void handleBillingBannerAction()}
              onRenewCurrentPlan={() => void handleRenewCurrentPlan()}
              onUpgradePlan={handleUpgradePlan}
              onCancelScheduledDowngrade={() => void handleCancelScheduledDowngrade()}
              onDisableAutoRenew={
                autoRenewActionsEnabled && billingScreen === 'ACTIVE' && billing.autoRenewEnabled
                  ? handleDisableAutoRenew
                  : undefined
              }
              onChangePaymentMethod={
                autoRenewActionsEnabled && billing.hasSavedPaymentMethod
                  ? handleOpenChangePaymentMethod
                  : undefined
              }
              onUnlinkPaymentMethod={
                autoRenewActionsEnabled && billing.hasSavedPaymentMethod
                  ? handleOpenUnlinkPaymentMethod
                  : undefined
              }
            />
          </div>
        </div>
      </section>
      {errorAlertModal}
    </>
  );
}
