import { useState, useCallback, useEffect, type RefObject } from 'react';

import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import { usePremiumSubscription } from '@features/premiumSubscription';
import { ARCHIVE_CHANGED_EVENT } from '@features/artistArchive';
import { isEmailVerified } from '@shared/lib/auth';
import { useEmailVerificationCopy } from '@shared/lib/emailVerification';
import {
  SUBSCRIPTION_PLAN_SLUGS,
  resolveActiveScheduledPlanChange,
  resolvePlanChangeAction,
  shouldConfirmSubscriptionPlanChange,
  type SubscriptionPlanSlug,
} from '@shared/lib/payment/subscriptionPlans';
import { useSubscriptionBilling } from '@shared/lib/subscription/useSubscriptionBilling';
import { isSubscriptionAutoRenewClientEnabled } from '@shared/lib/subscription/isSubscriptionAutoRenewClientEnabled';
import { useAuthSessionUser } from '@shared/lib/hooks/useAuthSessionUser';
import { LocalModal } from '@shared/ui/localModal';
import { AlertModal } from '@shared/ui/alertModal';
import {
  ScheduleDowngradeConfirmModal,
  UpgradePlanConfirmModal,
} from '@pages/UserDashboard/components/archive/billingModals';

import { SubscriptionPlanCard } from './SubscriptionPlanCard';
import { SubscriptionPricingAutopaymentDisclosure } from './SubscriptionPricingAutopaymentDisclosure';
import { SubscriptionPlanChangeConfirmModal } from './SubscriptionPlanChangeConfirmModal';
import { SubscriptionPlanScheduledBanner } from './SubscriptionPlanScheduledBanner';
import { ScheduledPlanChangeDetailsModal } from './ScheduledPlanChangeDetailsModal';
import type { CloseArchiveAccessModalOptions } from './archiveAccessModalContext';
import { useSubscriptionCheckout } from './useSubscriptionCheckout';

import './archiveAccessModal.style.scss';

type Props = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onClose: (options?: CloseArchiveAccessModalOptions) => void;
};

type PendingPlanFlow = 'upgrade' | 'downgrade' | 'legacy';

