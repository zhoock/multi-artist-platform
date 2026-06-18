import { useState, useMemo, FormEvent } from 'react';
import { requestPasswordReset } from '@shared/lib/auth';
import { useLang } from '@app/providers/lang';
import { useFocusOnOpen } from '@shared/lib/hooks/useFocusOnOpen';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import './AuthForm.scss';
import './ForgotPasswordForm.scss';

interface ForgotPasswordFormProps {
  onBackToLogin: () => void;
  initialEmail?: string;
}

function MailIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="m4 7 8 6 8-6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="18.5"
        cy="17.5"
        r="3.5"
        fill="var(--auth-page-bg, var(--deep-black, #0a0a0a))"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="m16.8 17.4 1.4 1.4 2.3-2.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ForgotPasswordForm({ onBackToLogin, initialEmail = '' }: ForgotPasswordFormProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));

  const copy = useMemo(() => {
    const fp = ui?.auth?.forgotPassword;
    const validation = ui?.auth?.validation;
    const en = lang !== 'ru';
    return {
      title: fp?.title ?? (en ? 'Reset password' : 'Сброс пароля'),
      body:
        fp?.body ??
        (en
          ? "Enter your email and we'll send you a reset link."
          : 'Укажите email — мы пришлём ссылку для сброса пароля.'),
      emailLabel: fp?.emailLabel ?? 'Email',
      submit: fp?.submit ?? (en ? 'Send reset link' : 'Отправить ссылку'),
      submitting: fp?.submitting ?? (en ? 'Sending…' : 'Отправка…'),
      backToLogin: fp?.backToLogin ?? (en ? 'Back to sign in' : 'Вернуться ко входу'),
      sentTitle: fp?.sentTitle ?? (en ? 'Check your email' : 'Проверьте почту'),
      sentBody:
        fp?.sentBody ??
        (en
          ? 'If an account with this email exists, we sent a password reset link.'
          : 'Если аккаунт с таким email существует, мы отправили ссылку для сброса пароля.'),
      sentBackToLogin: fp?.sentBackToLogin ?? (en ? 'Back to sign in' : 'Вернуться ко входу'),
      genericError:
        fp?.genericError ??
        (en
          ? 'Could not send reset link. Please try again.'
          : 'Не удалось отправить ссылку. Попробуйте ещё раз.'),
      requiredEmail: validation?.requiredEmail ?? (en ? 'Enter your email' : 'Укажите email'),
    };
  }, [lang, ui?.auth?.forgotPassword, ui?.auth?.validation]);

  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const emailInputRef = useFocusOnOpen<HTMLInputElement>(true);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setFieldError(copy.requiredEmail);
      return;
    }
    setFieldError(null);
    setLoading(true);

    const result = await requestPasswordReset(trimmed);
    setLoading(false);

    // The backend returns a single neutral success body for both existing and
    // non-existing emails, so the UI must never reveal which case it was.
    // Only fail-closed (network/server error with no success flag) flips to
    // the error branch — the neutral message is presented otherwise.
    if (!result.success) {
      setError(result.error || copy.genericError);
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <div className="auth-form forgot-password-success" role="status" aria-live="polite">
        <div className="forgot-password-success__icon" aria-hidden="true">
          <MailIcon />
          <span className="forgot-password-success__icon-dot" aria-hidden="true" />
        </div>
        <h2 className="auth-form__title forgot-password-success__title">{copy.sentTitle}</h2>
        <p className="forgot-password-success__body">{copy.sentBody}</p>
        <button
          type="button"
          className="auth-form__submit forgot-password-success__cta"
          onClick={onBackToLogin}
        >
          {copy.sentBackToLogin}
        </button>
      </div>
    );
  }

  return (
    <form
      className="auth-form forgot-password-form"
      onSubmit={handleSubmit}
      method="post"
      noValidate
    >
      <h2 className="auth-form__title">{copy.title}</h2>
      <p className="forgot-password-form__body">{copy.body}</p>

      {error && <div className="auth-form__error">{error}</div>}

      <div className="auth-form__field">
        <label htmlFor="forgot-password-email" className="auth-form__label">
          {copy.emailLabel}
        </label>
        <input
          ref={emailInputRef}
          id="forgot-password-email"
          name="email"
          type="email"
          className={`auth-form__input${fieldError ? ' auth-form__input--invalid' : ''}`}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (fieldError) setFieldError(null);
          }}
          autoComplete="username"
          disabled={loading}
          aria-invalid={!!fieldError}
          aria-describedby={fieldError ? 'forgot-password-email-error' : undefined}
        />
        {fieldError ? (
          <p id="forgot-password-email-error" className="auth-form__field-error" role="alert">
            {fieldError}
          </p>
        ) : null}
      </div>

      <button type="submit" className="auth-form__submit" disabled={loading}>
        {loading ? copy.submitting : copy.submit}
      </button>

      <button
        type="button"
        className="auth-form__link forgot-password-form__back"
        onClick={onBackToLogin}
      >
        ← {copy.backToLogin}
      </button>
    </form>
  );
}
