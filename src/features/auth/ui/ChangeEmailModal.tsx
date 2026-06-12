import { useState, FormEvent } from 'react';
import { Mail as MailIcon } from 'lucide-react';
import { Popup } from '@shared/ui/popup';
import { changeVerificationEmail, refreshAuthSession } from '@shared/lib/auth';
import { useAuthSessionUser } from '@shared/lib/hooks/useAuthSessionUser';
import { useFocusOnOpen } from '@shared/lib/hooks/useFocusOnOpen';
import {
  useEmailVerificationCopy,
  useResendCooldown,
  resolveVerificationEmailSend,
} from '@shared/lib/emailVerification';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import './VerifyEmailModal.style.scss';

interface ChangeEmailModalProps {
  isOpen: boolean;
  onBack: () => void;
  onClose: () => void;
}

export function ChangeEmailModal({ isOpen, onBack, onClose }: ChangeEmailModalProps) {
  const user = useAuthSessionUser();
  const copy = useEmailVerificationCopy();
  const { remaining, isCoolingDown, startCooldown } = useResendCooldown();
  const [email, setEmail] = useState(user?.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const emailInputRef = useFocusOnOpen<HTMLInputElement>(isOpen);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (isCoolingDown || loading) return;
    const trimmed = email.trim();
    if (!trimmed) {
      setError(copy.emailRequired);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError(copy.emailInvalid);
      return;
    }
    setLoading(true);
    const result = await changeVerificationEmail(trimmed);
    setLoading(false);
    const resolution = resolveVerificationEmailSend(result, copy, startCooldown);
    if (resolution.kind === 'success') {
      onBack();
      return;
    }
    if (resolution.kind === 'already-verified') {
      // Nothing to change — sync session and close the modal so banner/onboarding self-hide.
      void refreshAuthSession();
      onBack();
      return;
    }
    setError(resolution.message);
  };

  const submitLabel = isCoolingDown
    ? `${copy.sendVerificationEmail} (${remaining}s)`
    : copy.sendVerificationEmail;

  return (
    <Popup
      isActive={isOpen}
      onClose={onClose}
      closeBlocked={loading}
      bgColor="rgba(var(--deep-black-rgb) / 95%)"
    >
      <div className="verify-email-modal">
        <form className="verify-email-modal__container" onSubmit={handleSubmit} noValidate>
          <div className="verify-email-modal__header">
            <div className="verify-email-modal__title-row">
              <span className="verify-email-modal__icon" aria-hidden="true">
                <MailIcon {...dashboardActionIconProps({ size: 22, strokeWidth: 1.75 })} />
              </span>
              <h2 className="verify-email-modal__title">{copy.changeEmailTitle}</h2>
            </div>
            <button
              type="button"
              className="verify-email-modal__close"
              onClick={onClose}
              disabled={loading}
              aria-label={copy.close}
            >
              <ModalCloseIcon />
            </button>
          </div>

          <p className="verify-email-modal__message">{copy.changeEmailBody}</p>
          {error ? <div className="verify-email-modal__error">{error}</div> : null}

          <div className="verify-email-modal__field">
            <label htmlFor="change-verification-email" className="verify-email-modal__label">
              {copy.newEmailLabel}
            </label>
            <input
              ref={emailInputRef}
              id="change-verification-email"
              type="email"
              className="verify-email-modal__input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={copy.newEmailPlaceholder}
              autoComplete="email"
              disabled={loading}
            />
          </div>

          <div className="verify-email-modal__actions">
            <button
              type="button"
              className="verify-email-modal__button verify-email-modal__button--secondary"
              onClick={onBack}
              disabled={loading}
            >
              {copy.back}
            </button>
            <button
              type="submit"
              className="verify-email-modal__button verify-email-modal__button--primary"
              disabled={loading || isCoolingDown}
            >
              {loading ? copy.submitting : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </Popup>
  );
}
