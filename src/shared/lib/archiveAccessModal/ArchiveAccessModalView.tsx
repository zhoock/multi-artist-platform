import { Users } from 'lucide-react';

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
  resolvePlanChangeAction,
  shouldConfirmSubscriptionPlanChange,
  type SubscriptionPlanSlug,
} from '@shared/lib/payment/subscriptionPlans';
import { useSubscriptionBilling } from '@shared/lib/subscription/useSubscriptionBilling';
import { useAuthSessionUser } from '@shared/lib/hooks/useAuthSessionUser';
import { LocalModal } from '@shared/ui/localModal';
import {
  ScheduleDowngradeConfirmModal,
  UpgradePlanConfirmModal,
} from '@pages/UserDashboard/components/archive/billingModals';

import { SubscriptionPlanCard } from './SubscriptionPlanCard';
import { SubscriptionPlanChangeConfirmModal } from './SubscriptionPlanChangeConfirmModal';
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
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const { startCheckout } = useSubscriptionCheckout({ onClose });
  const { scheduleDowngrade, loading: scheduleLoading } = useSubscriptionBilling();
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
  const footnote =
    ui?.titles?.archiveAccessFootnote?.trim() ??
    (lang === 'en'
      ? 'All plans distribute revenue equally among supported artists. Your support helps artists keep creating the music you love.'
      : 'Все планы распределяют доход поровну между поддерживаемыми артистами. Ваша поддержка помогает артистам создавать музыку.');

  const proceedToCheckout = useCallback(
    async (planSlug: SubscriptionPlanSlug, intent?: 'upgrade') => {
      setLoadingPlan(planSlug);
      setCheckoutError(null);

      const result = await startCheckout(planSlug, intent ? { intent } : undefined);

      if (!result.ok) {
        setCheckoutError(result.error);
        setLoadingPlan(null);
        return;
      }

      if (result.redirected === 'auth') {
        setLoadingPlan(null);
      }
    },
    [startCheckout]
  );

  const handleSelectPlan = useCallback(
    (planSlug: SubscriptionPlanSlug) => {
      setCheckoutError(null);

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
        setCheckoutError(
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
      lang,
      proceedToCheckout,
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
      setCheckoutError(null);
      const result = await scheduleDowngrade(planSlug);

      if (!result.ok) {
        if (result.code === 'FEATURE_DISABLED') {
          setPendingFlow('legacy');
          return;
        }
        setCheckoutError(
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

          <div className="subscription-plan-modal__plans" role="list">
            {SUBSCRIPTION_PLAN_SLUGS.map((planSlug) => (
              <SubscriptionPlanCard
                key={planSlug}
                planSlug={planSlug}
                currentPlanSlug={currentPlanSlug}
                isPremium={hasActivePremium}
                lang={lang}
                ui={ui}
                loadingPlan={loadingPlan}
                onSelect={(slug) => void handleSelectPlan(slug)}
              />
            ))}
          </div>

          {checkoutError ? (
            <p className="subscription-plan-modal__error" role="alert">
              {checkoutError}
            </p>
          ) : null}
          {emailBlocked && !checkoutError ? (
            <p className="subscription-plan-modal__error" role="status">
              {emailCopy.restrictedPremium ??
                (lang === 'en'
                  ? 'Verify your email to start support'
                  : 'Подтвердите email, чтобы начать поддержку')}
            </p>
          ) : null}
          {footnote ? (
            <footer className="subscription-plan-modal__footnote-footer">
              <div className="subscription-plan-modal__footnote-inner">
                <Users
                  className="subscription-plan-modal__footnote-icon"
                  size={18}
                  strokeWidth={1.75}
                  aria-hidden
                />
                <p className="subscription-plan-modal__footnote">{footnote}</p>
              </div>
            </footer>
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
    </>
  );
}
