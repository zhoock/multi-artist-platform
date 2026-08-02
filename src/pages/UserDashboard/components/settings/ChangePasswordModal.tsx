import React, { useEffect, useRef, useState } from 'react';
import { Eye as EyeIcon, EyeOff as EyeOffIcon } from 'lucide-react';
import { Popup } from '@shared/ui/popup';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useLang } from '@app/providers/lang';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { getToken } from '@shared/lib/auth';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { DashboardButton } from '@shared/ui/dashboard';
import '@shared/ui/dashboard-save/dashboard-save.scss';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import { isPasswordLongEnough } from '@shared/lib/auth/passwordPolicy';
import './ChangePasswordModal.style.scss';

function PasswordVisibilityIcon({ visible }: { visible: boolean }) {
  const Icon = visible ? EyeIcon : EyeOffIcon;
  return (
    <Icon
      {...dashboardActionIconProps({
        size: 20,
        className: 'change-password-modal__password-toggle-icon',
      })}
    />
  );
}

type PasswordFieldKey = 'currentPassword' | 'newPassword' | 'confirmPassword';
type PasswordFieldErrors = Partial<Record<PasswordFieldKey, string>>;

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({ isOpen, onClose }: ChangePasswordModalProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const currentPasswordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError(null);
    setPasswordSuccess(false);
    const id = window.setTimeout(() => currentPasswordRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [isOpen]);

  const getPasswordFieldErrors = (): PasswordFieldErrors => {
    if (!currentPassword && !newPassword && !confirmPassword) return {};
    const validation = ui?.dashboard?.settingsModal?.validation;

    if (!currentPassword) {
      return {
        currentPassword: validation?.enterCurrentPassword ?? 'Enter current password',
      };
    }
    if (!newPassword) {
      return { newPassword: validation?.enterNewPassword ?? 'Enter new password' };
    }
    if (!isPasswordLongEnough(newPassword)) {
      return {
        newPassword: validation?.passwordMinLength ?? 'New password must be at least 8 characters',
      };
    }
    if (newPassword === currentPassword) {
      return {
        newPassword:
          validation?.passwordDifferent ?? 'New password must differ from current password',
      };
    }
    if (newPassword !== confirmPassword) {
      return { confirmPassword: validation?.passwordsNotMatch ?? 'Passwords do not match' };
    }
    return {};
  };

  const passwordFieldErrors = getPasswordFieldErrors();
  const currentPasswordError = passwordFieldErrors.currentPassword ?? null;
  const newPasswordError = passwordFieldErrors.newPassword ?? null;
  const confirmPasswordError = passwordFieldErrors.confirmPassword ?? null;
  const isPasswordFormValid =
    !currentPasswordError &&
    !newPasswordError &&
    !confirmPasswordError &&
    Boolean(currentPassword && newPassword && confirmPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordFormValid || isChangingPassword) return;

    setIsChangingPassword(true);
    setPasswordError(null);
    setPasswordSuccess(false);

    try {
      const token = getToken();
      if (!token) {
        setPasswordError('Could not get authorization token');
        return;
      }

      const response = await fetchWithAuthSession('/api/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const result = await response.json();
      if (!response.ok) {
        setPasswordError(result.error || 'Failed to change password');
        return;
      }

      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      window.setTimeout(() => {
        onClose();
        setPasswordSuccess(false);
      }, 1500);
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <Popup isActive={isOpen} onClose={onClose}>
      <div className="change-password-modal">
        <div
          className={`change-password-modal__card${isChangingPassword ? ' dashboard-save-card--busy' : ''}`}
          aria-busy={isChangingPassword}
        >
          <div className="change-password-modal__header">
            <h2 className="change-password-modal__title">
              {ui?.dashboard?.settingsModal?.buttons?.changePassword ?? 'Change password'}
            </h2>
            <button
              type="button"
              className="change-password-modal__close"
              onClick={onClose}
              disabled={isChangingPassword}
              aria-label={ui?.dashboard?.close ?? 'Close'}
            >
              <ModalCloseIcon />
            </button>
          </div>

          <div className="change-password-modal__body">
            <div className="change-password-modal__content">
              <form
                id="change-password-form"
                className="change-password-modal__form"
                onSubmit={handleSubmit}
                noValidate
              >
                {passwordSuccess ? (
                  <div className="change-password-modal__success-message">
                    {ui?.dashboard?.settingsModal?.messages?.passwordUpdated ?? 'Password updated'}
                  </div>
                ) : null}
                {passwordError ? (
                  <div className="change-password-modal__error-message">{passwordError}</div>
                ) : null}

                <div className="change-password-modal__field">
                  <label htmlFor="change-password-current" className="change-password-modal__label">
                    {ui?.dashboard?.settingsModal?.fields?.currentPassword ?? 'Current Password'}
                  </label>
                  <div className="change-password-modal__input-wrapper">
                    <input
                      ref={currentPasswordRef}
                      id="change-password-current"
                      type={showCurrentPassword ? 'text' : 'password'}
                      className={`change-password-modal__input${
                        currentPasswordError ? ' change-password-modal__input--invalid' : ''
                      }`}
                      value={currentPassword}
                      onChange={(e) => {
                        setCurrentPassword(e.target.value);
                        setPasswordError(null);
                      }}
                      autoComplete="current-password"
                      disabled={isChangingPassword}
                    />
                    <button
                      type="button"
                      className="change-password-modal__password-toggle"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      tabIndex={-1}
                    >
                      <PasswordVisibilityIcon visible={showCurrentPassword} />
                    </button>
                  </div>
                  {currentPasswordError ? (
                    <p className="change-password-modal__field-error" role="alert">
                      {currentPasswordError}
                    </p>
                  ) : null}
                </div>

                <div className="change-password-modal__field">
                  <label htmlFor="change-password-new" className="change-password-modal__label">
                    {ui?.dashboard?.settingsModal?.fields?.newPassword ?? 'New Password'}
                  </label>
                  <div className="change-password-modal__input-wrapper">
                    <input
                      id="change-password-new"
                      type={showNewPassword ? 'text' : 'password'}
                      className={`change-password-modal__input${
                        newPasswordError ? ' change-password-modal__input--invalid' : ''
                      }`}
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        setPasswordError(null);
                      }}
                      autoComplete="new-password"
                      disabled={isChangingPassword}
                    />
                    <button
                      type="button"
                      className="change-password-modal__password-toggle"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      tabIndex={-1}
                    >
                      <PasswordVisibilityIcon visible={showNewPassword} />
                    </button>
                  </div>
                  {newPasswordError ? (
                    <p className="change-password-modal__field-error" role="alert">
                      {newPasswordError}
                    </p>
                  ) : null}
                </div>

                <div className="change-password-modal__field">
                  <label htmlFor="change-password-confirm" className="change-password-modal__label">
                    {ui?.dashboard?.settingsModal?.fields?.confirmPassword ??
                      'Confirm New Password'}
                  </label>
                  <div className="change-password-modal__input-wrapper">
                    <input
                      id="change-password-confirm"
                      type={showConfirmPassword ? 'text' : 'password'}
                      className={`change-password-modal__input${
                        confirmPasswordError ? ' change-password-modal__input--invalid' : ''
                      }`}
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setPasswordError(null);
                      }}
                      autoComplete="new-password"
                      disabled={isChangingPassword}
                    />
                    <button
                      type="button"
                      className="change-password-modal__password-toggle"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      tabIndex={-1}
                    >
                      <PasswordVisibilityIcon visible={showConfirmPassword} />
                    </button>
                  </div>
                  {confirmPasswordError ? (
                    <p className="change-password-modal__field-error" role="alert">
                      {confirmPasswordError}
                    </p>
                  ) : null}
                </div>
              </form>
            </div>
          </div>

          <footer className="dashboard-modal-footer change-password-modal__footer">
            <DashboardButton variant="outline" onClick={onClose} disabled={isChangingPassword}>
              {ui?.dashboard?.cancel ?? 'Cancel'}
            </DashboardButton>
            <DashboardButton
              type="submit"
              form="change-password-form"
              variant="primary"
              loading={isChangingPassword}
              disabled={isChangingPassword || !isPasswordFormValid}
            >
              {isChangingPassword
                ? (ui?.dashboard?.saving ?? 'Saving…')
                : (ui?.dashboard?.settingsModal?.buttons?.changePassword ?? 'Change password')}
            </DashboardButton>
          </footer>
        </div>
      </div>
    </Popup>
  );
}
