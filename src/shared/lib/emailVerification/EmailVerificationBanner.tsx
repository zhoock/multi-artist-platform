import { useState } from 'react';
import { TriangleAlert as TriangleAlertIcon } from 'lucide-react';
import { ChangeEmailModal } from '@features/auth/ui/ChangeEmailModal';
import { isEmailVerified, refreshAuthSession, resendVerificationEmail } from '@shared/lib/auth';
import { useAuthSessionUser } from '@shared/lib/hooks/useAuthSessionUser';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import { useEmailVerificationCopy } from './useEmailVerificationCopy';
import { useResendCooldown } from './useResendCooldown';
import { resolveVerificationEmailSend } from './resolveVerificationEmailSendResult';
import './style.scss';

const BANNER_DISMISSED_KEY = 'email-verification-banner-dismissed';

function BannerSubtitle({ template, email }: { template: string; email: string }) {
  const parts = template.split('{{email}}');
  if (parts.length === 1) {
    return <p className="email-verification-banner__subtitle">{template}</p>;
  }

  return (
    <p className="email-verification-banner__subtitle">
      {parts[0]}
      <span className="email-verification-banner__email">{email}</span>
      {parts.slice(1).join('{{email}}')}
    </p>
  );
}

export function EmailVerificationBanner() {
  const user = useAuthSessionUser();
  const copy = useEmailVerificationCopy();
  const { remaining, isCoolingDown, startCooldown } = useResendCooldown();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(BANNER_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showChangeEmail, setShowChangeEmail] = useState(false);

  if (!user || isEmailVerified(user) || dismissed) {
    return null;
  }

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
      // Sync session — banner self-hides once isEmailVerified(user) becomes true.
      void refreshAuthSession();
      return;
    }
    setSuccess(false);
    setError(resolution.message);
  };

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(BANNER_DISMISSED_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  const resendLabel = isCoolingDown ? `${copy.resendEmail} (${remaining}s)` : copy.resendEmail;

  return (
    <>
      <section className="email-verification-banner" role="status" aria-live="polite">
        <div className="email-verification-banner__inner">
          <span className="email-verification-banner__icon" aria-hidden="true">
            <TriangleAlertIcon {...dashboardActionIconProps({ size: 22, strokeWidth: 1.75 })} />
          </span>

          <div className="email-verification-banner__copy">
            <p className="email-verification-banner__title">{copy.bannerText}</p>
            <BannerSubtitle template={copy.bannerSubtitle} email={user.email} />
            {success ? (
              <p className="email-verification-banner__success">
                <span className="email-verification-banner__success-dot" aria-hidden="true" />
                {copy.verificationSentTitle}. {copy.verificationSentBody}
              </p>
            ) : null}
            {error ? (
              <p className="email-verification-banner__error" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className="email-verification-banner__actions">
            <button
              type="button"
              className="email-verification-banner__resend"
              onClick={handleResend}
              disabled={loading || isCoolingDown}
            >
              {loading ? copy.submitting : resendLabel}
            </button>
            <span className="email-verification-banner__actions-sep" aria-hidden="true">
              •
            </span>
            <button
              type="button"
              className="email-verification-banner__change-email"
              onClick={() => setShowChangeEmail(true)}
              disabled={loading}
            >
              {copy.changeEmail}
            </button>
          </div>

          <button
            type="button"
            className="email-verification-banner__close"
            onClick={handleDismiss}
            aria-label={copy.close}
          >
            <ModalCloseIcon />
          </button>
        </div>
      </section>

      <ChangeEmailModal
        isOpen={showChangeEmail}
        onBack={() => setShowChangeEmail(false)}
        onClose={() => setShowChangeEmail(false)}
      />
    </>
  );
}
