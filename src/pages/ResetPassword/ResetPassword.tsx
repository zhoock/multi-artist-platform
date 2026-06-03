import { useEffect, useMemo, useState, FormEvent } from 'react';
import { Lock as LockIcon } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { resetPassword } from '@shared/lib/auth';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { computePasswordStrength } from './passwordStrength';
import { ModalBackdrop } from '@shared/ui/localModal';
import '@features/auth/ui/AuthForm.scss';
import './ResetPassword.scss';

const MIN_PASSWORD_LENGTH = 8;

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="12"
        r="3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 4 20 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M10.94 6.08A6.93 6.93 0 0 1 12 6c3.18 0 6.17 2.29 7.91 6a15.23 15.23 0 0 1-2.18 3.06M6.61 6.61C3.61 8.6 1 12 1 12s4 8 11 8a10.93 10.93 0 0 0 5.39-1.39"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.12 14.12a3 3 0 0 1-4.24-4.24"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 6 9 17l-5-5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));

  const copy = useMemo(() => {
    const rp = ui?.auth?.resetPassword;
    const en = lang !== 'ru';
    return {
      title: rp?.title ?? (en ? 'Reset password' : 'Сброс пароля'),
      body:
        rp?.body ??
        (en
          ? "Enter your new password below. Make sure it's strong and secure."
          : 'Задайте новый пароль. Убедитесь, что он надёжный.'),
      newPasswordLabel: rp?.newPasswordLabel ?? (en ? 'New password' : 'Новый пароль'),
      newPasswordPlaceholder:
        rp?.newPasswordPlaceholder ?? (en ? 'Enter new password' : 'Введите новый пароль'),
      confirmPasswordLabel:
        rp?.confirmPasswordLabel ?? (en ? 'Confirm new password' : 'Подтвердите новый пароль'),
      confirmPasswordPlaceholder:
        rp?.confirmPasswordPlaceholder ?? (en ? 'Confirm new password' : 'Повторите новый пароль'),
      submit: rp?.submit ?? (en ? 'Save new password' : 'Сохранить новый пароль'),
      submitting: rp?.submitting ?? (en ? 'Saving…' : 'Сохраняем…'),
      successTitle: rp?.successTitle ?? (en ? 'Password updated' : 'Пароль обновлён'),
      successBody:
        rp?.successBody ??
        (en
          ? 'Your password has been updated. You can now sign in with your new password.'
          : 'Ваш пароль успешно обновлён. Теперь вы можете войти с новым паролем.'),
      backToLogin: rp?.backToLogin ?? (en ? 'Back to sign in' : 'Вернуться ко входу'),
      goToLogin: rp?.goToLogin ?? (en ? 'Go to sign in' : 'Перейти ко входу'),
      showPassword: rp?.showPassword ?? (en ? 'Show password' : 'Показать пароль'),
      hidePassword: rp?.hidePassword ?? (en ? 'Hide password' : 'Скрыть пароль'),
      strength: {
        veryWeak: rp?.strength?.veryWeak ?? (en ? 'Very weak' : 'Очень слабый'),
        weak: rp?.strength?.weak ?? (en ? 'Weak' : 'Слабый'),
        fair: rp?.strength?.fair ?? (en ? 'Fair' : 'Средний'),
        good: rp?.strength?.good ?? (en ? 'Good' : 'Хороший'),
        strong: rp?.strength?.strong ?? (en ? 'Strong' : 'Сильный'),
      },
      errors: {
        invalidLink:
          rp?.errors?.invalidLink ??
          (en
            ? 'This reset link is invalid or has expired. Please request a new one.'
            : 'Ссылка для сброса недействительна или истекла. Запросите новую.'),
        passwordTooShort:
          rp?.errors?.passwordTooShort ??
          (en
            ? 'Password must be at least 8 characters long.'
            : 'Пароль должен содержать минимум 8 символов.'),
        passwordsMismatch:
          rp?.errors?.passwordsMismatch ??
          (en ? 'Passwords do not match.' : 'Пароли не совпадают.'),
        passwordRequired:
          rp?.errors?.passwordRequired ?? (en ? 'Enter a new password.' : 'Укажите новый пароль.'),
        generic:
          rp?.errors?.generic ??
          (en
            ? 'Could not update password. Please try again.'
            : 'Не удалось обновить пароль. Попробуйте ещё раз.'),
        rateLimited:
          rp?.errors?.rateLimited ??
          (en
            ? 'Too many attempts. Please try again later.'
            : 'Слишком много попыток. Попробуйте позже.'),
      },
    };
  }, [lang, ui?.auth?.resetPassword]);

  const strengthLabels = useMemo(
    () => [
      copy.strength.veryWeak,
      copy.strength.weak,
      copy.strength.fair,
      copy.strength.good,
      copy.strength.strong,
    ],
    [copy.strength]
  );

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordFieldError, setPasswordFieldError] = useState<string | null>(null);
  const [confirmFieldError, setConfirmFieldError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Token validity is checked server-side at submit time; we still gate the
  // initial render on its presence so an empty `?token=` URL goes straight to
  // a clear error state instead of letting the user fill the form for nothing.
  const tokenMissing = !token.trim();

  useEffect(() => {
    if (tokenMissing) {
      setError(copy.errors.invalidLink);
    }
  }, [tokenMissing, copy.errors.invalidLink]);

  const strength = computePasswordStrength(password);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (tokenMissing) {
      setError(copy.errors.invalidLink);
      return;
    }

    let hasFieldError = false;
    if (!password) {
      setPasswordFieldError(copy.errors.passwordRequired);
      hasFieldError = true;
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordFieldError(copy.errors.passwordTooShort);
      hasFieldError = true;
    } else {
      setPasswordFieldError(null);
    }

    if (password && confirm !== password) {
      setConfirmFieldError(copy.errors.passwordsMismatch);
      hasFieldError = true;
    } else {
      setConfirmFieldError(null);
    }

    if (hasFieldError) return;

    setLoading(true);
    const result = await resetPassword(token, password);
    setLoading(false);

    if (result.success) {
      setDone(true);
      return;
    }

    if (result.code === 'RATE_LIMIT_EXCEEDED') {
      setError(copy.errors.rateLimited);
      return;
    }
    if (result.code === 'INVALID_OR_EXPIRED_TOKEN') {
      setError(copy.errors.invalidLink);
      return;
    }
    if (result.code === 'PASSWORD_TOO_SHORT') {
      setPasswordFieldError(copy.errors.passwordTooShort);
      return;
    }
    if (result.code === 'PASSWORD_REQUIRED') {
      setPasswordFieldError(copy.errors.passwordRequired);
      return;
    }
    setError(result.error || copy.errors.generic);
  };

  const handleGoToLogin = () => {
    navigate('/auth?mode=login', { replace: true });
  };

  if (done) {
    return (
      <section className="reset-password-page" aria-labelledby="reset-password-success-title">
        <Helmet>
          <title>{copy.successTitle}</title>
        </Helmet>
        <ModalBackdrop className="reset-password-page__backdrop" />
        <div className="reset-password-page__container reset-password-page__container--success">
          <div
            className="reset-password-page__icon-ring reset-password-page__icon-ring--success"
            aria-hidden="true"
          >
            <CheckIcon />
          </div>
          <h1 id="reset-password-success-title" className="reset-password-page__title">
            {copy.successTitle}
          </h1>
          <p className="reset-password-page__body">{copy.successBody}</p>
          <button
            type="button"
            className="auth-form__submit reset-password-page__cta"
            onClick={handleGoToLogin}
          >
            {copy.goToLogin}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="reset-password-page" aria-labelledby="reset-password-title">
      <Helmet>
        <title>{copy.title}</title>
      </Helmet>
      <ModalBackdrop className="reset-password-page__backdrop" />
      <div className="reset-password-page__container">
        <div className="reset-password-page__icon-ring" aria-hidden="true">
          <LockIcon {...dashboardActionIconProps({ size: 22, strokeWidth: 1.5 })} />
        </div>
        <h1 id="reset-password-title" className="reset-password-page__title">
          {copy.title}
        </h1>
        <p className="reset-password-page__body">{copy.body}</p>

        <form
          className="auth-form reset-password-form"
          onSubmit={handleSubmit}
          method="post"
          autoComplete="on"
          noValidate
        >
          {error && <div className="auth-form__error">{error}</div>}

          <div className="auth-form__field">
            <label htmlFor="reset-new-password" className="auth-form__label">
              {copy.newPasswordLabel}
            </label>
            <div className="reset-password-form__input-wrap">
              <input
                id="reset-new-password"
                name="new-password"
                type={showPassword ? 'text' : 'password'}
                className={`auth-form__input reset-password-form__input${
                  passwordFieldError ? ' auth-form__input--invalid' : ''
                }`}
                placeholder={copy.newPasswordPlaceholder}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordFieldError) setPasswordFieldError(null);
                }}
                autoComplete="new-password"
                disabled={loading || tokenMissing}
                // Dedicated page reached from an email link — focusing the
                // single primary input matches the user's one job here.

                autoFocus={!tokenMissing}
                aria-invalid={!!passwordFieldError}
                aria-describedby={
                  passwordFieldError ? 'reset-new-password-error' : 'reset-strength-label'
                }
              />
              <button
                type="button"
                className="reset-password-form__toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? copy.hidePassword : copy.showPassword}
                tabIndex={-1}
                disabled={loading || tokenMissing}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>

            <div className="reset-password-form__strength" aria-hidden={!password}>
              <div className="reset-password-form__strength-bars">
                {[0, 1, 2, 3, 4].map((idx) => (
                  <span
                    key={idx}
                    className={`reset-password-form__strength-bar${
                      password && idx < strength.score
                        ? ` reset-password-form__strength-bar--filled reset-password-form__strength-bar--level-${strength.score}`
                        : ''
                    }`}
                  />
                ))}
              </div>
              <span
                id="reset-strength-label"
                className={`reset-password-form__strength-label reset-password-form__strength-label--level-${strength.score}`}
              >
                {password ? strengthLabels[Math.max(0, strength.score - 1)] : ''}
              </span>
            </div>

            {passwordFieldError ? (
              <p id="reset-new-password-error" className="auth-form__field-error" role="alert">
                {passwordFieldError}
              </p>
            ) : null}
          </div>

          <div className="auth-form__field">
            <label htmlFor="reset-confirm-password" className="auth-form__label">
              {copy.confirmPasswordLabel}
            </label>
            <div className="reset-password-form__input-wrap">
              <input
                id="reset-confirm-password"
                name="confirm-password"
                type={showConfirm ? 'text' : 'password'}
                className={`auth-form__input reset-password-form__input${
                  confirmFieldError ? ' auth-form__input--invalid' : ''
                }`}
                placeholder={copy.confirmPasswordPlaceholder}
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  if (confirmFieldError) setConfirmFieldError(null);
                }}
                autoComplete="new-password"
                disabled={loading || tokenMissing}
                aria-invalid={!!confirmFieldError}
                aria-describedby={confirmFieldError ? 'reset-confirm-password-error' : undefined}
              />
              <button
                type="button"
                className="reset-password-form__toggle"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? copy.hidePassword : copy.showPassword}
                tabIndex={-1}
                disabled={loading || tokenMissing}
              >
                {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            {confirmFieldError ? (
              <p id="reset-confirm-password-error" className="auth-form__field-error" role="alert">
                {confirmFieldError}
              </p>
            ) : null}
          </div>

          <button type="submit" className="auth-form__submit" disabled={loading || tokenMissing}>
            {loading ? copy.submitting : copy.submit}
          </button>

          <button
            type="button"
            className="auth-form__link reset-password-form__back"
            onClick={handleGoToLogin}
          >
            ← {copy.backToLogin}
          </button>
        </form>
      </div>
    </section>
  );
}
