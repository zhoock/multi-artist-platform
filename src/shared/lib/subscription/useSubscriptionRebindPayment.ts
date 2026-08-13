import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';

import { useLang } from '@app/providers/lang';
import { createSubscriptionPaymentMethodRebind } from '@shared/api/subscription';
import { getToken, isEmailVerified } from '@shared/lib/auth';
import { useEmailVerificationCopy } from '@shared/lib/emailVerification';
import { readReturnPathFromLocation } from '@shared/lib/authReturnUrl';
import {
  buildSubscriptionPaymentDevStatusUrl,
  buildSubscriptionPaymentStatusReturnUrl,
} from '@shared/lib/internalAppUrls';
import { useAuthSessionUser } from '@shared/lib/hooks/useAuthSessionUser';
import { logDevPaymentSubscriptionRedirect } from '@shared/lib/payment/devPaymentMode';

export type StartSubscriptionRebindOptions = {
  resumeAutoRenew?: boolean;
};

export type SubscriptionRebindResult =
  | { ok: true; redirected: 'payment' }
  | { ok: false; error: string };

export function useSubscriptionRebindPayment() {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const location = useLocation();
  const viewer = useAuthSessionUser();
  const emailCopy = useEmailVerificationCopy();

  const startRebind = useCallback(
    async (options: StartSubscriptionRebindOptions = {}): Promise<SubscriptionRebindResult> => {
      const returnTo = readReturnPathFromLocation(location);

      if (viewer && !isEmailVerified(viewer)) {
        return {
          ok: false,
          error:
            emailCopy.restrictedPremium ??
            (lang === 'en'
              ? 'Verify your email to update payment method'
              : 'Подтвердите email, чтобы обновить способ оплаты'),
        };
      }

      if (!getToken() && !viewer?.id) {
        return { ok: false, error: 'Authentication required' };
      }

      try {
        const returnUrl =
          typeof window !== 'undefined'
            ? buildSubscriptionPaymentStatusReturnUrl(returnTo)
            : undefined;

        const result = await createSubscriptionPaymentMethodRebind({
          returnUrl,
          ...(options.resumeAutoRenew ? { intent: 'resume-auto-renew' as const } : {}),
        });

        if (!result.success || !result.data) {
          return {
            ok: false,
            error: result.error || 'Could not start payment method update',
          };
        }

        if (result.data.devPaymentCompleted && result.data.subscriptionPaymentId) {
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
          error: error instanceof Error ? error.message : 'Payment method update failed',
        };
      }
    },
    [emailCopy.restrictedPremium, lang, location, viewer]
  );

  return { startRebind };
}
