import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation, type Location } from 'react-router-dom';
import {
  isAuthenticated,
  isEmailVerified,
  getUser,
  AUTH_EXPIRED_BANNER_SESSION_KEY,
} from '@shared/lib/auth';
import { isArtistAccount, isListenerAccount } from '@shared/lib/accountType';
import { markFirstArtistOnboardingPending } from '@shared/lib/authIntent';
import { markListenerWelcomePending } from '@features/listenerWelcome';
import { resolvePostAuthDestinationForUser } from '@shared/lib/authReturnUrl';
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
import { ModalBackdrop } from '@shared/ui/localModal';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
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
 * Закрытие модала: Close-button / клик по backdrop / Escape. В overlay-режиме
 * `navigate(-1)` возвращает на underlying URL; в standalone — `navigate('/')`,
 * чтобы пользователь не вылетел за пределы сайта (предыдущая запись истории
 * могла быть внешней).
 *
 * Body scroll lock включается пока открыт login/register/forgot, чтобы
 * underlying страница не прокручивалась пальцем под модалом (важно на iOS).
 *
 * После успешного login/register пользователь сразу попадает на postAuthPath
 * (album page, checkout resume, /, …). Никакого onboarding-модала "выберите
 * язык" больше нет: язык определяется автоматически (`@shared/lib/lang`).
 */
export function AuthPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { lang } = useLang();
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
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null);
  const navigate = useNavigate();

  const needsVerification = Boolean(user && !isEmailVerified(user));

  // True, когда AuthPage открыт как overlay поверх другой страницы — тогда
  // в `location.state.backgroundLocation` лежит URL underlying-страницы.
  const hasOverlayBackground = Boolean(
    (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation
  );

  const finishPostAuthNavigation = useCallback(async () => {
    clearAccountDeletedSkipReturn();
    const currentUser = getUser();

    if (hasOverlayBackground) {
      const bg = (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation;
      const destination = resolvePostAuthDestinationForUser(currentUser, {
        returnToSearchParam: searchParams.get('returnTo'),
        routerState: { backgroundLocation: bg ?? undefined },
      });
      if (isListenerAccount(currentUser)) {
        navigate(destination, { replace: true });
        return;
      }
      const bgPath = bg ? `${bg.pathname}${bg.search}${bg.hash ?? ''}` : '/';
      if (destination !== bgPath) {
        navigate(destination, { replace: true });
      } else {
        navigate(-1);
      }
      return;
    }

    const roleAwareDefault = resolvePostAuthDestinationForUser(currentUser, {
      returnToSearchParam: searchParams.get('returnTo'),
      routerState: location.state,
    });
    const destination = await resolveArtistOnboardingDestination(lang, {
      user: currentUser,
      defaultDestination: roleAwareDefault,
      pendingRegistration: hasPendingArtistOnboarding(currentUser),
    });
    navigate(destination, { replace: true });
  }, [hasOverlayBackground, lang, location.state, navigate, searchParams]);

  useEffect(() => {
    try {
      const msg = sessionStorage.getItem(AUTH_EXPIRED_BANNER_SESSION_KEY);
      if (msg) {
        setSessionExpiredMessage(msg);
        sessionStorage.removeItem(AUTH_EXPIRED_BANNER_SESSION_KEY);
      }
    } catch {
      /* ignore */
    }
  }, []);

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
  // Для скрытия мы используем auth-логику ниже + early return — но scroll-lock
  // и Escape должны вешаться ДО early return, иначе нарушим rules-of-hooks.
  const isHidden = isAuthenticated() && !showVerifyEmailModal && !needsVerification;
  const showAuthForm = !showVerifyEmailModal && !isHidden;

  const handleCloseAuth = useCallback(() => {
    if (shouldLeaveDeletedArtistPage()) {
      clearAccountDeletedSession();
      navigate({ pathname: '/', search: '' }, { replace: true });
      return;
    }
    if (hasOverlayBackground) {
      // Overlay-режим: уносим стек назад на underlying-страницу. URL вернётся
      // на artist page (или другой backgroundLocation), AuthPage размонтируется,
      // body scroll lock снимется, scroll-позиция восстановится.
      navigate(-1);
      return;
    }
    // Standalone-режим (прямой /auth): не делаем navigate(-1), потому что
    // история может вести наружу. Уводим на главную replace'ом.
    navigate('/', { replace: true });
  }, [hasOverlayBackground, navigate]);

  // Body scroll lock на всё время, пока виден auth-form. VerifyEmailModal
  // имеет собственный scroll-lock (через native <dialog>), поэтому здесь
  // лочим только когда auth-form реально на экране.
  useBodyScrollLock(showAuthForm);

  // Запоминаем, какой элемент был сфокусирован ДО монтажа модала, чтобы
  // вернуть туда фокус при закрытии. Без этого после Escape/backdrop click
  // фокус оказывается на body и пользователь теряет позицию в табе.
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!showAuthForm) return;
    previouslyFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      const target = previouslyFocusedElementRef.current;
      // document.contains вместо isConnected — поддерживаем старые браузеры
      if (target && document.contains(target)) {
        try {
          target.focus({ preventScroll: true });
        } catch {
          /* ignore */
        }
      }
    };
  }, [showAuthForm]);

  // Escape закрывает модал — стандартное поведение для всех popup'ов.
  useEffect(() => {
    if (!showAuthForm) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleCloseAuth();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showAuthForm, handleCloseAuth]);

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

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Защита от случайного закрытия при отпускании клика, начатого внутри
    // карточки (drag-выделение текста). Закрываем только если и mousedown,
    // и mouseup произошли на самом backdrop'е.
    if (e.target === e.currentTarget) {
      handleCloseAuth();
    }
  };

  return (
    <>
      <VerifyEmailModal
        isOpen={showVerifyEmailModal && needsVerification}
        onContinueLater={handleVerifyContinueLater}
        onClose={handleVerifyContinueLater}
      />

      {showAuthForm && (
        <div
          className="auth-page"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-page-title"
        >
          <ModalBackdrop className="auth-page__backdrop" onClick={handleBackdropClick} />
          <div
            className={`auth-page__container${showRoleSelection ? ' auth-page__container--wide' : ''}`}
            role="document"
          >
            <h2 id="auth-page-title" className="visually-hidden">
              {mode === 'register'
                ? 'Create account'
                : mode === 'forgot'
                  ? 'Reset password'
                  : 'Sign in'}
            </h2>
            <button
              type="button"
              className="auth-page__close"
              aria-label="Закрыть"
              onClick={handleCloseAuth}
            >
              <ModalCloseIcon />
            </button>
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
      )}
    </>
  );
}

export default AuthPage;
