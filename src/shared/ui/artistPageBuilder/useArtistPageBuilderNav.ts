import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { DashboardTab } from '@shared/lib/accountType';
import type { DashboardOpenIntent } from '@shared/lib/dashboardOpenIntent';

export function useArtistPageBuilderNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const openDashboard = useCallback(
    (tab: DashboardTab, intent: Omit<DashboardOpenIntent, 'backgroundLocation'> = {}) => {
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