function formatEffectiveDate(iso: string | null, lang: 'en' | 'ru'): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function ArchiveAccessModalView({ dialogRef, onClose }: Props) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const viewer = useAuthSessionUser();
  const emailCopy = useEmailVerificationCopy();
  const { planSlug: resolvedPlanSlug, billing, slotsLimit, refetch } = usePremiumSubscription();
  const currentPlanSlug = resolvedPlanSlug;
  const hasActivePremium = billing.hasPremiumAccess;
  const [loadingPlan, setLoadingPlan] = useState<SubscriptionPlanSlug | null>(null);
  const [pendingPlanChange, setPendingPlanChange] = useState<SubscriptionPlanSlug | null>(null);
  const [pendingFlow, setPendingFlow] = useState<PendingPlanFlow | null>(null);
  const [alertModal, setAlertModal] = useState<{ message: string } | null>(null);
  const [scheduledDetailsOpen, setScheduledDetailsOpen] = useState(false);
  const { startCheckout } = useSubscriptionCheckout({ onClose });
  const {
    scheduleDowngrade,
    cancelScheduledDowngrade,
    loading: scheduleLoading,
  } = useSubscriptionBilling();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const emailBlocked = Boolean(viewer && !isEmailVerified(viewer));
  const collectionCopy = ui?.dashboard?.collection;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleShow = () => {
      void refetch();
    };

    dialog.addEventListener('show', handleShow);
    return () => dialog.removeEventListener('show', handleShow);
  }, [dialogRef, refetch]);

  const title =
    ui?.titles?.subscriptionPlanPickerTitle ??
    (lang === 'en' ? 'Choose your plan' : 'Выберите план');
  const subtitle =
    ui?.titles?.subscriptionPlanPickerSubtitle ??
    (lang === 'en'
      ? 'Support more artists and unlock more music.'
      : 'Поддержите больше артистов и откройте больше музыки.');
  const closeLabel = ui?.buttons?.articleLockedDialogClose ?? (lang === 'en' ? 'Close' : 'Закрыть');

  const scheduledPlanChange = resolveActiveScheduledPlanChange({
    scheduledPlan: billing.scheduledPlan,
    effectiveFrom: billing.expiresAt ?? billing.nextChargeAt,
    hasPremiumAccess: billing.hasPremiumAccess,
    currentPlanSlug,
  });
  const scheduledEffectiveDateLabel = scheduledPlanChange
    ? formatEffectiveDate(scheduledPlanChange.effectiveFrom, lang)
    : null;
  const scheduledBannerTitleTemplate =
    ui?.titles?.subscriptionPlanScheduledBannerTitle ??
    (lang === 'en' ? 'Transition to {plan} scheduled' : 'Переход на {plan} запланирован');
  const scheduledBannerBodyTemplate =
    ui?.titles?.subscriptionPlanScheduledBannerBody ??
    (lang === 'en'
      ? 'It will take effect on {date} at the next renewal.'
      : 'Он вступит в силу {date} при следующем продлении.');
  const scheduledBannerDetailsLabel =
    ui?.titles?.subscriptionPlanScheduledBannerDetails ?? (lang === 'en' ? 'Details' : 'Подробнее');
  const alertModalTitle = ui?.dashboard?.error ?? (lang === 'en' ? 'Error' : 'Ошибка');
  const alertModalButtonText = ui?.buttons?.ok ?? (lang === 'en' ? 'OK' : 'OK');
  const showPricingAutopaymentDisclosure = isSubscriptionAutoRenewClientEnabled();

  const showErrorAlert = useCallback((message: string) => {
    setAlertModal({ message });
  }, []);

  const proceedToCheckout = useCallback(
    async (planSlug: SubscriptionPlanSlug, intent?: 'upgrade') => {
      setLoadingPlan(planSlug);
      setAlertModal(null);

      const result = await startCheckout(planSlug, intent ? { intent } : undefined);

      if (!result.ok) {
        showErrorAlert(result.error);
        setLoadingPlan(null);
        return;
      }

      if (result.redirected === 'auth') {
        setLoadingPlan(null);
      }
    },
    [showErrorAlert, startCheckout]
  );

  const handleCancelScheduledChange = useCallback(async () => {
    if (!scheduledPlanChange || loadingPlan || scheduleLoading) return;

    setAlertModal(null);
    setLoadingPlan(scheduledPlanChange.targetPlanSlug);

    try {
      const result = await cancelScheduledDowngrade();

      if (!result.ok) {
        showErrorAlert(
          result.error ??
            collectionCopy?.billingPlanChangeError ??
            (lang === 'en'
              ? 'Could not cancel scheduled change'
              : 'Не удалось отменить запланированную смену')
        );
        return;
      }

      window.dispatchEvent(new CustomEvent(ARCHIVE_CHANGED_EVENT));
      await refetch();
    } finally {
      setLoadingPlan(null);
    }
  }, [
    cancelScheduledDowngrade,
    collectionCopy?.billingPlanChangeError,
    lang,
    loadingPlan,
    refetch,
    scheduleLoading,
    scheduledPlanChange,
    showErrorAlert,
  ]);

  const handleSelectPlan = useCallback(
    (planSlug: SubscriptionPlanSlug) => {
      setAlertModal(null);

      if (scheduledPlanChange && planSlug === scheduledPlanChange.targetPlanSlug) {
        void handleCancelScheduledChange();
        return;
      }

      if (!shouldConfirmSubscriptionPlanChange(currentPlanSlug, planSlug)) {
        void proceedToCheckout(planSlug);
        return;
      }

      const action = resolvePlanChangeAction({
        currentPlanSlug,
        targetPlanSlug: planSlug,
        billingStatus: billing.status,
        hasPremiumAccess: billing.hasPremiumAccess,
      });

      if (action === 'blocked_downgrade') {
        showErrorAlert(
          collectionCopy?.billingDowngradeBlockedError ??
            (lang === 'en'
              ? 'Restore your support first — downgrades are only available with an active subscription.'
              : 'Сначала восстановите поддержку — понижение тарифа доступно только при активной подписке.')
        );
        return;
      }

      if (action === 'checkout') {
        setPendingFlow('legacy');
      } else {
        setPendingFlow(action);
      }

      setPendingPlanChange(planSlug);
    },
    [
      billing.hasPremiumAccess,
      billing.status,
      collectionCopy?.billingDowngradeBlockedError,
      currentPlanSlug,
      handleCancelScheduledChange,
      lang,
      proceedToCheckout,
      scheduledPlanChange,
      showErrorAlert,
    ]
  );

  const handleCancelPlanChange = useCallback(() => {
    if (loadingPlan || scheduleLoading) return;
    setPendingPlanChange(null);
    setPendingFlow(null);
  }, [loadingPlan, scheduleLoading]);

  const handleConfirmPlanChange = useCallback(async () => {
    if (!pendingPlanChange || !currentPlanSlug || loadingPlan || scheduleLoading) return;

    const planSlug = pendingPlanChange;
    const flow = pendingFlow;

    if (flow === 'upgrade') {
      setPendingPlanChange(null);
      setPendingFlow(null);
      void proceedToCheckout(planSlug, 'upgrade');
      return;
    }

    if (flow === 'downgrade') {
      setAlertModal(null);
      const result = await scheduleDowngrade(planSlug);

      if (!result.ok) {
        if (result.code === 'FEATURE_DISABLED') {
          setPendingFlow('legacy');
          return;
        }
        showErrorAlert(
          result.error ??
            collectionCopy?.billingPlanChangeError ??
            (lang === 'en' ? 'Could not change plan' : 'Не удалось изменить тариф')
        );
        return;
      }

      window.dispatchEvent(new CustomEvent(ARCHIVE_CHANGED_EVENT));
      await refetch();
      setPendingPlanChange(null);
      setPendingFlow(null);
      return;
    }

    setPendingPlanChange(null);
    setPendingFlow(null);
    void proceedToCheckout(planSlug);
  }, [
    collectionCopy?.billingPlanChangeError,
    currentPlanSlug,
    lang,
    loadingPlan,
    pendingFlow,
    pendingPlanChange,
    proceedToCheckout,
    refetch,
    scheduleDowngrade,
    scheduleLoading,
    showErrorAlert,
  ]);

  const effectiveDateLabel = formatEffectiveDate(billing.expiresAt, lang);
  const confirmLoading = Boolean(
    pendingPlanChange && (loadingPlan === pendingPlanChange || scheduleLoading)
  );

  return (
    <>
      <LocalModal
        dialogRef={dialogRef}
        className="subscription-plan-modal"
        aria-labelledby="subscription-plan-modal-title"
        onClose={onClose}
      >
        <div className="subscription-plan-modal__card">
          <header className="subscription-plan-modal__header">
            <div className="subscription-plan-modal__heading">
              <h2 id="subscription-plan-modal-title" className="subscription-plan-modal__title">
                {title}
              </h2>
              <p className="subscription-plan-modal__subtitle">{subtitle}</p>
            </div>
            <button
              type="button"
              className="subscription-plan-modal__close"
              aria-label={closeLabel}
              onClick={() => onClose()}
            >
              <ModalCloseIcon />
            </button>
          </header>

          {scheduledPlanChange && scheduledEffectiveDateLabel ? (
            <SubscriptionPlanScheduledBanner
              targetPlanSlug={scheduledPlanChange.targetPlanSlug}
              effectiveDateLabel={scheduledEffectiveDateLabel}
              titleTemplate={scheduledBannerTitleTemplate}
              bodyTemplate={scheduledBannerBodyTemplate}
              detailsLabel={scheduledBannerDetailsLabel}
              onDetails={() => setScheduledDetailsOpen(true)}
            />
          ) : null}

          <div className="subscription-plan-modal__plans" role="list">
            {SUBSCRIPTION_PLAN_SLUGS.map((planSlug) => (
              <SubscriptionPlanCard
                key={planSlug}
                planSlug={planSlug}
                currentPlanSlug={currentPlanSlug}
                scheduledTargetPlanSlug={scheduledPlanChange?.targetPlanSlug ?? null}
                isPremium={hasActivePremium}
                lang={lang}
                ui={ui}
                loadingPlan={
                  loadingPlan ??
                  (scheduleLoading && scheduledPlanChange
                    ? scheduledPlanChange.targetPlanSlug
                    : null)
                }
                onSelect={(slug) => void handleSelectPlan(slug)}
              />
            ))}
          </div>

          {showPricingAutopaymentDisclosure ? (
            <SubscriptionPricingAutopaymentDisclosure lang={lang} ui={ui} />
          ) : null}

          {emailBlocked ? (
            <p className="subscription-plan-modal__error" role="status">
              {emailCopy.restrictedPremium ??
                (lang === 'en'
                  ? 'Verify your email to start support'
                  : 'Подтвердите email, чтобы начать поддержку')}
            </p>
          ) : null}
        </div>
      </LocalModal>

      {pendingPlanChange && currentPlanSlug && pendingFlow === 'upgrade' ? (
        <UpgradePlanConfirmModal
          isOpen
          currentPlanSlug={currentPlanSlug}
          targetPlanSlug={pendingPlanChange}
          loading={confirmLoading}
          onCancel={handleCancelPlanChange}
          onConfirm={() => void handleConfirmPlanChange()}
        />
      ) : null}

      {pendingPlanChange && currentPlanSlug && pendingFlow === 'downgrade' ? (
        <ScheduleDowngradeConfirmModal
          isOpen
          currentPlanSlug={currentPlanSlug}
          targetPlanSlug={pendingPlanChange}
          effectiveDateLabel={effectiveDateLabel}
          loading={confirmLoading}
          onCancel={handleCancelPlanChange}
          onConfirm={() => void handleConfirmPlanChange()}
        />
      ) : null}

      {pendingPlanChange && currentPlanSlug && pendingFlow === 'legacy' ? (
        <SubscriptionPlanChangeConfirmModal
          isOpen
          currentPlanSlug={currentPlanSlug}
          targetPlanSlug={pendingPlanChange}
          loading={confirmLoading}
          onCancel={handleCancelPlanChange}
          onConfirm={() => void handleConfirmPlanChange()}
        />
      ) : null}

      {scheduledPlanChange && currentPlanSlug && scheduledDetailsOpen ? (
        <ScheduledPlanChangeDetailsModal
          isOpen
          currentPlanSlug={currentPlanSlug}
          targetPlanSlug={scheduledPlanChange.targetPlanSlug}
          effectiveDateLabel={scheduledEffectiveDateLabel}
          onClose={() => setScheduledDetailsOpen(false)}
        />
      ) : null}

      {alertModal ? (
        <AlertModal
          isOpen
          variant="error"
          title={alertModalTitle}
          message={alertModal.message}
          buttonText={alertModalButtonText}
          closeLabel={closeLabel}
          onClose={() => setAlertModal(null)}
        />
      ) : null}
    </>
  );
}
