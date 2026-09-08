import { useState, useEffect, useCallback, useRef } from 'react';
import {
  useNavigate,
  useSearchParams,
  useLocation,
  type Location,
  type NavigateFunction,
} from 'react-router-dom';
import {
  isAuthenticated,
  isEmailVerified,
  getUser,
  AUTH_SESSION_CHANGED_EVENT,
} from '@shared/lib/auth';
import {
  abandonSessionExpiredReauth,
  consumeSessionExpiredBannerReason,
  SESSION_EXPIRED_REQUEST_EVENT,
  type SessionExpiredBannerReason,
} from '@shared/lib/sessionExpired';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { isArtistAccount, isListenerAccount } from '@shared/lib/accountType';
import { markFirstArtistOnboardingPending } from '@shared/lib/authIntent';
import { markListenerWelcomePending } from '@features/listenerWelcome';
import { resolvePostAuthDestinationForUser, sanitizeReturnPath } from '@shared/lib/authReturnUrl';
import {
  hasPendingArtistOnboarding,
  resolveArtistOnboardingDestination,
} from '@shared/lib/ownArtistPage';
import { useLang } from '@app/providers/lang';
import {
  clearAccountDeletedSession,
  clearAccountDeletedSkipReturn,
  shouldLeaveDeletedArtistPage,
} from '@shared/lib/accountDeletedSession';
import { useAuthSessionUser } from '@shared/lib/hooks/useAuthSessionUser';
import { useBodyScrollLock } from '@shared/lib/hooks/useBodyScrollLock';
import { Popup, PopupCloseButton } from '@shared/ui/popup';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import { NoindexHelmet } from '@shared/lib/seo/noindexRobotsMeta';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { RoleSelectionScreen } from './RoleSelectionScreen';
import { VerifyEmailModal } from './VerifyEmailModal';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import type { AccountType } from '@shared/lib/accountType';
import './AuthPage.scss';
import './RoleSelectionScreen.scss';

type AuthMode = 'login' | 'register' | 'forgot';
type RegisterStep = 'role' | 'form';

function getOverlayBackgroundLocation(state: Location['state']): Location | undefined {
  return (state as { backgroundLocation?: Location } | null)?.backgroundLocation;
}

/** Explicit return to underlying surface — avoids navigate(-1) after replace-based auth opens. */
function navigateToOverlayBackground(navigate: NavigateFunction, bg: Location): void {
  navigate(
    { pathname: bg.pathname, search: bg.search, hash: bg.hash ?? '' },
    { replace: true, state: bg.state ?? undefined }
  );
}

function resolveSessionExpiredBannerMessage(
  reason: SessionExpiredBannerReason,
  ui: ReturnType<typeof selectUiDictionaryFirst>
): string {
  if (reason === 'SESSION_EXPIRED') {
    return ui?.auth?.sessionExpired?.expired ?? 'Session expired. Please sign in again.';
  }
  return (
    ui?.auth?.sessionExpired?.invalid ?? 'Your session is no longer valid. Please sign in again.'
  );
}

/**
 * Auth surface работает в двух режимах:
 *
 *  1. **Overlay над текущей страницей** — типичный путь: пользователь
 *     кликает "Sign in" в Header / на artist page; navigate('/auth', {
 *     state: { backgroundLocation } }) сохраняет где он был. App.tsx
 *     рендерит underlying page по `backgroundLocation` и AuthPage поверх —
 *     artist page ОСТАЁТСЯ смонтированной, без re-fetch / skeleton, без
 *     потери scroll-позиции.
 *
 *  2. **Standalone page** — прямой переход по URL `/auth`. backgroundLocation
 *     отсутствует, AuthPage рендерится как полноэкранная страница.
 *
 * UI — shared `<Popup>` / native `<dialog>` (как UserDashboard, VerifyEmailModal).
 * Закрытие: × / backdrop / Escape → dialog.close() → `onClose` → `handleCloseAuth`
 * (overlay → явный переход в backgroundLocation; standalone → /).
 *
 * Body scroll lock (`useBodyScrollLock`) дополняет dialog: iOS Safari игнорирует
 * overflow:hidden на body, поэтому фиксируем scroll отдельно пока открыт auth-form.
 *
 * После успешного login/register пользователь сразу попадает на postAuthPath
 * (album page, checkout resume, /, …). Никакого onboarding-модала "выберите
 * язык" больше нет: язык определяется автоматически (`@shared/lib/lang`).
 */
