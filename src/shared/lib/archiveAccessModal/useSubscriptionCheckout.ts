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
import { logDevPaymentSubscriptionRedirect } from '@shared/lib/payment/devPaymentMode';

import type { CloseArchiveAccessModalOptions } from './archiveAccessModalContext';

export type SubscriptionCheckoutResult =
  /** Navigating to YooKassa — UI may keep loading until the page unloads. */
  | { ok: true; redirected: 'payment' }
  /**
   * Navigating to auth overlay — SPA stays mounted; callers must clear loading
   * (plan picker / renew buttons) so canceling auth does not leave a stuck CTA.
   */
  | { ok: true; redirected: 'auth' }
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
        return { ok: true, redirected: 'auth' };
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

        if (result.data.devPaymentCompleted && result.data.subscriptionPaymentId) {
          clearPremiumCheckoutAuthIntent();
          savePremiumCheckoutArtistSlug();
          onClose?.({ preserveCheckoutIntent: true });
          const statusUrl = new URL(`${window.location.origin}/pay/subscription-success`);
          statusUrl.searchParams.set('subscriptionPaymentId', result.data.subscriptionPaymentId);
          statusUrl.searchParams.set('returnTo', returnTo);
          logDevPaymentSubscriptionRedirect({
            subscriptionPaymentId: result.data.subscriptionPaymentId,
            paymentId: result.data.paymentId,
            redirectUrl: statusUrl.pathname + statusUrl.search,
          });
          window.location.href = statusUrl.toString();
          return { ok: true, redirected: 'payment' };
        }

        if (result.data.confirmationUrl) {
          clearPremiumCheckoutAuthIntent();
          savePremiumCheckoutArtistSlug();
          onClose?.({ preserveCheckoutIntent: true });
          window.location.href = result.data.confirmationUrl;
          return { ok: true, redirected: 'payment' };
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
