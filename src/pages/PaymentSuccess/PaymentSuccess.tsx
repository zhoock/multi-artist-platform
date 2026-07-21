// src/pages/PaymentSuccess/PaymentSuccess.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import './PaymentSuccess.style.scss';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { invalidateMyPurchasesCache } from '@shared/api/purchases';
import { redirectToAlbumReturnPath } from '@shared/lib/albumPurchaseSuccessToast';
import {
  ALBUM_PAY_FAIL_PATH,
  ALBUM_PAY_SUCCESS_PATH,
  albumPaymentModeFromPathname,
  albumPaymentOutcomePath,
  type AlbumPaymentRouteMode,
} from '@shared/lib/paymentRoutes';

/**
 * Статус платежа от YooKassa API (через get-payment-status; сверка с провайдером на бэкенде).
 */
interface PaymentStatus {
  id: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';
  paid: boolean;
  amount: {
    value: string;
    currency: string;
  };
  cancellation_details?: {
    party: string;
    reason: string;
  };
  metadata?: {
    orderId?: string;
    customerEmail?: string;
    [key: string]: string | undefined;
  };
  confirmation_url?: string;
}

interface StatusInfo {
  title: string;
  message: string;
  icon: string;
  className: string;
}

/** YooKassa payment UUID (ориентировочная эвристика) */
function isYooKassaPaymentId(value: string): boolean {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) &&
    (value.includes('-000f-') || value.includes('-5000-') || value.includes('-5001-'))
  );
}

function isOrderUUID(value: string): boolean {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) &&
    !isYooKassaPaymentId(value)
  );
}

const MAX_STATUS_POLLS = 20;
const POLL_INTERVAL_MS = 5000;

