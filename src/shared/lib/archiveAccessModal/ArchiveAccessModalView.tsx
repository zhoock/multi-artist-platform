import { useState, useCallback, type ReactNode, type RefObject } from 'react';
import { X as XIcon } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { SubscriberContentLockIcon } from '@shared/ui/icons/SubscriberContentLockIcon';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { createSubscriptionPayment } from '@shared/api/subscription';
import { savePremiumCheckoutArtistSlug } from '@features/premiumSubscription';
import { getToken, isEmailVerified } from '@shared/lib/auth';
import { useEmailVerificationCopy } from '@shared/lib/emailVerification';
import {
  beginPremiumCheckoutAuthIntent,
  clearPremiumCheckoutAuthIntent,
} from '@shared/lib/authIntent';
import { sanitizeReturnPath } from '@shared/lib/authReturnUrl';
import { getPremiumSubscriptionPriceDisplayAmount } from '@shared/lib/payment/premiumSubscriptionPricing';
import { useAuthSessionUser } from '@shared/lib/hooks/useAuthSessionUser';
import { LocalModal } from '@shared/ui/localModal';

import { ArchiveAccessModalFeatures } from './ArchiveAccessModalFeatures';
import type { CloseArchiveAccessModalOptions } from './archiveAccessModalContext';

import './archiveAccessModal.scss';

type Props = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onClose: (options?: CloseArchiveAccessModalOptions) => void;
};

/** Фрагменты `**выделение**` в строке из словаря → `<strong>`. */
function formatDescriptionWithBoldSegments(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const inner = /^\*\*([^*]+)\*\*$/.exec(part);
    if (inner) {
      return (
        <strong key={i} className="archive-access-modal__description-em">
          {inner[1]}
        </strong>
      );
    }
    return part;
  });
}

export function ArchiveAccessModalView({ dialogRef, onClose }: Props) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const location = useLocation();
  const navigate = useNavigate();
  const viewer = useAuthSessionUser();
  const emailCopy = useEmailVerificationCopy();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const emailBlocked = Boolean(viewer && !isEmailVerified(viewer));

  const title =
    ui?.titles?.archiveAccessTitle ?? (lang === 'en' ? 'Premium Archive' : 'Премиум-архив');
  const descriptionSource =
    ui?.titles?.archiveAccessDescription ??
    (lang === 'en'
      ? 'Unlock exclusive content from any **3 artists** every month.'
      : 'Откройте эксклюзивный контент **у любых 3 артистов** каждый месяц.');

  const priceAmount = getPremiumSubscriptionPriceDisplayAmount();
  const priceCurrency = ui?.titles?.archiveAccessPriceCurrency ?? '₽';
  const pricePeriod =
    ui?.titles?.archiveAccessPricePeriod ?? (lang === 'en' ? '/ 30 days' : '/ 30 дней');
  const subscribeLabel =
    ui?.buttons?.archiveAccessSubscribe ?? (lang === 'en' ? 'Start Premium' : 'Стать Premium');
  const closeLabel = ui?.buttons?.articleLockedDialogClose ?? (lang === 'en' ? 'Close' : 'Закрыть');
  const footnote = ui?.titles?.archiveAccessFootnote?.trim() ?? '';

  const handleStartPremium = useCallback(async () => {
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

    setCheckoutLoading(true);
    setCheckoutError(null);

    try {
      const returnUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}/pay/subscription-success?returnTo=${encodeURIComponent(returnTo)}`
          : undefined;

      const result = await createSubscriptionPayment({ returnUrl });

      if (!result.success || !result.data) {
        setCheckoutError(result.error || 'Could not start checkout');
        setCheckoutLoading(false);
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
      setCheckoutLoading(false);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'Checkout failed');
      setCheckoutLoading(false);
    }
  }, [emailCopy.restrictedPremium, lang, location, navigate, onClose, viewer]);

  return (
    <LocalModal
      dialogRef={dialogRef}
      className="archive-access-modal"
      aria-labelledby="archive-access-modal-title"
      onClose={onClose}
    >
      <div className="archive-access-modal__panel">
        <button
          type="button"
          className="archive-access-modal__close"
          aria-label={closeLabel}
          onClick={() => onClose()}
        >
          <XIcon {...dashboardActionIconProps({ size: 18 })} />
        </button>

        <header className="archive-access-modal__header">
          <SubscriberContentLockIcon className="archive-access-modal__header-icon" size={26} />
          <h2 id="archive-access-modal-title" className="archive-access-modal__title">
            {title}
          </h2>
        </header>

        <p className="archive-access-modal__description">
          {formatDescriptionWithBoldSegments(descriptionSource)}
        </p>

        <ArchiveAccessModalFeatures lang={lang} ui={ui} />

        <hr className="archive-access-modal__rule" />

        <div
          className="archive-access-modal__pricing"
          aria-label={`${priceAmount} ${priceCurrency} ${pricePeriod}`}
        >
          <span className="archive-access-modal__price-row">
            <span className="archive-access-modal__price-num">{priceAmount}</span>
            <span className="archive-access-modal__price-currency">{priceCurrency}</span>
            <span className="archive-access-modal__price-period">{pricePeriod}</span>
          </span>
        </div>

        <button
          type="button"
          className="archive-access-modal__cta"
          disabled={checkoutLoading}
          onClick={handleStartPremium}
        >
          {checkoutLoading
            ? lang === 'en'
              ? 'Redirecting…'
              : 'Переход к оплате…'
            : subscribeLabel}
        </button>
        {checkoutError ? (
          <p className="archive-access-modal__checkout-error" role="alert">
            {checkoutError}
          </p>
        ) : null}
        {footnote ? <p className="archive-access-modal__footnote">{footnote}</p> : null}
      </div>
    </LocalModal>
  );
}
