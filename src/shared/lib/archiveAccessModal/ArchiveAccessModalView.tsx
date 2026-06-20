import { Users } from 'lucide-react';

import { useState, useCallback, useMemo, type RefObject } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import { createSubscriptionPayment } from '@shared/api/subscription';
import { usePremiumSubscription } from '@features/premiumSubscription';
import { savePremiumCheckoutArtistSlug } from '@features/premiumSubscription';
import { getToken, isEmailVerified } from '@shared/lib/auth';
import { useEmailVerificationCopy } from '@shared/lib/emailVerification';
import {
  beginPremiumCheckoutAuthIntent,
  clearPremiumCheckoutAuthIntent,
} from '@shared/lib/authIntent';
import { sanitizeReturnPath } from '@shared/lib/authReturnUrl';
import {
  resolveCurrentPlanSlug,
  SUBSCRIPTION_PLAN_SLUGS,
  type SubscriptionPlanSlug,
} from '@shared/lib/payment/subscriptionPlans';
import { useAuthSessionUser } from '@shared/lib/hooks/useAuthSessionUser';
import { LocalModal } from '@shared/ui/localModal';

import { SubscriptionPlanCard } from './SubscriptionPlanCard';
import type { CloseArchiveAccessModalOptions } from './archiveAccessModalContext';

import './archiveAccessModal.scss';

type Props = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onClose: (options?: CloseArchiveAccessModalOptions) => void;
};

export function ArchiveAccessModalView({ dialogRef, onClose }: Props) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const location = useLocation();
  const navigate = useNavigate();
  const viewer = useAuthSessionUser();
  const emailCopy = useEmailVerificationCopy();
  const { isPremium, slotsLimit, slotsUsed } = usePremiumSubscription();
  const [loadingPlan, setLoadingPlan] = useState<SubscriptionPlanSlug | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const emailBlocked = Boolean(viewer && !isEmailVerified(viewer));

  const currentPlanSlug = useMemo(
    () => resolveCurrentPlanSlug({ isPremium, slotsLimit, slotsUsed }),
    [isPremium, slotsLimit, slotsUsed]
  );

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

  const handleSelectPlan = useCallback(
    async (planSlug: SubscriptionPlanSlug) => {
      const rawReturnTo = `${location.pathname}${location.search}`;
      const returnTo = sanitizeReturnPath(rawReturnTo) ?? '/';

      if (viewer && !isEmailVerified(viewer)) {
        setCheckoutError(
          emailCopy.restrictedPremium ??
            (lang === 'en'
              ? 'Verify your email to purchase Premium'
              : 'Подтвердите email, чтобы оформить Premium')
        );
        return;
      }

      if (!getToken() && !viewer?.id) {
        beginPremiumCheckoutAuthIntent({ returnTo });
        navigate(`/auth?returnTo=${encodeURIComponent(returnTo)}`, {
          state: { backgroundLocation: location },
        });
        onClose({ preserveCheckoutIntent: true });
        return;
      }

      setLoadingPlan(planSlug);
      setCheckoutError(null);

      try {
        const returnUrl =
          typeof window !== 'undefined'
            ? `${window.location.origin}/pay/subscription-success?returnTo=${encodeURIComponent(returnTo)}`
            : undefined;

        const result = await createSubscriptionPayment({ returnUrl, plan: planSlug });

        if (!result.success || !result.data) {
          setCheckoutError(result.error || 'Could not start checkout');
          setLoadingPlan(null);
          return;
        }

        if (result.data.confirmationUrl) {
          clearPremiumCheckoutAuthIntent();
          savePremiumCheckoutArtistSlug();
          onClose({ preserveCheckoutIntent: true });
          window.location.href = result.data.confirmationUrl;
          return;
        }

        setCheckoutError('Payment provider did not return a checkout URL');
        setLoadingPlan(null);
      } catch (error) {
        setCheckoutError(error instanceof Error ? error.message : 'Checkout failed');
        setLoadingPlan(null);
      }
    },
    [emailCopy.restrictedPremium, lang, location, navigate, onClose, viewer]
  );

  return (
    <LocalModal
      dialogRef={dialogRef}
      className="archive-access-modal"
      aria-labelledby="archive-access-modal-title"
      onClose={onClose}
    >
      <div className="archive-access-modal__panel archive-access-modal__panel--plans">
        <button
          type="button"
          className="archive-access-modal__close"
          aria-label={closeLabel}
          onClick={() => onClose()}
        >
          <ModalCloseIcon size={18} />
        </button>

        <header className="archive-access-modal__header archive-access-modal__header--plans">
          <h2 id="archive-access-modal-title" className="archive-access-modal__title">
            {title}
          </h2>
          <p className="archive-access-modal__subtitle">{subtitle}</p>
        </header>

        <div className="archive-access-modal__plans" role="list">
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
          <p className="archive-access-modal__checkout-error" role="alert">
            {checkoutError}
          </p>
        ) : null}
        {emailBlocked && !checkoutError ? (
          <p className="archive-access-modal__checkout-error" role="status">
            {emailCopy.restrictedPremium ??
              (lang === 'en'
                ? 'Verify your email to purchase Premium'
                : 'Подтвердите email, чтобы оформить Premium')}
          </p>
        ) : null}
        {footnote ? (
          <footer className="archive-access-modal__plans-footer">
            <div className="archive-access-modal__plans-footer-inner">
              <Users
                className="archive-access-modal__plans-footer-icon"
                size={18}
                strokeWidth={1.75}
                aria-hidden
              />
              <p className="archive-access-modal__footnote">{footnote}</p>
            </div>
          </footer>
        ) : null}
      </div>
    </LocalModal>
  );
}