function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const routeMode: AlbumPaymentRouteMode = albumPaymentModeFromPathname(location.pathname);
  const paymentIdParam = searchParams.get('paymentId');
  const orderIdParam = searchParams.get('orderId');
  const returnTo = searchParams.get('returnTo');
  const [payment, setPayment] = useState<PaymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusCheckTimedOut, setStatusCheckTimedOut] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(5);

  const pollCountRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolveApiQuery = useCallback((): string | null => {
    if (paymentIdParam) {
      return `paymentId=${encodeURIComponent(paymentIdParam)}`;
    }
    if (!orderIdParam) return null;
    if (isYooKassaPaymentId(orderIdParam)) {
      return `paymentId=${encodeURIComponent(orderIdParam)}`;
    }
    if (isOrderUUID(orderIdParam)) {
      return `orderId=${encodeURIComponent(orderIdParam)}`;
    }
    return `orderId=${encodeURIComponent(orderIdParam)}`;
  }, [paymentIdParam, orderIdParam]);

  const fetchPaymentOnce = useCallback(async (): Promise<{ stop: boolean; fatal: boolean }> => {
    const apiQuery = resolveApiQuery();
    if (!apiQuery) {
      setError('Payment ID or Order ID is missing');
      setLoading(false);
      return { stop: true, fatal: true };
    }

    const response = await fetchWithAuthSession(`/api/get-payment-status?${apiQuery}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data.success || !data.payment) {
      setError(data.error || data.message || 'Failed to fetch payment status');
      setLoading(false);
      return { stop: true, fatal: true };
    }

    setPayment(data.payment as PaymentStatus);
    setLoading(false);

    const yookassaStatus = data.payment.status;
    const final = yookassaStatus === 'succeeded' || yookassaStatus === 'canceled';
    return { stop: final, fatal: false };
  }, [resolveApiQuery]);

  useEffect(() => {
    if (!paymentIdParam && !orderIdParam) {
      setError('Payment ID or Order ID is missing');
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    const clearPollTimer = () => {
      if (pollTimerRef.current != null) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    pollCountRef.current = 0;
    setStatusCheckTimedOut(false);
    setError(null);

    const runCycle = async () => {
      if (cancelled) return;
      pollCountRef.current += 1;
      if (pollCountRef.current > MAX_STATUS_POLLS) {
        setStatusCheckTimedOut(true);
        return;
      }

      try {
        const { stop, fatal } = await fetchPaymentOnce();
        if (cancelled) return;
        if (fatal) return;
        if (stop) return;
        if (pollCountRef.current >= MAX_STATUS_POLLS) {
          setStatusCheckTimedOut(true);
          return;
        }
        clearPollTimer();
        pollTimerRef.current = setTimeout(() => void runCycle(), POLL_INTERVAL_MS);
      } catch (e) {
        console.warn('payment_success.poll_error', e);
        if (cancelled) return;
        setLoading(false);
        if (pollCountRef.current >= MAX_STATUS_POLLS) {
          setStatusCheckTimedOut(true);
          return;
        }
        clearPollTimer();
        pollTimerRef.current = setTimeout(() => void runCycle(), POLL_INTERVAL_MS);
      }
    };

    void runCycle();

    return () => {
      cancelled = true;
      clearPollTimer();
    };
  }, [paymentIdParam, orderIdParam, fetchPaymentOnce]);

  const buildOutcomeUrl = useCallback(
    (pathname: string) => `${pathname}${location.search}`,
    [location.search]
  );

  // Align URL with payment outcome: /pay/status → success|fail; guard legacy /pay/success links.
  useEffect(() => {
    if (loading) return;

    if (routeMode === 'resolve') {
      if (error || !payment) {
        navigate(buildOutcomeUrl(ALBUM_PAY_FAIL_PATH), { replace: true });
        return;
      }

      const isFinal =
        payment.status === 'succeeded' || payment.status === 'canceled' || statusCheckTimedOut;
      if (!isFinal) return;

      navigate(buildOutcomeUrl(albumPaymentOutcomePath(payment.status)), { replace: true });
      return;
    }

    if (!payment) return;

    if (routeMode === 'success' && payment.status !== 'succeeded') {
      navigate(buildOutcomeUrl(ALBUM_PAY_FAIL_PATH), { replace: true });
      return;
    }

    if (routeMode === 'fail' && payment.status === 'succeeded') {
      navigate(buildOutcomeUrl(ALBUM_PAY_SUCCESS_PATH), { replace: true });
    }
  }, [routeMode, loading, error, payment, statusCheckTimedOut, navigate, buildOutcomeUrl]);

  const handleTryAgainNavigate = () => {
    try {
      if (returnTo) {
        const url = new URL(returnTo, window.location.origin);
        window.location.href = `${url.pathname}${url.search}${url.hash}` || '/';
        return;
      }
    } catch {
      /* noop */
    }
    navigate('/');
  };

  // Покупка прошла — сбрасываем кэш покупок, чтобы при возврате на album page
  // `useAlbumOwnedByViewer` сразу запросил свежие данные и показал "Owned".
  // Это и есть настоящий ownership state: запись лежит в БД (`purchases`),
  // мы лишь говорим клиенту перечитать список.
  const cacheInvalidatedRef = useRef(false);
  useEffect(() => {
    if (payment?.status === 'succeeded' && !cacheInvalidatedRef.current) {
      cacheInvalidatedRef.current = true;
      invalidateMyPurchasesCache();
    }
  }, [payment?.status]);

  useEffect(() => {
    if (payment?.status === 'succeeded' && returnTo) {
      const countdownInterval = setInterval(() => {
        setRedirectCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            redirectToAlbumReturnPath(returnTo);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(countdownInterval);
    }
  }, [payment?.status, returnTo]);

  const getIncompleteStatusUi = (): StatusInfo => ({
    title: 'Платёж не завершён',
    message:
      'Операция не была завершена или ещё обрабатывается. Чтобы продолжить оплату, нажмите «Попробовать снова».',
    icon: '📌',
    className: 'payment-success__status--pending',
  });

  const getStatusMessage = (paymentData: PaymentStatus): StatusInfo => {
    switch (paymentData.status) {
      case 'succeeded':
        return {
          title: 'Оплата успешна!',
          message: 'Ваш заказ успешно оплачен. Спасибо за покупку!',
          icon: '✅',
          className: 'payment-success__status--paid',
        };
      case 'pending':
      case 'waiting_for_capture':
        return getIncompleteStatusUi();
      case 'canceled':
        return {
          title: 'Платёж не завершён',
          message: paymentData.cancellation_details?.reason
            ? `Не удалось списать оплату: ${paymentData.cancellation_details.reason}`
            : 'Платёж отменён. Вы можете попробовать снова.',
          icon: '❌',
          className: 'payment-success__status--canceled',
        };
      default:
        return {
          title: 'Статус уточняется',
          message: `Статус платежа: ${paymentData.status}`,
          icon: '❓',
          className: 'payment-success__status--unknown',
        };
    }
  };

  const pageTitle =
    routeMode === 'success'
      ? 'Оплата успешна — Смоляное Чучелко'
      : routeMode === 'fail'
        ? 'Платёж не завершён — Смоляное Чучелко'
        : 'Статус оплаты — Смоляное Чучелко';

  const showResolveLoading = routeMode === 'resolve';
  const showSuccessOutcome = routeMode === 'success' && payment?.status === 'succeeded';
  const showFailOutcome = routeMode === 'fail' && payment != null && payment.status !== 'succeeded';
  const showRouteAlignLoading =
    routeMode !== 'resolve' &&
    (loading || (payment != null && !showSuccessOutcome && !showFailOutcome));

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
      </Helmet>
      <div className="payment-success">
        <div className="payment-success__container">
          {showResolveLoading || showRouteAlignLoading ? (
            <div className="payment-success__loading">
              <div className="payment-success__spinner" aria-hidden />
              <p>Статус оплаты загружается…</p>
            </div>
          ) : error ? (
            routeMode === 'fail' ? (
              <div className="payment-success__error">
                <h1>Не получилось проверить оплату</h1>
                <p>{error}</p>
                <button
                  type="button"
                  className="payment-success__button"
                  onClick={() => window.location.reload()}
                >
                  Обновить страницу
                </button>
              </div>
            ) : (
              <div className="payment-success__loading">
                <div className="payment-success__spinner" aria-hidden />
                <p>Статус оплаты загружается…</p>
              </div>
            )
          ) : showSuccessOutcome && payment ? (
            (() => {
              const statusInfo = getStatusMessage(payment);

              return (
                <div className={`payment-success__status ${statusInfo.className}`}>
                  <h1 className="payment-success__title">{statusInfo.title}</h1>
                  <p className="payment-success__message">{statusInfo.message}</p>

                  {!returnTo && (
                    <div className="payment-success__details">
                      <p>
                        <strong>Сумма:</strong> {payment.amount.value} {payment.amount.currency}
                      </p>
                      {payment.metadata?.customerEmail && (
                        <p>
                          <strong>Email:</strong> {payment.metadata.customerEmail}
                        </p>
                      )}
                      {payment.metadata?.orderId && (
                        <p>
                          <strong>Номер заказа:</strong> {payment.metadata.orderId}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="payment-success__success-actions">
                    {returnTo ? (
                      <div className="payment-success__success-message">
                        <img
                          src="/images/illustrations/successful-payment.png"
                          alt="Оплата успешна"
                          className="payment-success__success-icon"
                        />
                        <p className="payment-success__success-text">
                          Ссылка на скачивание отправлена на email{' '}
                          <strong>{payment.metadata?.customerEmail || ''}</strong>
                        </p>
                        {redirectCountdown > 0 && (
                          <p className="payment-success__redirect-note">
                            Возвращаемся на исходную страницу через {redirectCountdown}{' '}
                            {redirectCountdown === 1 ? 'секунду' : 'секунды'}…
                          </p>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="payment-success__details">
                          <p>
                            <strong>Сумма:</strong> {payment.amount.value} {payment.amount.currency}
                          </p>
                          {payment.metadata?.customerEmail && (
                            <p>
                              <strong>Email:</strong> {payment.metadata.customerEmail}
                            </p>
                          )}
                          {payment.metadata?.orderId && (
                            <p>
                              <strong>Номер заказа:</strong> {payment.metadata.orderId}
                            </p>
                          )}
                        </div>
                        {payment.metadata?.customerEmail && (
                          <button
                            type="button"
                            className="payment-success__button payment-success__button--primary"
                            onClick={() =>
                              navigate('/dashboard-new/my-purchases', {
                                state: { backgroundLocation: location },
                              })
                            }
                          >
                            Мои покупки
                          </button>
                        )}
                        <button
                          type="button"
                          className="payment-success__button"
                          onClick={() => navigate('/')}
                        >
                          На главную
                        </button>
                      </>
                    )}
                  </div>
                  {returnTo && (
                    <button
                      type="button"
                      className="payment-success__button payment-success__button--primary"
                      onClick={() => redirectToAlbumReturnPath(returnTo)}
                    >
                      Вернуться сейчас
                    </button>
                  )}
                </div>
              );
            })()
          ) : showFailOutcome && payment ? (
            (() => {
              const statusInfo = getStatusMessage(payment);
              const isPendingLike =
                payment.status === 'pending' || payment.status === 'waiting_for_capture';
              const resumeCheckoutHref = payment.confirmation_url?.trim() || '';

              return (
                <div className={`payment-success__status ${statusInfo.className}`}>
                  <h1 className="payment-success__title">{statusInfo.title}</h1>
                  <p className="payment-success__message">{statusInfo.message}</p>

                  {statusCheckTimedOut && isPendingLike && (
                    <p className="payment-success__muted-note">
                      Статус долго не обновляется — обновите страницу или вернитесь к оформлению
                      заказа.
                    </p>
                  )}

                  <div className="payment-success__pending-actions">
                    {resumeCheckoutHref && isPendingLike ? (
                      <a
                        href={resumeCheckoutHref}
                        className="payment-success__button payment-success__button--primary"
                        target="_self"
                        rel="noopener noreferrer"
                      >
                        Попробовать снова
                      </a>
                    ) : (
                      <button
                        type="button"
                        className="payment-success__button payment-success__button--primary"
                        onClick={handleTryAgainNavigate}
                      >
                        Попробовать снова
                      </button>
                    )}
                    <button
                      type="button"
                      className="payment-success__button"
                      onClick={() => navigate('/')}
                    >
                      На главную
                    </button>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="payment-success__error">
              <h1>Заказ не найден</h1>
              <p>Не удалось найти информацию о заказе.</p>
              <button
                type="button"
                className="payment-success__button"
                onClick={() => navigate('/')}
              >
                Вернуться на главную
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default PaymentSuccess;
