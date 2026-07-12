import { Users } from 'lucide-react';

import { useState, useCallback, useEffect, type RefObject } from 'react';

import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import { usePremiumSubscription } from '@features/premiumSubscription';
import { isEmailVerified } from '@shared/lib/auth';
import { useEmailVerificationCopy } from '@shared/lib/emailVerification';
import {
  SUBSCRIPTION_PLAN_SLUGS,
  shouldConfirmSubscriptionPlanChange,
  type SubscriptionPlanSlug,
} from '@shared/lib/payment/subscriptionPlans';
import { useAuthSessionUser } from '@shared/lib/hooks/useAuthSessionUser';
import { LocalModal } from '@shared/ui/localModal';

import { SubscriptionPlanCard } from './SubscriptionPlanCard';
import { SubscriptionPlanChangeConfirmModal } from './SubscriptionPlanChangeConfirmModal';
import type { CloseArchiveAccessModalOptions } from './archiveAccessModalContext';
import { useSubscriptionCheckout } from './useSubscriptionCheckout';

import './archiveAccessModal.style.scss';

type Props = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onClose: (options?: CloseArchiveAccessModalOptions) => void;
};

export function ArchiveAccessModalView({ dialogRef, onClose }: Props) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const viewer = useAuthSessionUser();
  const emailCopy = useEmailVerificationCopy();
  const { isPremium, planSlug: currentPlanSlug, refetch } = usePremiumSubscription();
  const [loadingPlan, setLoadingPlan] = useState<SubscriptionPlanSlug | null>(null);
  const [pendingPlanChange, setPendingPlanChange] = useState<SubscriptionPlanSlug | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const { startCheckout } = useSubscriptionCheckout({ onClose });
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const emailBlocked = Boolean(viewer && !isEmailVerified(viewer));

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
  const priceCurrency = ui?.titles?.archiveAccessPriceCurrency ?? '₽';
  const closeLabel = ui?.buttons?.articleLockedDialogClose ?? (lang === 'en' ? 'Close' : 'Закрыть');
  const footnote =
    ui?.titles?.archiveAccessFootnote?.trim() ??
    (lang === 'en'
      ? 'All plans distribute revenue equally among supported artists. Your support helps artists keep creating the music you love.'
      : 'Все планы распределяют доход поровну между поддерживаемыми артистами. Ваша поддержка помогает артистам создавать музыку.');

  const proceedToCheckout = useCallback(
    async (planSlug: SubscriptionPlanSlug) => {
      setLoadingPlan(planSlug);
      setCheckoutError(null);

      const result = await startCheckout(planSlug);

      if (!result.ok) {
        setCheckoutError(result.error);
        setLoadingPlan(null);
      }
    },
    [startCheckout]
  );

  const handleSelectPlan = useCallback(
    (planSlug: SubscriptionPlanSlug) => {
      if (shouldConfirmSubscriptionPlanChange(currentPlanSlug, planSlug)) {
        setPendingPlanChange(planSlug);
        return;
      }

      void proceedToCheckout(planSlug);
    },
    [currentPlanSlug, proceedToCheckout]
  );

  const handleCancelPlanChange = useCallback(() => {
    if (loadingPlan) return;
    setPendingPlanChange(null);
  }, [loadingPlan]);

  const handleConfirmPlanChange = useCallback(() => {
    if (!pendingPlanChange || loadingPlan) return;

    const planSlug = pendingPlanChange;
    setPendingPlanChange(null);
    void proceedToCheckout(planSlug);
  }, [loadingPlan, pendingPlanChange, proceedToCheckout]);

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
                isPremium={isPremium}
                lang={lang}
                ui={ui}
                priceCurrency={priceCurrency}
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
                  ? 'Verify your email to purchase Premium'
                  : 'Подтвердите email, чтобы оформить Premium')}
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

      {pendingPlanChange && currentPlanSlug ? (
        <SubscriptionPlanChangeConfirmModal
          isOpen
          currentPlanSlug={currentPlanSlug}
          targetPlanSlug={pendingPlanChange}
          priceCurrency={priceCurrency}
          loading={loadingPlan === pendingPlanChange}
          onCancel={handleCancelPlanChange}
          onConfirm={handleConfirmPlanChange}
        />
      ) : null}
    </>
  );
}
