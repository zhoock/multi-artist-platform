// src/pages/PaymentSuccess/PaymentSuccess.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { noindexRobotsMetaElement } from '@shared/lib/seo/noindexRobotsMeta';
import './PaymentSuccess.style.scss';
import { useLang } from '@app/providers/lang';
import {
  appendCheckoutStatusTokenQuery,
  readCheckoutStatusTokenParams,
} from '@shared/lib/payment/checkoutStatusTokenParams';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { invalidateMyPurchasesCache } from '@shared/api/purchases';
import { redirectToAlbumReturnPath } from '@shared/lib/albumPurchaseSuccessToast';
import { DashboardButton } from '@shared/ui/dashboard';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import AlbumCover from '@entities/album/ui/AlbumCover';
import { Mail as MailIcon } from 'lucide-react';
import {
  ALBUM_PAY_FAIL_PATH,
  ALBUM_PAY_SUCCESS_PATH,
  albumPaymentModeFromPathname,
  albumPaymentOutcomePath,
  type AlbumPaymentRouteMode,
} from '@shared/lib/paymentRoutes';
import { platformDisplayName } from '@shared/constants/platformBranding';
import {
  buildPaymentSuccessPreviewState,
  isPaymentSuccessPreviewActive,
  PAYMENT_SUCCESS_PREVIEW_PLACEHOLDER_COVER,
} from './paymentSuccessPreview';

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

interface PurchasedAlbumInfo {
  title: string;
  artistDisplayName: string;
  cover: string | null;
  userId: string | null;
}

interface StatusInfo {
  title: string;
  message: string;
  className: string;
}

type PaymentUiError = 'missing_reference' | 'fetch_failed';

