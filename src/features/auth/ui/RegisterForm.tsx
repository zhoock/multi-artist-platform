import { useState, FormEvent, useMemo } from 'react';
import { register } from '@shared/lib/auth';
import type { AccountType } from '@shared/lib/accountType';
import { useLang } from '@app/providers/lang';
import { useFocusOnOpen } from '@shared/lib/hooks/useFocusOnOpen';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import './AuthForm.scss';

type RegisterField = 'name' | 'email' | 'password' | 'confirmPassword';

interface RegisterFormProps {
  accountType: AccountType;
  onSuccess?: () => void;
  onSwitchToLogin?: () => void;
  onBack?: () => void;
}

export function RegisterForm({
  accountType,
  onSuccess,
  onSwitchToLogin,
  onBack,
}: RegisterFormProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const isArtist = accountType === 'artist';

  const copy = useMemo(() => {
    const reg = ui?.auth?.register;
    const val = ui?.auth?.validation;
    const en = lang !== 'ru';
    const fallback = en
      ? {
          title: isArtist ? 'Artist registration' : 'Listener registration',
          back: 'Back',
          nameLabel: 'Name',
          namePlaceholder: 'Enter your name',
          nameRequired: 'Name is required',
          artistBandNameLabel: 'Artist / band name',
          artistBandNamePlaceholder: 'Enter your artist or band name',
          artistBandNameRequired: 'Artist / band name is required',
          emailLabel: 'Email',
          passwordLabel: 'Password',
          confirmPasswordLabel: 'Confirm password',
          submit: 'Register',
          submitting: 'Registering…',
          hasAccount: 'Already have an account?',
          signIn: 'Sign in',
          requiredEmail: 'Enter your email',
          requiredPassword: 'Enter your password',
          requiredConfirmPassword: 'Confirm your password',
          passwordsMismatch: 'Passwords do not match',
          passwordMinLength: 'Password must be at least 6 characters',
        }
      : {
          title: isArtist ? 'Регистрация артиста' : 'Регистрация слушателя',
          back: 'Назад',
          nameLabel: 'Имя',
          namePlaceholder: 'Укажите ваше имя',
          nameRequired: 'Укажите имя',
          artistBandNameLabel: 'Имя артиста / группы',
          artistBandNamePlaceholder: 'Укажите имя артиста или группы',
          artistBandNameRequired: 'Укажите имя артиста или группы',
          emailLabel: 'Email',
          passwordLabel: 'Пароль',
          confirmPasswordLabel: 'Подтвердите пароль',
          submit: 'Зарегистрироваться',
          submitting: 'Регистрация…',
          hasAccount: 'Уже есть аккаунт?',
          signIn: 'Войти',
          requiredEmail: 'Укажите email',
          requiredPassword: 'Укажите пароль',
          requiredConfirmPassword: 'Подтвердите пароль',
          passwordsMismatch: 'Пароли не совпадают',
          passwordMinLength: 'Пароль должен содержать минимум 6 символов',
        };
    return { ...fallback, ...reg, ...val };
  }, [isArtist, lang, ui?.auth?.register, ui?.auth?.validation]);

  const nameLabel = isArtist ? copy.artistBandNameLabel : copy.nameLabel;
  const namePlaceholder = isArtist ? copy.artistBandNamePlaceholder : copy.namePlaceholder;
  const nameRequiredMessage = isArtist ? copy.artistBandNameRequired : copy.nameRequired;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RegisterField, string>>>({});
  const [loading, setLoading] = useState(false);
  const nameInputRef = useFocusOnOpen<HTMLInputElement>(true);

  const clearFieldError = (field: RegisterField) => {
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

    const nextErrors: Partial<Record<RegisterField, string>> = {};
    if (!name.trim()) {
      nextErrors.name = nameRequiredMessage;
    }
    if (!email.trim()) {
      nextErrors.email = copy.requiredEmail;
    }
    if (!password) {
      nextErrors.password = copy.requiredPassword;
    } else if (password.length < 6) {
      nextErrors.password = copy.passwordMinLength;
    }
    if (!confirmPassword) {
      nextErrors.confirmPassword = copy.requiredConfirmPassword;
    } else if (password && confirmPassword !== password) {
      nextErrors.confirmPassword = copy.passwordsMismatch;
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setLoading(true);

    try {
      const result = await register(email, password, {
        preferredLanguage: lang,
        accountType,
        name: name.trim(),
      });

      if (result.success) {
        onSuccess?.();
      } else {
        setError(result.error || (lang !== 'ru' ? 'Registration error' : 'Ошибка регистрации'));
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : lang !== 'ru' ? 'Unknown error' : 'Неизвестная ошибка'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      {onBack ? (
        <button type="button" className="auth-form__link auth-form__back" onClick={onBack}>
          ← {copy.back}
        </button>
      ) : null}

      <h2 className="auth-form__title">{copy.title}</h2>

      {error && <div className="auth-form__error">{error}</div>}

      <div className="auth-form__field">
        <label htmlFor="register-name" className="auth-form__label">
          {nameLabel}
        </label>
        <input
          ref={nameInputRef}
          id="register-name"
          name="name"
          type="text"
          className={`auth-form__input${fieldErrors.name ? ' auth-form__input--invalid' : ''}`}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            clearFieldError('name');
          }}
          placeholder={namePlaceholder}
          autoComplete={isArtist ? 'organization' : 'name'}
          disabled={loading}
          aria-invalid={!!fieldErrors.name}
          aria-describedby={fieldErrors.name ? 'register-name-error' : undefined}
        />
        {fieldErrors.name ? (
          <p id="register-name-error" className="auth-form__field-error" role="alert">
            {fieldErrors.name}
          </p>
        ) : null}
      </div>

      <div className="auth-form__field">
        <label htmlFor="register-email" className="auth-form__label">
          {copy.emailLabel}
        </label>
        <input
          id="register-email"
          name="email"
          type="email"
          className={`auth-form__input${fieldErrors.email ? ' auth-form__input--invalid' : ''}`}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            clearFieldError('email');
          }}
          autoComplete="email"
          disabled={loading}
          aria-invalid={!!fieldErrors.email}
          aria-describedby={fieldErrors.email ? 'register-email-error' : undefined}
        />
        {fieldErrors.email ? (
          <p id="register-email-error" className="auth-form__field-error" role="alert">
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div className="auth-form__field">
        <label htmlFor="register-password" className="auth-form__label">
          {copy.passwordLabel}
        </label>
        <input
          id="register-password"
          name="password"
          type="password"
          className={`auth-form__input${fieldErrors.password ? ' auth-form__input--invalid' : ''}`}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            clearFieldError('password');
          }}
          autoComplete="new-password"
          disabled={loading}
          aria-invalid={!!fieldErrors.password}
          aria-describedby={fieldErrors.password ? 'register-password-error' : undefined}
        />
        {fieldErrors.password ? (
          <p id="register-password-error" className="auth-form__field-error" role="alert">
            {fieldErrors.password}
          </p>
        ) : null}
      </div>

      <div className="auth-form__field">
        <label htmlFor="register-confirm-password" className="auth-form__label">
          {copy.confirmPasswordLabel}
        </label>
        <input
          id="register-confirm-password"
          name="confirm-password"
          type="password"
          className={`auth-form__input${fieldErrors.confirmPassword ? ' auth-form__input--invalid' : ''}`}
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            clearFieldError('confirmPassword');
          }}
          autoComplete="new-password"
          disabled={loading}
          aria-invalid={!!fieldErrors.confirmPassword}
          aria-describedby={
            fieldErrors.confirmPassword ? 'register-confirm-password-error' : undefined
          }
        />
        {fieldErrors.confirmPassword ? (
          <p id="register-confirm-password-error" className="auth-form__field-error" role="alert">
            {fieldErrors.confirmPassword}
          </p>
        ) : null}
      </div>

      <button type="submit" className="auth-form__submit" disabled={loading}>
        {loading ? copy.submitting : copy.submit}
      </button>

      {onSwitchToLogin && (
        <div className="auth-form__switch">
          {copy.hasAccount}{' '}
          <button type="button" className="auth-form__link" onClick={onSwitchToLogin}>
            {copy.signIn}
          </button>
        </div>
      )}
    </form>
  );
}
