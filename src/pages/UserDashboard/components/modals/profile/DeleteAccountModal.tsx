import { useState, FormEvent } from 'react';
import { Lock as LockIcon } from 'lucide-react';
import { Popup } from '@shared/ui/popup';
import { deleteAccount } from '@shared/lib/auth';
import { markAccountDeletedSession } from '@shared/lib/accountDeletedSession';
import { queueAccountDeletedToast } from '@shared/lib/accountDeletedToast';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import './DeleteAccountModal.style.scss';

export interface DeleteAccountModalCopy {
  title: string;
  warningDescription: string;
  impactTitle: string;
  warningItems: string[];
  passwordLabel: string;
  passwordPlaceholder: string;
  passwordHelper: string;
  deleteButton: string;
  cancel: string;
  close: string;
  deleting: string;
  passwordRequired: string;
  deleteFailed: string;
  finalWarning: string;
}

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeleted: () => void;
  copy: DeleteAccountModalCopy;
}

function WarningIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6h12Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M3 3l18 18M10.58 10.58A2 2 0 0 0 12 15a2 2 0 0 0 1.42-.58M9.88 5.09A10.94 10.94 0 0 1 12 5c5 0 9.27 3.11 11 7a10.8 10.8 0 0 1-2.16 3.19M6.61 6.61A10.8 10.8 0 0 0 1 12c1.73 3.89 6 7 11 7 1.05 0 2.06-.15 3-.42"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
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
      queueAccountDeletedToast();
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
        <form className="delete-account-modal__container" onSubmit={handleSubmit} noValidate>
          <div className="delete-account-modal__header">
            <div className="delete-account-modal__title-row">
              <span className="delete-account-modal__icon" aria-hidden="true">
                <WarningIcon />
              </span>
              <div className="delete-account-modal__title-block">
                <h2 className="delete-account-modal__title">{copy.title}</h2>
                <p className="delete-account-modal__message">{copy.warningDescription}</p>
              </div>
            </div>
            <button
              type="button"
              className="delete-account-modal__close"
              onClick={handleClose}
              disabled={loading}
              aria-label={copy.close}
            >
              <ModalCloseIcon />
            </button>
          </div>

          <section
            className="delete-account-modal__impact"
            aria-labelledby="delete-account-impact-title"
          >
            <span className="delete-account-modal__impact-icon" aria-hidden="true">
              <TrashIcon />
            </span>
            <div className="delete-account-modal__impact-body">
              <h3 id="delete-account-impact-title" className="delete-account-modal__impact-title">
                {copy.impactTitle}
              </h3>
              <ul className="delete-account-modal__list">
                {copy.warningItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </section>

          {error ? <div className="delete-account-modal__error">{error}</div> : null}

          <div className="delete-account-modal__field">
            <label htmlFor="delete-account-password" className="delete-account-modal__label">
              {copy.passwordLabel}
            </label>
            <div className="delete-account-modal__input-wrapper">
              <span className="delete-account-modal__input-icon" aria-hidden="true">
                <LockIcon {...dashboardActionIconProps({ size: 18, strokeWidth: 1.75 })} />
              </span>
              <input
                id="delete-account-password"
                type={showPassword ? 'text' : 'password'}
                className="delete-account-modal__input"
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
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
            <p className="delete-account-modal__field-hint">{copy.passwordHelper}</p>
          </div>

          <div className="delete-account-modal__actions">
            <button
              type="button"
              className="delete-account-modal__button delete-account-modal__button--cancel"
              onClick={handleClose}
              disabled={loading}
            >
              {copy.cancel}
            </button>
            <button
              type="submit"
              className="delete-account-modal__button delete-account-modal__button--danger"
              disabled={loading || !password.trim()}
            >
              <span className="delete-account-modal__button-icon" aria-hidden="true">
                <TrashIcon />
              </span>
              {loading ? copy.deleting : copy.deleteButton}
            </button>
          </div>

          <p className="delete-account-modal__final">
            <span className="delete-account-modal__final-icon" aria-hidden="true">
              <LockIcon {...dashboardActionIconProps({ size: 18, strokeWidth: 1.75 })} />
            </span>
            {copy.finalWarning}
          </p>
        </form>
      </div>
    </Popup>
  );
}
