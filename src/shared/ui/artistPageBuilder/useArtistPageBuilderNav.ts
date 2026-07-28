import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DashboardTab } from '@shared/lib/accountType';
import type { DashboardOpenIntent } from '@shared/lib/dashboardOpenIntent';
import { useEffectiveLocation } from '@shared/lib/hooks/useEffectiveLocation';
import { preloadUserDashboardModule } from '@shared/lib/preloadUserDashboard';

export function useArtistPageBuilderNav() {
  const location = useEffectiveLocation();
  const navigate = useNavigate();

  const openDashboard = useCallback(
    (tab: DashboardTab, intent: Omit<DashboardOpenIntent, 'backgroundLocation'> = {}) => {
      preloadUserDashboardModule();
      navigate(`/dashboard-new/${tab}`, {
        state: {
          backgroundLocation: location,
          ...intent,
        },
      });
    },
    [location, navigate]
  );

  return { openDashboard };
}
