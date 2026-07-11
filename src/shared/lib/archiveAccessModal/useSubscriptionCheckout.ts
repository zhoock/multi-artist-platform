import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useLang } from '@app/providers/lang';
import { createSubscriptionPayment } from '@shared/api/subscription';
import { savePremiumCheckoutArtistSlug } from '@features/premiumSubscription';
import { getToken, isEmailVerified } from '@shared/lib/auth';
import { useEmailVerificationCopy } from '@shared/lib/emailVerification';
import {
  beginPremiumCheckoutAuthIntent,
  clearPremiumCheckoutAuthIntent,
} from '@shared/lib/authIntent';
import { sanitizeReturnPath } from '@shared/lib/authReturnUrl';
import { useAuthSessionUser } from '@shared/lib/hooks/useAuthSessionUser';
import type { SubscriptionPlanSlug } from '@shared/lib/payment/subscriptionPlans';

import type { CloseArchiveAccessModalOptions } from './archiveAccessModalContext';

export type SubscriptionCheckoutResult =
  | { ok: true; redirected: true }
  | { ok: false; error: string };

type UseSubscriptionCheckoutOptions = {
  onClose?: (options?: CloseArchiveAccessModalOptions) => void;
};

export function useSubscriptionCheckout({ onClose }: UseSubscriptionCheckoutOptions = {}) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const location = useLocation();
  const navigate = useNavigate();
  const viewer = useAuthSessionUser();
  const emailCopy = useEmailVerificationCopy();

  const startCheckout = useCallback(
    async (planSlug: SubscriptionPlanSlug): Promise<SubscriptionCheckoutResult> => {
      const rawReturnTo = `${location.pathname}${location.search}`;
      const returnTo = sanitizeReturnPath(rawReturnTo) ?? '/';

      if (viewer && !isEmailVerified(viewer)) {
        return {
          ok: false,
          error:
            emailCopy.restrictedPremium ??
            (lang === 'en'
              ? 'Verify your email to purchase Premium'
              : 'Подтвердите email, чтобы оформить Premium'),
        };
      }

      if (!getToken() && !viewer?.id) {
        beginPremiumCheckoutAuthIntent({ returnTo });
        navigate(`/auth?returnTo=${encodeURIComponent(returnTo)}`, {
          state: { backgroundLocation: location },
        });
        onClose?.({ preserveCheckoutIntent: true });
        return { ok: true, redirected: true };
      }

      try {
        const returnUrl =
          typeof window !== 'undefined'
            ? `${window.location.origin}/pay/subscription-success?returnTo=${encodeURIComponent(returnTo)}`
            : undefined;

        const result = await createSubscriptionPayment({ returnUrl, plan: planSlug });

        if (!result.success || !result.data) {
          return {
            ok: false,
            error: result.error || 'Could not start checkout',
          };
        }

        if (result.data.confirmationUrl) {
          clearPremiumCheckoutAuthIntent();
          savePremiumCheckoutArtistSlug();
          onClose?.({ preserveCheckoutIntent: true });
          window.location.href = result.data.confirmationUrl;
          return { ok: true, redirected: true };
        }

        return {
          ok: false,
          error: 'Payment provider did not return a checkout URL',
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Checkout failed',
        };
      }
    },
    [emailCopy.restrictedPremium, lang, location, navigate, onClose, viewer]
  );

  return { startCheckout };
}
