import { Suspense, useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { PageRouteLoader } from '@app/ui/InitialAppLoader';
import { appendReturnTo } from '@shared/lib/authReturnUrl';
import { buildAuthPath } from '@shared/lib/internalAppUrls';
import { getToken } from '@shared/lib/auth';
import { verifyAdminPanelAccess } from '@shared/lib/adminPanelAccess';
import { DEFAULT_ROUTE_LANG, buildLocalizedPublicPath } from '@shared/lib/i18n/routeLang';
import { AdminNotificationsProvider } from './AdminNotificationsContext';

type GateState = 'loading' | 'allowed' | 'denied' | 'unauth';

export default function AdminPanelGate() {
  const location = useLocation();
  const [state, setState] = useState<GateState>('loading');

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!getToken()) {
        if (!cancelled) setState('unauth');
        return;
      }
      const { allowed } = await verifyAdminPanelAccess();
      if (cancelled) return;
      setState(allowed ? 'allowed' : 'denied');
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'loading') {
    return <PageRouteLoader />;
  }

  if (state === 'unauth') {
    const params = new URLSearchParams();
    params.set('mode', 'login');
    appendReturnTo(params, location);
    return <Navigate to={buildAuthPath(params)} replace state={{ backgroundLocation: location }} />;
  }

  if (state === 'denied') {
    return <Navigate to={buildLocalizedPublicPath(DEFAULT_ROUTE_LANG, '/')} replace />;
  }

  return (
    <Suspense fallback={<PageRouteLoader />}>
      <AdminNotificationsProvider>
        <Outlet />
      </AdminNotificationsProvider>
    </Suspense>
  );
}