export function AuthPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const user = useAuthSessionUser();
  const [mode, setMode] = useState<AuthMode>(() => {
    const m = searchParams.get('mode');
    if (m === 'register') return 'register';
    if (m === 'forgot') return 'forgot';
    return 'login';
  });
  const [registerStep, setRegisterStep] = useState<RegisterStep>('role');
  const [selectedAccountType, setSelectedAccountType] = useState<AccountType>('listener');
  const [forgotInitialEmail, setForgotInitialEmail] = useState('');
  const [showVerifyEmailModal, setShowVerifyEmailModal] = useState(() =>
    Boolean((location.state as { showVerifyEmail?: boolean } | null)?.showVerifyEmail)
  );
  const [sessionExpiredReason, setSessionExpiredReason] =
    useState<SessionExpiredBannerReason | null>(null);
  const navigate = useNavigate();
  /** Prevents duplicate post-auth navigations and Popup close from undoing them. */
  const postAuthNavigationStartedRef = useRef(false);

  const sessionExpiredMessage = sessionExpiredReason
    ? resolveSessionExpiredBannerMessage(sessionExpiredReason, ui)
    : null;

  const needsVerification = Boolean(user && !isEmailVerified(user));

  // True, когда AuthPage открыт как overlay поверх другой страницы — тогда
  // в `location.state.backgroundLocation` лежит URL underlying-страницы.
  const overlayBackground = getOverlayBackgroundLocation(location.state);
  const hasOverlayBackground = Boolean(overlayBackground);

  const finishPostAuthNavigation = useCallback(async () => {
    if (postAuthNavigationStartedRef.current) return;
    postAuthNavigationStartedRef.current = true;

    clearAccountDeletedSkipReturn();
    const currentUser = getUser();
    const returnToRaw = searchParams.get('returnTo');

    if (hasOverlayBackground) {
      const bg = overlayBackground;
      const bgPath = bg ? `${bg.pathname}${bg.search}${bg.hash ?? ''}` : '/';
      const destination = resolvePostAuthDestinationForUser(currentUser, {
        returnToSearchParam: returnToRaw,
        routerState: { backgroundLocation: bg ?? undefined },
      });

      if (isListenerAccount(currentUser)) {
        navigate(destination, { replace: true });
        return;
      }
      if (destination !== bgPath) {
        navigate(destination, { replace: true });
        return;
      }
      if (bg) {
        navigateToOverlayBackground(navigate, bg);
        return;
      }
      const explicitReturnTo = sanitizeReturnPath(returnToRaw);
      navigate(explicitReturnTo ?? '/', { replace: true });
      return;
    }

    const roleAwareDefault = resolvePostAuthDestinationForUser(currentUser, {
      returnToSearchParam: returnToRaw,
      routerState: location.state,
    });
    const destination = await resolveArtistOnboardingDestination(lang, {
      user: currentUser,
      defaultDestination: roleAwareDefault,
      pendingRegistration: hasPendingArtistOnboarding(currentUser),
    });
    navigate(destination, { replace: true });
  }, [hasOverlayBackground, lang, location.state, navigate, overlayBackground, searchParams]);

  const syncSessionExpiredBanner = useCallback(() => {
    const reason = consumeSessionExpiredBannerReason();
    if (reason) {
      setSessionExpiredReason(reason);
    }
  }, []);

  useEffect(() => {
    syncSessionExpiredBanner();
  }, [syncSessionExpiredBanner]);

  useEffect(() => {
    const onSessionExpired = () => syncSessionExpiredBanner();
    window.addEventListener(SESSION_EXPIRED_REQUEST_EVENT, onSessionExpired);
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, onSessionExpired);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_REQUEST_EVENT, onSessionExpired);
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, onSessionExpired);
    };
  }, [syncSessionExpiredBanner]);

  useEffect(() => {
    const m = searchParams.get('mode');
    if (m === 'register') {
      setMode('register');
      setRegisterStep('role');
    } else if (m === 'login') {
      setMode('login');
    } else if (m === 'forgot') {
      setMode('forgot');
    }
  }, [searchParams]);

  useEffect(() => {
    if (isAuthenticated() && !showVerifyEmailModal && !needsVerification) {
      void finishPostAuthNavigation();
    }
  }, [finishPostAuthNavigation, showVerifyEmailModal, needsVerification]);

  // Что показано на экране СЕЙЧАС: auth-form vs только VerifyEmailModal.
  // Scroll-lock вешается ДО early return, иначе нарушим rules-of-hooks.
  const isHidden = isAuthenticated() && !showVerifyEmailModal && !needsVerification;
  const showAuthForm = !showVerifyEmailModal && !isHidden;

  const handleCloseAuth = useCallback(() => {
    if (postAuthNavigationStartedRef.current) return;

    abandonSessionExpiredReauth();
    setSessionExpiredReason(null);

    if (shouldLeaveDeletedArtistPage()) {
      clearAccountDeletedSession();
      navigate({ pathname: '/', search: '' }, { replace: true });
      return;
    }
    if (overlayBackground) {
      navigateToOverlayBackground(navigate, overlayBackground);
      return;
    }
    navigate('/', { replace: true });
  }, [navigate, overlayBackground]);

  // iOS Safari: дополнение к native dialog scroll lock (см. useBodyScrollLock).
  // Лочим только пока auth-form на экране; при переходе на VerifyEmailModal
  // auth Popup размонтируется, verify Popup подхватит dialog top layer.
  useBodyScrollLock(showAuthForm);

  if (isHidden) {
    return null;
  }

  const handleRegisterSuccess = () => {
    const registeredUser = getUser();
    if (registeredUser?.id && isArtistAccount(registeredUser)) {
      markFirstArtistOnboardingPending(registeredUser.id);
    }
    if (registeredUser?.id && isListenerAccount(registeredUser)) {
      markListenerWelcomePending(registeredUser.id);
    }
    setShowVerifyEmailModal(true);
  };

  const handleLoginSuccess = () => {
    const current = getUser();
    if (current && !isEmailVerified(current)) {
      setShowVerifyEmailModal(true);
      return;
    }
    finishPostAuthNavigation();
  };

  const handleVerifyContinueLater = () => {
    setShowVerifyEmailModal(false);
    finishPostAuthNavigation();
  };

  const showRoleSelection = mode === 'register' && registerStep === 'role';

  return (
    <>
      <NoindexHelmet />
      <VerifyEmailModal
        isOpen={showVerifyEmailModal && needsVerification}
        onContinueLater={handleVerifyContinueLater}
        onClose={handleVerifyContinueLater}
      />

      {showAuthForm && (
        <Popup
          isActive
          onClose={handleCloseAuth}
          publicBackdrop
          autoFocusFirstElement={false}
          aria-labelledby="auth-page-title"
        >
          <div className="auth-page">
            <div
              className={`auth-page__container${showRoleSelection ? ' auth-page__container--wide' : ''}`}
            >
              <h2 id="auth-page-title" className="visually-hidden">
                {mode === 'register'
                  ? 'Create account'
                  : mode === 'forgot'
                    ? 'Reset password'
                    : 'Sign in'}
              </h2>
              <PopupCloseButton className="auth-page__close" aria-label="Закрыть">
                <ModalCloseIcon />
              </PopupCloseButton>
              {sessionExpiredMessage ? (
                <p className="auth-page__session-notice" role="status">
                  {sessionExpiredMessage}
                </p>
              ) : null}
              {mode === 'login' ? (
                <LoginForm
                  onSuccess={handleLoginSuccess}
                  onSwitchToRegister={() => {
                    setMode('register');
                    setRegisterStep('role');
                  }}
                  onForgotPassword={(currentEmail) => {
                    setForgotInitialEmail(currentEmail);
                    setMode('forgot');
                  }}
                />
              ) : mode === 'forgot' ? (
                <ForgotPasswordForm
                  initialEmail={forgotInitialEmail}
                  onBackToLogin={() => setMode('login')}
                />
              ) : showRoleSelection ? (
                <RoleSelectionScreen
                  onSelect={(accountType) => {
                    setSelectedAccountType(accountType);
                    setRegisterStep('form');
                  }}
                  onSwitchToLogin={() => setMode('login')}
                />
              ) : (
                <RegisterForm
                  accountType={selectedAccountType}
                  onSuccess={handleRegisterSuccess}
                  onSwitchToLogin={() => setMode('login')}
                  onBack={() => setRegisterStep('role')}
                />
              )}
            </div>
          </div>
        </Popup>
      )}
    </>
  );
}

export default AuthPage;
