import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

import { getSubscriptionPaymentStatus } from '@shared/api/subscription';
import { dispatchSubscriptionActivated } from '@features/artistArchive';
import { clearPremiumCheckoutAuthIntent } from '@shared/lib/authIntent';
import {
  markPremiumCheckoutPending,
  savePremiumCheckoutArtistSlug,
  PREMIUM_CHECKOUT_ARTIST_SLUG_KEY,
} from '@features/premiumSubscription';

import { resolveDashboardModalOpenStateFromStoredBackground } from '@shared/lib/dashboardModalBackground';

import './SubscriptionPaymentSuccess.style.scss';

const MAX_POLLS = 20;
const POLL_INTERVAL_MS = 3000;

export default function SubscriptionPaymentSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const subscriptionPaymentId = searchParams.get('subscriptionPaymentId');
  const returnTo = searchParams.get('returnTo');
  const artistSlug = searchParams.get('artist');

  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'canceled'>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const pollCountRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishedRef = useRef(false);

  const finishActivated = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    markPremiumCheckoutPending();
    clearPremiumCheckoutAuthIntent();

    const target = returnTo?.trim();
    let resolvedArtistSlug = artistSlug?.trim() || '';
    if (target?.startsWith('/')) {
      try {
        const artist = new URL(target, window.location.origin).searchParams.get('artist')?.trim();
        if (artist) {
          resolvedArtistSlug = artist;
          sessionStorage.setItem(PREMIUM_CHECKOUT_ARTIST_SLUG_KEY, artist);
        } else {
          savePremiumCheckoutArtistSlug();
          resolvedArtistSlug =
            sessionStorage.getItem(PREMIUM_CHECKOUT_ARTIST_SLUG_KEY)?.trim() || '';
        }
      } catch {
        savePremiumCheckoutArtistSlug();
        resolvedArtistSlug = sessionStorage.getItem(PREMIUM_CHECKOUT_ARTIST_SLUG_KEY)?.trim() || '';
      }
    }

    dispatchSubscriptionActivated(resolvedArtistSlug || undefined);

    setStatus('success');

    if (target && target.startsWith('/')) {
      window.setTimeout(
        () =>
          navigate(target, {
            replace: true,
            ...resolveDashboardModalOpenStateFromStoredBackground(),
          }),
        800
      );
    }
  }, [artistSlug, navigate, returnTo]);

  useEffect(() => {
    if (!subscriptionPaymentId) {
      setStatus('error');
      setMessage('Missing subscription payment reference');
      return undefined;
    }

    let cancelled = false;

    const poll = async () => {
      if (cancelled || finishedRef.current) return;

      const result = await getSubscriptionPaymentStatus({ subscriptionPaymentId });

      if (cancelled) return;

      if (!result.success || !result.data?.payment) {
        setStatus('error');
        setMessage(result.error || 'Could not verify payment');
        return;
      }

      const { payment, subscriptionActivated } = result.data;

      if (subscriptionActivated || payment.status === 'succeeded') {
        finishActivated();
        return;
      }

      if (payment.status === 'canceled') {
        setStatus('canceled');
        setMessage('Payment was canceled');
        return;
      }

      pollCountRef.current += 1;
      if (pollCountRef.current >= MAX_POLLS) {
        setStatus('error');
        setMessage(
          'Payment confirmation is taking longer than expected. Premium will activate shortly.'
        );
        return;
      }

      pollTimerRef.current = setTimeout(() => {
        void poll();
      }, POLL_INTERVAL_MS);
    };

    void poll();

    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [subscriptionPaymentId, finishActivated]);

  return (
    <>
      <Helmet>
        <title>Premium subscription</title>
      </Helmet>
      <div className="subscription-payment-success">
        {status === 'loading' && (
          <p className="subscription-payment-success__text">Confirming Premium payment…</p>
        )}
        {status === 'success' && (
          <p className="subscription-payment-success__text subscription-payment-success__text--ok">
            Premium activated. Redirecting…
          </p>
        )}
        {status === 'canceled' && (
          <p className="subscription-payment-success__text subscription-payment-success__text--warn">
            {message}
          </p>
        )}
        {status === 'error' && (
          <p className="subscription-payment-success__text subscription-payment-success__text--warn">
            {message}
          </p>
        )}
      </div>
    </>
  );
}
