import { useState } from 'react';
import { Mail as MailIcon } from 'lucide-react';
import { Popup } from '@shared/ui/popup';
import { refreshAuthSession, resendVerificationEmail } from '@shared/lib/auth';
import { useAuthSessionUser } from '@shared/lib/hooks/useAuthSessionUser';
import {
  useEmailVerificationCopy,
  useResendCooldown,
  resolveVerificationEmailSend,
} from '@shared/lib/emailVerification';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import { ChangeEmailModal } from './ChangeEmailModal';
import './VerifyEmailModal.style.scss';

interface VerifyEmailModalProps {
  isOpen: boolean;
  onContinueLater: () => void;
  onClose?: () => void;
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m5 12 5 5L20 7"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function VerifyEmailModal({ isOpen, onContinueLater, onClose }: VerifyEmailModalProps) {
  const user = useAuthSessionUser();
  const copy = useEmailVerificationCopy();
  const { remaining, isCoolingDown, startCooldown } = useResendCooldown();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showChangeEmail, setShowChangeEmail] = useState(false);

  const handleDismiss = onClose ?? onContinueLater;

  const handleResend = async () => {
    if (isCoolingDown || loading) return;
    setLoading(true);
    setError(null);
    const result = await resendVerificationEmail();
    setLoading(false);
    const resolution = resolveVerificationEmailSend(result, copy, startCooldown);
    if (resolution.kind === 'success') {
      setSuccess(true);
      return;
    }
    if (resolution.kind === 'already-verified') {
      // Sync auth state — the parent will hide the modal once user.isEmailVerified flips.
      void refreshAuthSession();
      handleDismiss();
      return;
    }
    setError(resolution.message);
  };

  const resendLabel = isCoolingDown ? `${copy.resendEmail} (${remaining}s)` : copy.resendEmail;

  if (showChangeEmail) {
    return (
      <ChangeEmailModal
        isOpen={isOpen}
        onBack={() => setShowChangeEmail(false)}
        onClose={handleDismiss}
      />
    );
  }

  return (
    <Popup
      isActive={isOpen}
      onClose={handleDismiss}
      closeBlocked={loading}
      bgColor="rgba(var(--deep-black-rgb) / 95%)"
    >
      <div className="verify-email-modal">
        <div className="verify-email-modal__container">
          <div className="verify-email-modal__header">
            <div className="verify-email-modal__title-row">
              <span className="verify-email-modal__icon" aria-hidden="true">
                <MailIcon {...dashboardActionIconProps({ size: 22, strokeWidth: 1.75 })} />
              </span>
              <h2 className="verify-email-modal__title">{copy.verifyTitle}</h2>
            </div>
            <button
              type="button"
              className="verify-email-modal__close"
              onClick={handleDismiss}
              disabled={loading}
              aria-label={copy.close}
            >
              <ModalCloseIcon />
            </button>
          </div>

          <p className="verify-email-modal__message">{copy.verifyBody}</p>
          {user?.email ? <p className="verify-email-modal__email">{user.email}</p> : null}
          {success ? (
            <div className="verify-email-modal__success" role="status" aria-live="polite">
              <span className="verify-email-modal__success-icon" aria-hidden="true">
                <CheckIcon />
              </span>
              <div className="verify-email-modal__success-copy">
                <p className="verify-email-modal__success-title">{copy.verificationSentTitle}</p>
                <p className="verify-email-modal__success-body">{copy.verificationSentBody}</p>
              </div>
            </div>
          ) : null}
          {error ? (
            <div className="verify-email-modal__error" role="alert">
              {error}
            </div>
          ) : null}

          <div className="verify-email-modal__actions">
            <button
              type="button"
              className="verify-email-modal__button verify-email-modal__button--secondary"
              onClick={() => setShowChangeEmail(true)}
              disabled={loading}
            >
              {copy.changeEmail}
            </button>
            <button
              type="button"
              className="verify-email-modal__button verify-email-modal__button--primary"
              onClick={handleResend}
              disabled={loading || isCoolingDown}
            >
              {loading ? copy.submitting : resendLabel}
            </button>
          </div>

          <button
            type="button"
            className="verify-email-modal__footer-link"
            onClick={onContinueLater}
          >
            {copy.continueLater}
          </button>
        </div>
      </div>
    </Popup>
  );
}