function SuccessCheckIcon() {
  return (
    <svg
      className="payment-success__check-icon"
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M8 14.5L12 18.5L20 10.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const labelsFor = (lang: string, ui: ReturnType<typeof selectUiDictionaryFirst> | null) => {
  const copy = ui?.checkout?.paymentSuccess;
  const en = lang === 'en';

  return {
    pageTitleSuccess:
      copy?.pageTitleSuccess ??
      (en
        ? `Payment successful — ${platformDisplayName('en')}`
        : `Оплата успешна — ${platformDisplayName('ru')}`),
    pageTitleFail:
      copy?.pageTitleFail ??
      (en
        ? `Payment not completed — ${platformDisplayName('en')}`
        : `Платёж не завершён — ${platformDisplayName('ru')}`),
    pageTitleResolve:
      copy?.pageTitleResolve ??
      (en
        ? `Payment status — ${platformDisplayName('en')}`
        : `Статус оплаты — ${platformDisplayName('ru')}`),
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
    succeededTitle: copy?.succeededTitle ?? (en ? 'Purchase complete' : 'Покупка завершена'),
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
    pollTimeoutTitle:
      copy?.pollTimeoutTitle ??
      (en ? 'Payment is taking longer than usual.' : 'Оплата обрабатывается дольше обычного.'),
    checkAgain: copy?.checkAgain ?? (en ? 'Check again' : 'Проверить ещё раз'),
    downloadLinkSentPrefix:
      copy?.downloadLinkSentPrefix ??
      (en ? 'Purchase confirmation sent to' : 'Подтверждение покупки отправлено на'),
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

function isPendingLikeStatus(status: PaymentStatus['status'] | undefined): boolean {
  return status === 'pending' || status === 'waiting_for_capture';
}

function PaymentSuccessPurchasedAlbum({
  album,
  usePlaceholderCover = false,
}: {
  album: PurchasedAlbumInfo;
  usePlaceholderCover?: boolean;
}) {
  const coverKey = album.cover?.trim() ?? '';

  return (
    <div className="payment-success__album">
      {usePlaceholderCover ? (
        <div className="payment-success__album-cover">
          <img
            src={PAYMENT_SUCCESS_PREVIEW_PLACEHOLDER_COVER}
            alt={`Обложка альбома ${album.title}`}
            className="album-cover__image"
            loading="eager"
            decoding="async"
          />
        </div>
      ) : coverKey ? (
        <div className="payment-success__album-cover">
          <AlbumCover
            img={coverKey}
            userId={album.userId ?? undefined}
            fullName={album.title}
            size={72}
            densities={[1]}
            sizes="72px"
            imageSource="cdn"
          />
        </div>
      ) : (
        <div
          className="payment-success__album-cover payment-success__album-cover--placeholder"
          aria-hidden
        />
      )}
      <div className="payment-success__album-meta">
        <p className="payment-success__album-title">{album.title}</p>
        <p className="payment-success__album-artist">{album.artistDisplayName}</p>
      </div>
    </div>
  );
}

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
  const returnToParam = searchParams.get('returnTo');
  const checkoutStatusToken = useMemo(
    () => readCheckoutStatusTokenParams(searchParams),
    [searchParams]
  );
  const isPreviewMode = isPaymentSuccessPreviewActive(searchParams.get('preview'));
  const previewState = useMemo(
    () => (isPreviewMode ? buildPaymentSuccessPreviewState(returnToParam) : null),
    [isPreviewMode, returnToParam]
  );
  const returnTo = isPreviewMode ? (previewState?.returnTo ?? null) : returnToParam;
  const [payment, setPayment] = useState<PaymentStatus | null>(
    () => (previewState?.payment as PaymentStatus | undefined) ?? null
  );
  const [purchasedAlbum, setPurchasedAlbum] = useState<PurchasedAlbumInfo | null>(
    () => previewState?.purchasedAlbum ?? null
  );
  const [loading, setLoading] = useState(() => !isPreviewMode);
  const [error, setError] = useState<PaymentUiError | null>(null);
  const [statusCheckTimedOut, setStatusCheckTimedOut] = useState(false);
  const [pollSession, setPollSession] = useState(0);

  const pollCountRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRecheckPayment = useCallback(() => {
    setStatusCheckTimedOut(false);
    setLoading(true);
    setPollSession((session) => session + 1);
  }, []);

  const resolveApiQuery = useCallback((): string | null => {
    const query = new URLSearchParams();
    if (paymentIdParam) {
      query.set('paymentId', paymentIdParam);
    } else if (orderIdParam) {
      if (isYooKassaPaymentId(orderIdParam)) {
        query.set('paymentId', orderIdParam);
      } else {
        query.set('orderId', orderIdParam);
      }
    } else {
      return null;
    }
    appendCheckoutStatusTokenQuery(query, checkoutStatusToken);
    return query.toString();
  }, [paymentIdParam, orderIdParam, checkoutStatusToken]);

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
    if (data.album) {
      setPurchasedAlbum(data.album as PurchasedAlbumInfo);
    }
    setLoading(false);

    const yookassaStatus = data.payment.status;
    const final = yookassaStatus === 'succeeded' || yookassaStatus === 'canceled';
    return { stop: final, fatal: false };
  }, [resolveApiQuery]);

  useEffect(() => {
    if (isPreviewMode) {
      return undefined;
    }

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
  }, [paymentIdParam, orderIdParam, fetchPaymentOnce, isPreviewMode, pollSession]);

  const buildOutcomeUrl = useCallback(
    (pathname: string) => `${pathname}${location.search}`,
    [location.search]
  );

  // Align URL with payment outcome: /pay/status → success|fail; guard legacy /pay/success links.
  useEffect(() => {
    if (isPreviewMode || loading) {
      return;
    }

    if (routeMode === 'resolve') {
      if (error || !payment) {
        navigate(buildOutcomeUrl(ALBUM_PAY_FAIL_PATH), { replace: true });
        return;
      }

      const isFinal = payment.status === 'succeeded' || payment.status === 'canceled';
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
  }, [routeMode, loading, error, payment, navigate, buildOutcomeUrl, isPreviewMode]);

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
  const cacheInvalidatedRef = useRef(false);
  useEffect(() => {
    if (isPreviewMode) {
      return;
    }

    if (payment?.status === 'succeeded' && !cacheInvalidatedRef.current) {
      cacheInvalidatedRef.current = true;
      invalidateMyPurchasesCache();
    }
  }, [payment?.status, isPreviewMode]);

  const getIncompleteStatusUi = (): StatusInfo => ({
    title: labels.incompleteTitle,
    message: labels.incompleteMessage,
    className: 'payment-success__status--pending',
  });

  const getStatusMessage = (paymentData: PaymentStatus): StatusInfo => {
    switch (paymentData.status) {
      case 'pending':
      case 'waiting_for_capture':
        return getIncompleteStatusUi();
      case 'canceled':
        return {
          title: labels.canceledTitle,
          message: paymentData.cancellation_details?.reason
            ? `${labels.canceledWithReasonPrefix} ${paymentData.cancellation_details.reason}`
            : labels.canceledMessage,
          className: 'payment-success__status--canceled',
        };
      default:
        return {
          title: labels.unknownTitle,
          message: `${labels.unknownStatusPrefix} ${paymentData.status}`,
          className: 'payment-success__status--unknown',
        };
    }
  };

  const pageTitle =
    isPreviewMode || routeMode === 'success'
      ? labels.pageTitleSuccess
      : routeMode === 'fail'
        ? labels.pageTitleFail
        : labels.pageTitleResolve;

  const errorMessage = error === 'missing_reference' ? labels.missingReference : labels.fetchFailed;

  const customerEmail = payment?.metadata?.customerEmail?.trim() ?? '';

  const showResolveLoading = !isPreviewMode && routeMode === 'resolve' && !statusCheckTimedOut;
  const showResolveTimeout =
    !isPreviewMode &&
    routeMode === 'resolve' &&
    statusCheckTimedOut &&
    payment != null &&
    isPendingLikeStatus(payment.status);
  const showSuccessOutcome =
    (isPreviewMode || routeMode === 'success') && payment?.status === 'succeeded';
  const showFailOutcome =
    !isPreviewMode && routeMode === 'fail' && payment != null && payment.status !== 'succeeded';
  const showRouteAlignLoading =
    !isPreviewMode &&
    routeMode !== 'resolve' &&
    (loading || (payment != null && !showSuccessOutcome && !showFailOutcome));

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        {noindexRobotsMetaElement}
      </Helmet>
      <div className="payment-success">
        <div className="payment-success__container">
          {showResolveLoading || showRouteAlignLoading ? (
            <div className="payment-success__loading">
              <div className="payment-success__spinner" aria-hidden />
              <p>{labels.loading}</p>
            </div>
          ) : showResolveTimeout && payment ? (
            <div className="payment-success__status payment-success__status--pending">
              <h1 className="payment-success__title">{labels.pollTimeoutTitle}</h1>
              <div className="payment-success__pending-actions">
                <DashboardButton variant="primary" onClick={handleRecheckPayment}>
                  {labels.checkAgain}
                </DashboardButton>
                <DashboardButton variant="outline" onClick={() => navigate('/')}>
                  {labels.home}
                </DashboardButton>
              </div>
            </div>
          ) : error ? (
            routeMode === 'fail' ? (
              <div className="payment-success__error">
                <h1>{labels.verifyErrorTitle}</h1>
                <p>{errorMessage}</p>
                <DashboardButton variant="primary" onClick={() => window.location.reload()}>
                  {labels.reloadPage}
                </DashboardButton>
              </div>
            ) : (
              <div className="payment-success__loading">
                <div className="payment-success__spinner" aria-hidden />
                <p>{labels.loading}</p>
              </div>
            )
          ) : showSuccessOutcome && payment ? (
            <div className="payment-success__status payment-success__status--paid payment-success__outcome">
              <div className="payment-success__outcome-header">
                <div className="payment-success__check-badge" aria-hidden>
                  <SuccessCheckIcon />
                </div>
                <h1 className="payment-success__title">{labels.succeededTitle}</h1>
              </div>

              {purchasedAlbum && (
                <>
                  <div className="payment-success__divider" aria-hidden />
                  <PaymentSuccessPurchasedAlbum
                    album={purchasedAlbum}
                    usePlaceholderCover={
                      isPreviewMode && (previewState?.usePlaceholderCover ?? false)
                    }
                  />
                </>
              )}

              {customerEmail && (
                <>
                  <div className="payment-success__divider" aria-hidden />
                  <div className="payment-success__email-block">
                    <MailIcon className="payment-success__mail-icon" size={20} aria-hidden />
                    <div className="payment-success__email-copy">
                      <p className="payment-success__email-label">
                        {labels.downloadLinkSentPrefix}
                      </p>
                      <p className="payment-success__email-value">{customerEmail}</p>
                    </div>
                  </div>
                </>
              )}

              <div className="payment-success__actions">
                {returnTo ? (
                  <DashboardButton
                    variant="primary"
                    onClick={() => redirectToAlbumReturnPath(returnTo)}
                  >
                    {labels.returnNow}
                  </DashboardButton>
                ) : (
                  <DashboardButton variant="outline" onClick={() => navigate('/')}>
                    {labels.returnHome}
                  </DashboardButton>
                )}
              </div>
            </div>
          ) : showFailOutcome && payment ? (
            (() => {
              const statusInfo = getStatusMessage(payment);
              const isPendingLike = isPendingLikeStatus(payment.status);
              const resumeCheckoutHref = payment.confirmation_url?.trim() || '';

              return (
                <div className={`payment-success__status ${statusInfo.className}`}>
                  <h1 className="payment-success__title">{statusInfo.title}</h1>
                  <p className="payment-success__message">{statusInfo.message}</p>

                  <div className="payment-success__pending-actions">
                    {resumeCheckoutHref && isPendingLike ? (
                      <DashboardButton
                        as="a"
                        variant="primary"
                        href={resumeCheckoutHref}
                        target="_self"
                        rel="noopener noreferrer"
                      >
                        {labels.tryAgain}
                      </DashboardButton>
                    ) : (
                      <DashboardButton variant="primary" onClick={handleTryAgainNavigate}>
                        {labels.tryAgain}
                      </DashboardButton>
                    )}
                    <DashboardButton variant="outline" onClick={() => navigate('/')}>
                      {labels.home}
                    </DashboardButton>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="payment-success__error">
              <h1>{labels.orderNotFoundTitle}</h1>
              <p>{labels.orderNotFoundMessage}</p>
              <div className="payment-success__actions">
                <DashboardButton variant="outline" onClick={() => navigate('/')}>
                  {labels.returnHome}
                </DashboardButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default PaymentSuccess;
