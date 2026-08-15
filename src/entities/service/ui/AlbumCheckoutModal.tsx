/**
 * Direct album checkout modal.
 *
 * Заменяет старый cart → cart-modal → checkout-modal flow на один шаг:
 * Buy → этот модал → YooKassa redirect → /pay/status → /pay/success|/pay/fail.
 *
 * - Принимает один альбом через props (никакого cart-state снаружи).
 * - Сам подтягивает ownership через `useAlbumOwnedByViewer` и, если альбом
 *   уже куплен (например, оплата пришла из соседней вкладки), показывает
 *   download-CTA вместо формы.
 * - **Auth-gate**: гость НЕ пускается сразу в форму. Перед checkout мы
 *   показываем panel "Sign in / Create account" с объяснением, почему
 *   аккаунт нужен (постоянный доступ, скачивание с любого устройства).
 *   После auth resume-контроллер вернёт пользователя сюда и заново
 *   откроет модал — уже на форме с заполненным email из сессии.
 * - Платёж создаёт через `createPayment` и редиректит на YooKassa
 *   confirmation_url (или сразу на `/pay/success` если 3DS не требуется) —
 *   тот же контракт, что и раньше, чтобы не ломать `PaymentSuccess` и webhook.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Check as CheckIcon } from 'lucide-react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import type { AlbumDetails } from '@entities/album/model/albumDetails';
import AlbumCover from '@entities/album/ui/AlbumCover';
import { Popup, PopupCloseButton } from '@shared/ui/popup';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { getUser, isAuthenticated } from '@shared/lib/auth';
import { useAuthSessionUser } from '@shared/lib/hooks/useAuthSessionUser';
import { createPayment, CREATE_PAYMENT_ALREADY_OWNED } from '@shared/api/payment';
import { downloadOwnedAlbumZipByAuth, invalidateMyPurchasesCache } from '@shared/api/purchases';
import { getAlbumKeyForPaymentApis } from '@shared/lib/payment/albumPaymentKey';
import { formatAlbumDisplayFullName } from '@shared/lib/profileDisplayName';
import { useSiteArtistDisplayName } from '@shared/lib/hooks/useSiteArtistDisplayName';
import { beginAlbumCheckoutAuthIntent } from '@shared/lib/authIntent';
import { readReturnPathFromLocation } from '@shared/lib/authReturnUrl';
import {
  buildAlbumPaymentDevStatusUrl,
  buildAlbumPaymentStatusReturnUrl,
  buildAlbumPaymentSuccessUrl,
  buildAuthPath,
} from '@shared/lib/internalAppUrls';
import { buildLocalizedPublicPath } from '@shared/lib/i18n/routeLang/buildLocalizedPublicPath';
import { logDevPaymentAlbumRedirect } from '@shared/lib/payment/devPaymentMode';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import { DashboardButton } from '@shared/ui/dashboard';
import { getAlbumPrice } from '../lib/getAlbumPrice';
import { useAlbumOwnedByViewer } from '../lib/useAlbumOwnedByViewer';
import { resolveCheckoutBuyerIdentity } from '../lib/resolveCheckoutBuyerIdentity';
import './AlbumCheckoutModal.style.scss';

interface AlbumCheckoutModalProps {
  isOpen: boolean;
  album: AlbumDetails | null;
  onClose: () => void;
}

interface ValidationErrors {
  email?: string;
  agreeToOffer?: string;
  agreeToPrivacy?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const labelsFor = (
  lang: string,
  ui: ReturnType<typeof selectUiDictionaryFirst> | null
): {
  title: string;
  alreadyOwnedTitle: string;
  alreadyOwnedDescription: string;
  downloadCta: string;
  downloadingCta: string;
  close: string;
  email: string;
  agreeCombinedPrefix: string;
  agreeCombinedAnd: string;
  publicOffer: string;
  privacyPolicy: string;
  payCta: string;
  payCtaProcessing: string;
  secureNote: string;
  emailRequired: string;
  emailInvalid: string;
  agreeToOfferRequired: string;
  agreeToPrivacyRequired: string;
  paymentErrorGeneric: string;
  authGateTitle: string;
  authGateDescription: string;
  authGateBenefitLibrary: string;
  authGateBenefitDevices: string;
  authGateBenefitSecure: string;
  authGateSignIn: string;
  authGateCreateAccount: string;
  authGateSwitchToSignIn: string;
  authGateSwitchToCreateAccount: string;
} => {
  const checkout = ui?.checkout;
  const authGate = checkout?.authGate;
  const buttons = ui?.buttons;
  const en = lang === 'en';

  return {
    title: en ? 'Buy album' : 'Купить альбом',
    alreadyOwnedTitle: en ? 'Already in My Purchases' : 'Уже в «Мои покупках»',
    alreadyOwnedDescription: en
      ? 'This album is already in My Purchases.'
      : 'Этот альбом уже есть в «Мои покупках».',
    downloadCta: buttons?.downloadAlbum ?? (en ? 'Download Album' : 'Скачать альбом'),
    downloadingCta: buttons?.downloadAlbumLoading ?? (en ? 'Downloading...' : 'Скачивание...'),
    close: en ? 'Close' : 'Закрыть',
    authGateTitle:
      authGate?.title ??
      (en ? 'Sign in to complete your purchase' : 'Войдите, чтобы завершить покупку'),
    authGateDescription:
      authGate?.description ??
      (en
        ? 'Sign in to save this album to My Purchases — re-download any time, on any device.'
        : 'Альбом сохранится в «Мои покупки» — вы сможете скачать его в любой момент с любого устройства.'),
    authGateBenefitLibrary:
      authGate?.benefitLibrary ??
      (en ? 'Album saved to your account forever' : 'Альбом останется в вашем аккаунте навсегда'),
    authGateBenefitDevices:
      authGate?.benefitDevices ??
      (en
        ? 'Re-download any time, on any device'
        : 'Скачивание в любое время и с любого устройства'),
    authGateBenefitSecure:
      authGate?.benefitSecure ??
      (en ? 'Secure access — no broken email links' : 'Надёжный доступ — не нужны ссылки из писем'),
    authGateSignIn: authGate?.signIn ?? (en ? 'Sign in' : 'Войти'),
    authGateCreateAccount: authGate?.createAccount ?? (en ? 'Create account' : 'Создать аккаунт'),
    authGateSwitchToSignIn:
      authGate?.switchToSignIn ??
      (en ? 'Already have an account? Sign in' : 'Уже есть аккаунт? Войдите'),
    authGateSwitchToCreateAccount:
      authGate?.switchToCreateAccount ??
      (en ? 'New here? Create an account' : 'Ещё нет аккаунта? Создайте'),
    email: checkout?.checkout?.emailAddress ?? (en ? 'Email' : 'Email'),
    agreeCombinedPrefix:
      checkout?.checkout?.agreeToOffer ??
      (en ? 'I agree to the' : 'Я ознакомился(ась) и согласен(на) с'),
    agreeCombinedAnd: en ? 'and' : 'и',
    publicOffer: checkout?.checkout?.publicOffer ?? (en ? 'Public Offer' : 'Публичной офертой'),
    privacyPolicy:
      checkout?.checkout?.privacyPolicy ?? (en ? 'Privacy Policy' : 'Политикой конфиденциальности'),
    payCta:
      checkout?.payment?.proceedToPayment ?? (en ? 'Continue to payment' : 'Перейти к оплате'),
    payCtaProcessing: checkout?.payment?.processing ?? (en ? 'Processing...' : 'Обработка...'),
    secureNote:
      checkout?.payment?.securePaymentInfo ??
      (en
        ? 'Payment is processed securely on the YooKassa page.'
        : 'Оплата проходит на защищённой странице ЮKassa.'),
    emailRequired:
      checkout?.validation?.emailRequired ?? (en ? 'Email is required' : 'Введите email'),
    emailInvalid:
      checkout?.validation?.emailInvalid ??
      (en ? 'Please enter a valid email' : 'Некорректный email'),
    agreeToOfferRequired:
      checkout?.validation?.agreeToOfferRequired ??
      (en ? 'You must agree to the offer' : 'Подтвердите согласие с офертой'),
    agreeToPrivacyRequired:
      checkout?.validation?.agreeToPrivacyRequired ??
      (en ? 'You must agree to the privacy policy' : 'Подтвердите согласие на обработку данных'),
    paymentErrorGeneric: en
      ? 'Something went wrong while creating the payment. Please try again.'
      : 'Не удалось создать платёж. Попробуйте ещё раз.',
  };
};

function readInitialEmail(): string {
  return getUser()?.email ?? '';
}

export function AlbumCheckoutModal({ isOpen, album, onClose }: AlbumCheckoutModalProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const [searchParams] = useSearchParams();
  const artistSlug = searchParams.get('artist');
  const navigate = useNavigate();
  const location = useLocation();
  // viewer переподписан на AUTH_SESSION_CHANGED_EVENT — модал сам перерисуется
  // на гостевую/авторизованную ветку без перемонтирования.
  const viewer = useAuthSessionUser();
  const isGuest = !viewer || !isAuthenticated();

  const { displayName: siteArtistName, displayLabel: siteArtistLabel } = useSiteArtistDisplayName(
    lang,
    { artistSlug }
  );
  const { displayName: buyerProfileName } = useSiteArtistDisplayName(lang, {
    variant: 'authenticated',
  });

  const labels = labelsFor(lang, ui);
  const buyerIdentity = useMemo(
    () => resolveCheckoutBuyerIdentity(viewer, lang, buyerProfileName),
    [viewer, lang, buyerProfileName]
  );

  // Ownership check — active only while modal is open AND viewer is auth'd,
  // чтобы не дёргать API на каждой странице с не-открытым модалом.
  const { isOwned, ownedPurchase } = useAlbumOwnedByViewer(
    album ?? { albumId: '', dbAlbumId: '' },
    isOpen && !isGuest
  );

  const [email, setEmail] = useState('');
  const [agreeToOffer, setAgreeToOffer] = useState(false);
  const [agreeToPrivacy, setAgreeToPrivacy] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [serverConfirmedOwned, setServerConfirmedOwned] = useState(false);
  const showOwned = isOwned || serverConfirmedOwned;

  // При каждом открытии — пре-заполнение из auth-сессии и сброс ошибок.
  useEffect(() => {
    if (!isOpen) return;
    setEmail(readInitialEmail());
    setAgreeToOffer(false);
    setAgreeToPrivacy(false);
    setErrors({});
    setPaymentError(null);
    setIsSubmitting(false);
    setIsDownloading(false);
    setServerConfirmedOwned(false);
  }, [isOpen]);

  if (!album) {
    return null;
  }

  const { formatted: formattedPrice } = getAlbumPrice(album);
  const albumKey = getAlbumKeyForPaymentApis(album);
  const authGateBenefits = [
    labels.authGateBenefitLibrary,
    labels.authGateBenefitDevices,
    labels.authGateBenefitSecure,
  ];
  const authGateBenefitCheckProps = dashboardActionIconProps({ size: 18 });

  const validate = (): boolean => {
    const next: ValidationErrors = {};
    if (!email.trim()) next.email = labels.emailRequired;
    else if (!EMAIL_REGEX.test(email)) next.email = labels.emailInvalid;
    if (!agreeToOffer) next.agreeToOffer = labels.agreeToOfferRequired;
    if (!agreeToPrivacy) next.agreeToPrivacy = labels.agreeToPrivacyRequired;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validate()) {
      return;
    }
    if (!albumKey) {
      setPaymentError(labels.paymentErrorGeneric);
      return;
    }

    setIsSubmitting(true);
    setPaymentError(null);

    try {
      const returnTo = readReturnPathFromLocation(location);
      const returnUrl =
        typeof window !== 'undefined' ? buildAlbumPaymentStatusReturnUrl(returnTo) : '';

      const result = await createPayment({
        albumId: albumKey,
        customerEmail: email,
        returnUrl,
        billingData: { buyerDisplayName: buyerIdentity.displayName },
      });

      if (!result.success) {
        if (result.error === CREATE_PAYMENT_ALREADY_OWNED) {
          invalidateMyPurchasesCache();
          setServerConfirmedOwned(true);
          setPaymentError(null);
          setIsSubmitting(false);
          return;
        }

        setPaymentError(result.message || result.error || labels.paymentErrorGeneric);
        setIsSubmitting(false);
        return;
      }

      if (result.devPaymentCompleted || result.fulfillmentRecovered) {
        if (result.orderId && typeof window !== 'undefined') {
          if (result.devPaymentCompleted) {
            const statusUrl = buildAlbumPaymentDevStatusUrl({
              orderId: result.orderId,
              returnTo,
            });
            logDevPaymentAlbumRedirect({
              orderId: result.orderId,
              paymentId: result.paymentId,
              redirectUrl: (() => {
                const parsed = new URL(statusUrl);
                return `${parsed.pathname}${parsed.search}`;
              })(),
            });
            window.location.href = statusUrl;
            return;
          }

          window.location.href = buildAlbumPaymentSuccessUrl(result.orderId);
        }
        return;
      }

      if (result.confirmationUrl) {
        if (typeof window !== 'undefined') {
          window.location.href = result.confirmationUrl;
        }
        return;
      }

      if (result.orderId && typeof window !== 'undefined') {
        window.location.href = buildAlbumPaymentSuccessUrl(result.orderId);
        return;
      }

      setPaymentError(labels.paymentErrorGeneric);
      setIsSubmitting(false);
    } catch (error) {
      console.error('Album checkout failed:', error);
      setPaymentError(error instanceof Error ? error.message : labels.paymentErrorGeneric);
      setIsSubmitting(false);
    }
  };

  const handleGoToAuth = (mode: 'login' | 'register') => {
    if (!albumKey) {
      setPaymentError(labels.paymentErrorGeneric);
      return;
    }
    const returnTo = readReturnPathFromLocation(location);

    beginAlbumCheckoutAuthIntent({
      albumKey,
      dbAlbumId: album?.dbAlbumId ?? '',
      returnTo,
    });

    const params = new URLSearchParams();
    params.set('mode', mode);
    params.set('returnTo', returnTo);

    onClose();
    navigate(buildAuthPath(params), {
      state: { backgroundLocation: location },
    });
  };

  const handleDownloadOwned = async () => {
    if (!albumKey || isDownloading) {
      return;
    }
    const tracks =
      album.tracks?.length > 0
        ? album.tracks.map((track) => ({ trackId: String(track.id), title: track.title }))
        : (ownedPurchase?.tracks ?? []);
    if (tracks.length === 0) {
      setPaymentError(labels.paymentErrorGeneric);
      return;
    }

    setIsDownloading(true);
    try {
      await downloadOwnedAlbumZipByAuth({
        albumId: albumKey,
        artist: siteArtistName.trim() || siteArtistLabel,
        album: album.title,
        tracks,
      });
    } catch (error) {
      console.error('Owned album download failed:', error);
      setPaymentError(error instanceof Error ? error.message : labels.paymentErrorGeneric);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Popup
      isActive={isOpen}
      onClose={onClose}
      publicBackdrop
      aria-labelledby="album-checkout-modal-title"
    >
      <div className="album-checkout-modal">
        <div className="album-checkout-modal__container">
          <header className="album-checkout-modal__hero">
            <div className="album-checkout-modal__hero-cover">
              {album.cover ? (
                <AlbumCover
                  img={album.cover}
                  userId={album.userId}
                  fullName={formatAlbumDisplayFullName(siteArtistName, album.title)}
                  size={128}
                  densities={[1, 2]}
                  sizes="128px"
                />
              ) : (
                <div className="album-checkout-modal__hero-cover-placeholder" aria-hidden="true" />
              )}
            </div>
            <div className="album-checkout-modal__hero-meta">
              <p className="album-checkout-modal__hero-artist">{siteArtistLabel}</p>
              <h2 id="album-checkout-modal-title" className="album-checkout-modal__hero-title">
                {album.title}
              </h2>
              <p className="album-checkout-modal__hero-price">{formattedPrice}</p>
            </div>
            <PopupCloseButton className="album-checkout-modal__close" aria-label={labels.close}>
              <ModalCloseIcon />
            </PopupCloseButton>
          </header>

          {showOwned ? (
            <section className="album-checkout-modal__owned" aria-live="polite">
              <h3 className="album-checkout-modal__owned-title">{labels.alreadyOwnedTitle}</h3>
              <p className="album-checkout-modal__owned-description">
                {labels.alreadyOwnedDescription}
              </p>
              {paymentError && (
                <div className="album-checkout-modal__error" role="alert">
                  {paymentError}
                </div>
              )}
              <div className="album-checkout-modal__actions">
                <DashboardButton
                  type="button"
                  variant="primary"
                  loading={isDownloading}
                  disabled={isDownloading}
                  onClick={() => void handleDownloadOwned()}
                >
                  {isDownloading ? labels.downloadingCta : labels.downloadCta}
                </DashboardButton>
              </div>
            </section>
          ) : isGuest ? (
            <section className="album-checkout-modal__auth-gate" aria-live="polite">
              <h3 className="album-checkout-modal__auth-gate-title">{labels.authGateTitle}</h3>
              <p className="album-checkout-modal__auth-gate-description">
                {labels.authGateDescription}
              </p>
              <ul className="album-checkout-modal__auth-gate-benefits">
                {authGateBenefits.map((benefit) => (
                  <li key={benefit} className="album-checkout-modal__auth-gate-benefit">
                    <span
                      className="album-checkout-modal__auth-gate-benefit-icon"
                      aria-hidden="true"
                    >
                      <CheckIcon {...authGateBenefitCheckProps} />
                    </span>
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
              {paymentError && (
                <div className="album-checkout-modal__error" role="alert">
                  {paymentError}
                </div>
              )}
              <div className="album-checkout-modal__actions">
                <DashboardButton
                  type="button"
                  variant="primary"
                  onClick={() => handleGoToAuth('register')}
                >
                  {labels.authGateCreateAccount}
                </DashboardButton>
                <DashboardButton
                  type="button"
                  variant="outline"
                  onClick={() => handleGoToAuth('login')}
                >
                  {labels.authGateSignIn}
                </DashboardButton>
              </div>
            </section>
          ) : (
            <form className="album-checkout-modal__form" onSubmit={handleSubmit} noValidate>
              <div className="album-checkout-modal__field">
                <span className="album-checkout-modal__label">{labels.email}</span>
                <p className="album-checkout-modal__email-value">{email}</p>
                {errors.email && (
                  <span className="album-checkout-modal__field-error">{errors.email}</span>
                )}
              </div>

              <label className="album-checkout-modal__agreement">
                <input
                  type="checkbox"
                  className="album-checkout-modal__checkbox"
                  checked={agreeToOffer && agreeToPrivacy}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setAgreeToOffer(checked);
                    setAgreeToPrivacy(checked);
                    if (errors.agreeToOffer || errors.agreeToPrivacy) {
                      setErrors((prev) => ({
                        ...prev,
                        agreeToOffer: undefined,
                        agreeToPrivacy: undefined,
                      }));
                    }
                  }}
                  required
                />
                <span className="album-checkout-modal__agreement-text">
                  {labels.agreeCombinedPrefix}{' '}
                  <Link
                    to={buildLocalizedPublicPath(lang, '/offer')}
                    target="_blank"
                    rel="noopener"
                    className="album-checkout-modal__link"
                  >
                    {labels.publicOffer}
                  </Link>{' '}
                  {labels.agreeCombinedAnd}{' '}
                  <Link
                    to={buildLocalizedPublicPath(lang, '/privacy')}
                    target="_blank"
                    rel="noopener"
                    className="album-checkout-modal__link"
                  >
                    {labels.privacyPolicy}
                  </Link>
                  .
                  {(errors.agreeToOffer || errors.agreeToPrivacy) && (
                    <span className="album-checkout-modal__field-error">
                      {errors.agreeToOffer ?? errors.agreeToPrivacy}
                    </span>
                  )}
                </span>
              </label>

              {paymentError && (
                <div className="album-checkout-modal__error" role="alert">
                  {paymentError}
                </div>
              )}

              <div className="album-checkout-modal__actions">
                <DashboardButton
                  type="submit"
                  variant="primary"
                  loading={isSubmitting}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? labels.payCtaProcessing : labels.payCta}
                </DashboardButton>
              </div>
            </form>
          )}
        </div>
      </div>
    </Popup>
  );
}

export default AlbumCheckoutModal;
