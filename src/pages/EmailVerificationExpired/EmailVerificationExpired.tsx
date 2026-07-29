import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAuthenticated, refreshAuthSession, resendVerificationEmail } from '@shared/lib/auth';
import {
  useEmailVerificationCopy,
  useResendCooldown,
  resolveVerificationEmailSend,
} from '@shared/lib/emailVerification';
import { ServicePageLayout } from '@shared/ui/serviceScreen';

export default function EmailVerificationExpired() {
  const navigate = useNavigate();
  const copy = useEmailVerificationCopy();
  const { remaining, isCoolingDown, startCooldown } = useResendCooldown();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSendNewLink = async () => {
    if (!isAuthenticated()) {
      navigate('/auth?mode=login', { replace: true });
      return;
    }
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
      void refreshAuthSession();
      navigate('/email-verified', { replace: true });
      return;
    }
    setSuccess(false);
    setError(resolution.message);
  };

  const resendLabel = isCoolingDown ? `${copy.sendNewLink} (${remaining}s)` : copy.sendNewLink;

  return (
    <ServicePageLayout
      scene="broken-link"
      titleId="email-verification-expired-title"
      pageTitle={copy.expiredTitle}
      title={copy.expiredTitle}
      description={copy.expiredBody}
      extraContent={
        success ? (
          <p className="service-content__message service-content__message--success" role="status">
            <strong>{copy.verificationSentTitle}</strong>
            <br />
            {copy.verificationSentBody}
          </p>
        ) : error ? (
          <p className="service-content__message" role="alert">
            {error}
          </p>
        ) : null
      }
      action={{
        label: loading ? copy.submitting : resendLabel,
        onClick: handleSendNewLink,
        disabled: loading || isCoolingDown,
      }}
      secondaryAction={{
        label: copy.backToLogin,
        onClick: () => navigate('/auth?mode=login', { replace: true }),
      }}
    />
  );
}
