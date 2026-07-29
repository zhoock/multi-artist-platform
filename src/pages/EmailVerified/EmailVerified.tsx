import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { refreshAuthSession } from '@shared/lib/auth';
import {
  locationFromReturnPath,
  resolveReturnPathFromSearchParam,
} from '@shared/lib/authReturnUrl';
import { captureDashboardModalBackground } from '@shared/lib/dashboardModalBackground';
import { useEmailVerificationCopy } from '@shared/lib/emailVerification';
import { useAuthSessionUser } from '@shared/lib/hooks/useAuthSessionUser';
import { ServicePageLayout } from '@shared/ui/serviceScreen';

const DASHBOARD_PATH = '/dashboard-new';

export default function EmailVerified() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const copy = useEmailVerificationCopy();
  const user = useAuthSessionUser();

  const returnPath = useMemo(
    () => resolveReturnPathFromSearchParam(searchParams.get('returnTo'), user),
    [searchParams, user]
  );

  useEffect(() => {
    void refreshAuthSession();
  }, []);

  const handleGoHome = () => {
    navigate(returnPath, { replace: true });
  };

  const handleOpenDashboard = () => {
    const backgroundLocation = locationFromReturnPath(returnPath);

    captureDashboardModalBackground({
      pathname: backgroundLocation.pathname,
      search: backgroundLocation.search,
      hash: backgroundLocation.hash ?? '',
    });

    navigate(DASHBOARD_PATH, {
      replace: true,
      state: { backgroundLocation },
    });
  };

  return (
    <ServicePageLayout
      scene="envelope"
      titleId="email-verified-title"
      pageTitle={copy.successTitle}
      title={copy.successTitle}
      description={copy.successBody}
      action={{ label: copy.continueToHome, onClick: handleGoHome }}
      secondaryAction={{
        prefix: copy.openDashboardPrefix,
        label: copy.openDashboardLink,
        onClick: handleOpenDashboard,
      }}
    />
  );
}
