import type { CreatePaymentResponse } from '@shared/api/payment';
import {
  buildAlbumPaymentDevStatusUrl,
  buildAlbumPaymentSuccessUrl,
} from '@shared/lib/internalAppUrls';
import { logDevPaymentAlbumRedirect } from '@shared/lib/payment/devPaymentMode';
import type { CheckoutStatusTokenParams } from '@shared/lib/payment/checkoutStatusTokenParams';

export type AlbumCheckoutRedirectOutcome =
  | { kind: 'redirect' }
  | { kind: 'error'; message: string };

function resolveHttpsCheckoutUrl(raw?: string | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return new URL(trimmed).protocol === 'https:' ? trimmed : null;
  } catch {
    return null;
  }
}

function readCheckoutStatusToken(
  result: CreatePaymentResponse
): CheckoutStatusTokenParams | undefined {
  if (result.statusToken && result.statusTokenExpiresAt != null) {
    return {
      statusToken: result.statusToken,
      statusTokenExpiresAt: result.statusTokenExpiresAt,
    };
  }
  return undefined;
}

function redirectTo(
  url: string,
  navigate: (target: string) => void,
  releaseUiBeforeNavigate?: () => void
): AlbumCheckoutRedirectOutcome {
  if (typeof window === 'undefined' && navigate === defaultCheckoutNavigate) {
    return { kind: 'error', message: 'Checkout redirect is only available in the browser' };
  }
  try {
    releaseUiBeforeNavigate?.();
    navigate(url);
    return { kind: 'redirect' };
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Failed to open payment page',
    };
  }
}

function defaultCheckoutNavigate(target: string): void {
  window.location.href = target;
}

/**
 * Applies a successful create-payment response: validates checkout URLs and navigates away.
 * Callers should clear loading UI when `kind === 'error'`.
 */
export function applyAlbumCheckoutCreatePaymentResult(
  result: CreatePaymentResponse,
  context: {
    returnTo: string;
    genericError: string;
    navigate?: (target: string) => void;
    releaseUiBeforeNavigate?: () => void;
  }
): AlbumCheckoutRedirectOutcome {
  const navigate = context.navigate ?? defaultCheckoutNavigate;
  const releaseUi = context.releaseUiBeforeNavigate;
  const checkoutToken = readCheckoutStatusToken(result);

  if (result.devPaymentCompleted || result.fulfillmentRecovered) {
    if (!result.orderId?.trim()) {
      return { kind: 'error', message: context.genericError };
    }

    if (result.devPaymentCompleted) {
      const statusUrl = buildAlbumPaymentDevStatusUrl({
        orderId: result.orderId,
        returnTo: context.returnTo,
        statusToken: result.statusToken,
        statusTokenExpiresAt: result.statusTokenExpiresAt,
      });
      logDevPaymentAlbumRedirect({
        orderId: result.orderId,
        paymentId: result.paymentId,
        redirectUrl: (() => {
          const parsed = new URL(statusUrl);
          return `${parsed.pathname}${parsed.search}`;
        })(),
      });
      return redirectTo(statusUrl, navigate, releaseUi);
    }

    return redirectTo(
      buildAlbumPaymentSuccessUrl(result.orderId, checkoutToken),
      navigate,
      releaseUi
    );
  }

  const confirmationUrl = resolveHttpsCheckoutUrl(result.confirmationUrl);
  if (confirmationUrl) {
    return redirectTo(confirmationUrl, navigate, releaseUi);
  }

  return { kind: 'error', message: context.genericError };
}
