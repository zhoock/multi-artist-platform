import { useState, FormEvent, useMemo } from 'react';
import { login } from '@shared/lib/auth';
import { useLang } from '@app/providers/lang';
import { useFocusOnOpen } from '@shared/lib/hooks/useFocusOnOpen';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import './AuthForm.scss';
import './ForgotPasswordForm.scss';

type LoginField = 'email' | 'password';

interface LoginFormProps {
  onSuccess?: () => void;
  onSwitchToRegister?: () => void;
  onForgotPassword?: (currentEmail: string) => void;
}

export function LoginForm({ onSuccess, onSwitchToRegister, onForgotPassword }: LoginFormProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));

  const copy = useMemo(() => {
    const loginUi = ui?.auth?.login;
    const val = ui?.auth?.validation;
    const en = lang !== 'ru';
    return {
      title: loginUi?.title ?? (en ? 'Sign in' : 'Вход'),
      emailLabel: loginUi?.emailLabel ?? 'Email',
      passwordLabel: loginUi?.passwordLabel ?? (en ? 'Password' : 'Пароль'),
      submit: loginUi?.submit ?? (en ? 'Sign in' : 'Войти'),
      submitting: loginUi?.submitting ?? (en ? 'Signing in…' : 'Вход…'),
      noAccount: loginUi?.noAccount ?? (en ? 'No account?' : 'Нет аккаунта?'),
      signUp: loginUi?.signUp ?? (en ? 'Create account' : 'Создать аккаунт'),
      forgotPassword: loginUi?.forgotPassword ?? (en ? 'Forgot password?' : 'Забыли пароль?'),
      requiredEmail: val?.requiredEmail ?? (en ? 'Enter your email' : 'Укажите email'),
      requiredPassword: val?.requiredPassword ?? (en ? 'Enter your password' : 'Укажите пароль'),
      genericError: en ? 'Sign-in error' : 'Ошибка входа',
      unknownError: en ? 'Unknown error' : 'Неизвестная ошибка',
    };
  }, [lang, ui?.auth?.login, ui?.auth?.validation]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<LoginField, string>>>({});
  const [loading, setLoading] = useState(false);
  const emailInputRef = useFocusOnOpen<HTMLInputElement>(true);

  const clearFieldError = (field: LoginField) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const nextErrors: Partial<Record<LoginField, string>> = {};
    if (!email.trim()) {
      nextErrors.email = copy.requiredEmail;
    }
    if (!password) {
      nextErrors.password = copy.requiredPassword;
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setLoading(true);

    try {
      const result = await login(email, password, { preferredLanguage: lang });

      if (result.success) {
        if (onSuccess) {
          onSuccess();
        } else {
          window.location.reload();
        }
      } else {
        setError(result.error || copy.genericError);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.unknownError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit} method="post" autoComplete="on" noValidate>
      <h2 className="auth-form__title">{copy.title}</h2>

      {error && <div className="auth-form__error">{error}</div>}

      <div className="auth-form__field">
        <label htmlFor="login-email" className="auth-form__label">
          {copy.emailLabel}
        </label>
        <input
          ref={emailInputRef}
          id="login-email"
          name="email"
          type="email"
          className={`auth-form__input${fieldErrors.email ? ' auth-form__input--invalid' : ''}`}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            clearFieldError('email');
          }}
          autoComplete="username"
          disabled={loading}
          data-form-type="username"
          aria-invalid={!!fieldErrors.email}
          aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
        />
        {fieldErrors.email ? (
          <p id="login-email-error" className="auth-form__field-error" role="alert">
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div className="auth-form__field">
        <label htmlFor="login-password" className="auth-form__label">
          {copy.passwordLabel}
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          className={`auth-form__input${fieldErrors.password ? ' auth-form__input--invalid' : ''}`}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            clearFieldError('password');
          }}
          autoComplete="current-password"
          disabled={loading}
          data-form-type="password"
          aria-invalid={!!fieldErrors.password}
          aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
        />
        {fieldErrors.password ? (
          <p id="login-password-error" className="auth-form__field-error" role="alert">
            {fieldErrors.password}
          </p>
        ) : null}
      </div>

      {onForgotPassword ? (
        <div className="auth-form__forgot-row">
          <button
            type="button"
            className="auth-form__forgot-link"
            onClick={() => onForgotPassword(email)}
            disabled={loading}
          >
            {copy.forgotPassword}
          </button>
        </div>
      ) : null}

      <button type="submit" className="auth-form__submit" disabled={loading}>
        {loading ? copy.submitting : copy.submit}
      </button>

      {onSwitchToRegister && (
        <div className="auth-form__switch">
          {copy.noAccount}{' '}
          <button type="button" className="auth-form__link" onClick={onSwitchToRegister}>
            {copy.signUp}
          </button>
        </div>
      )}
    </form>
  );
}
