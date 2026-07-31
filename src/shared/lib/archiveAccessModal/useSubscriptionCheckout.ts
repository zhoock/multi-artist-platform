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
import { readReturnPathFromLocation } from '@shared/lib/authReturnUrl';
import {
  buildAuthPath,
  buildSubscriptionPaymentDevStatusUrl,
  buildSubscriptionPaymentStatusReturnUrl,
} from '@shared/lib/internalAppUrls';
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
      const returnTo = readReturnPathFromLocation(location);

      if (viewer && !isEmailVerified(viewer)) {
        return {
          ok: false,
          error:
            emailCopy.restrictedPremium ??
            (lang === 'en'
              ? 'Verify your email to start support'
              : 'Подтвердите email, чтобы начать поддержку'),
        };
      }

      if (!getToken() && !viewer?.id) {
        beginPremiumCheckoutAuthIntent({ returnTo });
        const authParams = new URLSearchParams();
        authParams.set('returnTo', returnTo);
        navigate(buildAuthPath(authParams), {
          state: { backgroundLocation: location },
        });
        onClose?.({ preserveCheckoutIntent: true });
        return { ok: true, redirected: 'auth' };
      }

      try {
        const returnUrl =
          typeof window !== 'undefined'
            ? buildSubscriptionPaymentStatusReturnUrl(returnTo)
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
          const statusUrl = buildSubscriptionPaymentDevStatusUrl({
            subscriptionPaymentId: result.data.subscriptionPaymentId,
            returnTo,
          });
          logDevPaymentSubscriptionRedirect({
            subscriptionPaymentId: result.data.subscriptionPaymentId,
            paymentId: result.data.paymentId,
            redirectUrl: (() => {
              const parsed = new URL(statusUrl);
              return `${parsed.pathname}${parsed.search}`;
            })(),
          });
          window.location.href = statusUrl;
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
