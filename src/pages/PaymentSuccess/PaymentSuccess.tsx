// src/pages/PaymentSuccess/PaymentSuccess.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import './PaymentSuccess.style.scss';
import { useLang } from '@app/providers/lang';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { invalidateMyPurchasesCache } from '@shared/api/purchases';
import { redirectToAlbumReturnPath } from '@shared/lib/albumPurchaseSuccessToast';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
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

type PaymentUiError = 'missing_reference' | 'fetch_failed';

const labelsFor = (lang: string, ui: ReturnType<typeof selectUiDictionaryFirst> | null) => {
  const copy = ui?.checkout?.paymentSuccess;
  const en = lang === 'en';

  return {
    pageTitleSuccess:
      copy?.pageTitleSuccess ??
      (en ? 'Payment successful — Smolyanoe Chuchelko' : 'Оплата успешна — Смоляное Чучелко'),
    pageTitleFail:
      copy?.pageTitleFail ??
      (en
        ? 'Payment not completed — Smolyanoe Chuchelko'
        : 'Платёж не завершён — Смоляное Чучелко'),
    pageTitleResolve:
      copy?.pageTitleResolve ??
      (en ? 'Payment status — Smolyanoe Chuchelko' : 'Статус оплаты — Смоляное Чучелко'),
    loading: copy?.loading ?? (en ? 'Loading payment status…' : 'Статус оплаты загружается…'),
    verifyErrorTitle:
      copy?.verifyErrorTitle ??
      (en ? 'Could not verify payment' : 'Не получилось проверить оплату'),
    missingReference:
      copy?.missingReference ??
      (en ? 'Payment reference is missing.' : 'Не указан идентификатор платежа или заказа.'),
    fetchFailed:
      copy?.fetchFailed ??
      (en
        ? 'Could not retrieve payment status. Please try again.'
        : 'Не удалось получить статус оплаты. Попробуйте ещё раз.'),
    reloadPage: copy?.reloadPage ?? (en ? 'Reload page' : 'Обновить страницу'),
    succeededTitle: copy?.succeededTitle ?? (en ? 'Payment successful!' : 'Оплата успешна!'),
    succeededMessage:
      copy?.succeededMessage ??
      (en
        ? 'Your order has been paid. Thank you for your purchase!'
        : 'Ваш заказ успешно оплачен. Спасибо за покупку!'),
    incompleteTitle: copy?.incompleteTitle ?? (en ? 'Payment not completed' : 'Платёж не завершён'),
    incompleteMessage:
      copy?.incompleteMessage ??
      (en
        ? 'The operation was not completed or is still processing. To continue, click "Try again".'
        : 'Операция не была завершена или ещё обрабатывается. Чтобы продолжить оплату, нажмите «Попробовать снова».'),
    canceledTitle: copy?.canceledTitle ?? (en ? 'Payment not completed' : 'Платёж не завершён'),
    canceledMessage:
      copy?.canceledMessage ??
      (en
        ? 'Payment was canceled. You can try again.'
        : 'Платёж отменён. Вы можете попробовать снова.'),
    canceledWithReasonPrefix:
      copy?.canceledWithReasonPrefix ??
      (en ? 'Could not charge payment:' : 'Не удалось списать оплату:'),
    unknownTitle: copy?.unknownTitle ?? (en ? 'Status pending confirmation' : 'Статус уточняется'),
    unknownStatusPrefix: copy?.unknownStatusPrefix ?? (en ? 'Payment status:' : 'Статус платежа:'),
    pollTimeoutNote:
      copy?.pollTimeoutNote ??
      (en
        ? 'Status is taking longer than expected — reload the page or return to checkout.'
        : 'Статус долго не обновляется — обновите страницу или вернитесь к оформлению заказа.'),
    amountLabel: copy?.amountLabel ?? (en ? 'Amount:' : 'Сумма:'),
    emailLabel: copy?.emailLabel ?? 'Email:',
    orderNumberLabel: copy?.orderNumberLabel ?? (en ? 'Order number:' : 'Номер заказа:'),
    downloadLinkSentPrefix:
      copy?.downloadLinkSentPrefix ??
      (en ? 'Download link sent to email' : 'Ссылка на скачивание отправлена на email'),
    redirectCountdownOne:
      copy?.redirectCountdownOne ??
      (en
        ? 'Returning to the previous page in {seconds} second…'
        : 'Возвращаемся на исходную страницу через {seconds} секунду…'),
    redirectCountdownMany:
      copy?.redirectCountdownMany ??
      (en
        ? 'Returning to the previous page in {seconds} seconds…'
        : 'Возвращаемся на исходную страницу через {seconds} секунды…'),
    successImageAlt: copy?.successImageAlt ?? (en ? 'Payment successful' : 'Оплата успешна'),
    myPurchases: copy?.myPurchases ?? (en ? 'My purchases' : 'Мои покупки'),
    home: copy?.home ?? (en ? 'Home' : 'На главную'),
    returnNow: copy?.returnNow ?? (en ? 'Return now' : 'Вернуться сейчас'),
    tryAgain: copy?.tryAgain ?? (en ? 'Try again' : 'Попробовать снова'),
    orderNotFoundTitle: copy?.orderNotFoundTitle ?? (en ? 'Order not found' : 'Заказ не найден'),
    orderNotFoundMessage:
      copy?.orderNotFoundMessage ??
      (en ? 'Could not find order information.' : 'Не удалось найти информацию о заказе.'),
    returnHome: copy?.returnHome ?? (en ? 'Return to home' : 'Вернуться на главную'),
  };
};

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
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const labels = useMemo(() => labelsFor(lang, ui), [lang, ui]);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const routeMode: AlbumPaymentRouteMode = albumPaymentModeFromPathname(location.pathname);
  const paymentIdParam = searchParams.get('paymentId');
  const orderIdParam = searchParams.get('orderId');
  const returnTo = searchParams.get('returnTo');
  const [payment, setPayment] = useState<PaymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<PaymentUiError | null>(null);
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
      setError('missing_reference');
      setLoading(false);
      return { stop: true, fatal: true };
    }

    const response = await fetchWithAuthSession(`/api/get-payment-status?${apiQuery}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data.success || !data.payment) {
      setError('fetch_failed');
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
      setError('missing_reference');
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
    title: labels.incompleteTitle,
    message: labels.incompleteMessage,
    icon: '📌',
    className: 'payment-success__status--pending',
  });

  const getStatusMessage = (paymentData: PaymentStatus): StatusInfo => {
    switch (paymentData.status) {
      case 'succeeded':
        return {
          title: labels.succeededTitle,
          message: labels.succeededMessage,
          icon: '✅',
          className: 'payment-success__status--paid',
        };
      case 'pending':
      case 'waiting_for_capture':
        return getIncompleteStatusUi();
      case 'canceled':
        return {
          title: labels.canceledTitle,
          message: paymentData.cancellation_details?.reason
            ? `${labels.canceledWithReasonPrefix} ${paymentData.cancellation_details.reason}`
            : labels.canceledMessage,
          icon: '❌',
          className: 'payment-success__status--canceled',
        };
      default:
        return {
          title: labels.unknownTitle,
          message: `${labels.unknownStatusPrefix} ${paymentData.status}`,
          icon: '❓',
          className: 'payment-success__status--unknown',
        };
    }
  };

  const pageTitle =
    routeMode === 'success'
      ? labels.pageTitleSuccess
      : routeMode === 'fail'
        ? labels.pageTitleFail
        : labels.pageTitleResolve;

  const errorMessage = error === 'missing_reference' ? labels.missingReference : labels.fetchFailed;

  const redirectCountdownText =
    redirectCountdown === 1
      ? labels.redirectCountdownOne.replace('{seconds}', String(redirectCountdown))
      : labels.redirectCountdownMany.replace('{seconds}', String(redirectCountdown));

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
              <p>{labels.loading}</p>
            </div>
          ) : error ? (
            routeMode === 'fail' ? (
              <div className="payment-success__error">
                <h1>{labels.verifyErrorTitle}</h1>
                <p>{errorMessage}</p>
                <button
                  type="button"
                  className="payment-success__button"
                  onClick={() => window.location.reload()}
                >
                  {labels.reloadPage}
                </button>
              </div>
            ) : (
              <div className="payment-success__loading">
                <div className="payment-success__spinner" aria-hidden />
                <p>{labels.loading}</p>
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
                        <strong>{labels.amountLabel}</strong> {payment.amount.value}{' '}
                        {payment.amount.currency}
                      </p>
                      {payment.metadata?.customerEmail && (
                        <p>
                          <strong>{labels.emailLabel}</strong> {payment.metadata.customerEmail}
                        </p>
                      )}
                      {payment.metadata?.orderId && (
                        <p>
                          <strong>{labels.orderNumberLabel}</strong> {payment.metadata.orderId}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="payment-success__success-actions">
                    {returnTo ? (
                      <div className="payment-success__success-message">
                        <img
                          src="/images/illustrations/successful-payment.png"
                          alt={labels.successImageAlt}
                          className="payment-success__success-icon"
                        />
                        <p className="payment-success__success-text">
                          {labels.downloadLinkSentPrefix}{' '}
                          <strong>{payment.metadata?.customerEmail || ''}</strong>
                        </p>
                        {redirectCountdown > 0 && (
                          <p className="payment-success__redirect-note">{redirectCountdownText}</p>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="payment-success__details">
                          <p>
                            <strong>{labels.amountLabel}</strong> {payment.amount.value}{' '}
                            {payment.amount.currency}
                          </p>
                          {payment.metadata?.customerEmail && (
                            <p>
                              <strong>{labels.emailLabel}</strong> {payment.metadata.customerEmail}
                            </p>
                          )}
                          {payment.metadata?.orderId && (
                            <p>
                              <strong>{labels.orderNumberLabel}</strong> {payment.metadata.orderId}
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
                            {labels.myPurchases}
                          </button>
                        )}
                        <button
                          type="button"
                          className="payment-success__button"
                          onClick={() => navigate('/')}
                        >
                          {labels.home}
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
                      {labels.returnNow}
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
                    <p className="payment-success__muted-note">{labels.pollTimeoutNote}</p>
                  )}

                  <div className="payment-success__pending-actions">
                    {resumeCheckoutHref && isPendingLike ? (
                      <a
                        href={resumeCheckoutHref}
                        className="payment-success__button payment-success__button--primary"
                        target="_self"
                        rel="noopener noreferrer"
                      >
                        {labels.tryAgain}
                      </a>
                    ) : (
                      <button
                        type="button"
                        className="payment-success__button payment-success__button--primary"
                        onClick={handleTryAgainNavigate}
                      >
                        {labels.tryAgain}
                      </button>
                    )}
                    <button
                      type="button"
                      className="payment-success__button"
                      onClick={() => navigate('/')}
                    >
                      {labels.home}
                    </button>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="payment-success__error">
              <h1>{labels.orderNotFoundTitle}</h1>
              <p>{labels.orderNotFoundMessage}</p>
              <button
                type="button"
                className="payment-success__button"
                onClick={() => navigate('/')}
              >
                {labels.returnHome}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default PaymentSuccess;
