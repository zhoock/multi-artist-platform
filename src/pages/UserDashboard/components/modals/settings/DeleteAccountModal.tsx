import { useState, FormEvent } from 'react';
import { Eye as EyeIcon, EyeOff as EyeOffIcon } from 'lucide-react';
import { Popup, PopupCloseButton } from '@shared/ui/popup';
import { deleteAccount } from '@shared/lib/auth';
import { markAccountDeletedSession } from '@shared/lib/accountDeletedSession';
import { armAccountDeletedToast } from '@shared/lib/toast/armAccountDeletedToast';
import { DashboardButton } from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import './DeleteAccountModal.style.scss';

export interface DeleteAccountModalCopy {
  title: string;
  warningDescription: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  deleteButton: string;
  cancel: string;
  close: string;
  deleting: string;
  deleteFailed: string;
}

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeleted: () => void;
  copy: DeleteAccountModalCopy;
}

function PasswordVisibilityIcon({ visible }: { visible: boolean }) {
  const Icon = visible ? EyeIcon : EyeOffIcon;
  return (
    <Icon
      {...dashboardActionIconProps({
        size: 18,
        className: 'delete-account-modal__password-toggle-icon',
      })}
    />
  );
}

export function DeleteAccountModal({ isOpen, onClose, onDeleted, copy }: DeleteAccountModalProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (loading) return;
    setPassword('');
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password.trim() || loading) return;

    setLoading(true);
    setError(null);

    const result = await deleteAccount(password);
    setLoading(false);

    if (result.success) {
      markAccountDeletedSession();
      armAccountDeletedToast();
      setPassword('');
      onDeleted();
      return;
    }

    setError(result.error || copy.deleteFailed);
  };

  return (
    <Popup
      isActive={isOpen}
      onClose={handleClose}
      closeBlocked={loading}
      bgColor="rgba(var(--deep-black-rgb) / 95%)"
    >
      <div className="delete-account-modal">
        <div className="delete-account-modal__card">
          <header className="delete-account-modal__header">
            <div className="delete-account-modal__heading">
              <h2 className="delete-account-modal__title">{copy.title}</h2>
              <p className="delete-account-modal__message">{copy.warningDescription}</p>
            </div>
            <PopupCloseButton
              className="delete-account-modal__close"
              disabled={loading}
              aria-label={copy.close}
            >
              <ModalCloseIcon />
            </PopupCloseButton>
          </header>

          <form
            id="delete-account-form"
            className="delete-account-modal__form"
            onSubmit={handleSubmit}
            noValidate
          >
            <div className="delete-account-modal__field">
              <label htmlFor="delete-account-password" className="delete-account-modal__label">
                {copy.passwordLabel}
              </label>
              <div className="delete-account-modal__input-wrapper">
                <input
                  id="delete-account-password"
                  type={showPassword ? 'text' : 'password'}
                  className="dashboard-form-input delete-account-modal__input"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder={copy.passwordPlaceholder}
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  className="delete-account-modal__password-toggle"
                  onClick={() => setShowPassword((value) => !value)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <PasswordVisibilityIcon visible={showPassword} />
                </button>
              </div>
              {error ? (
                <p className="delete-account-modal__error" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          </form>

          <footer className="dashboard-modal-footer delete-account-modal__footer">
            <PopupCloseButton
              className="dashboard-button dashboard-button--outline"
              disabled={loading}
            >
              {copy.cancel}
            </PopupCloseButton>
            <DashboardButton
              type="submit"
              form="delete-account-form"
              variant="outline"
              destructive
              disabled={loading || !password.trim()}
            >
              {loading ? copy.deleting : copy.deleteButton}
            </DashboardButton>
          </footer>
        </div>
      </div>
    </Popup>
  );
}
