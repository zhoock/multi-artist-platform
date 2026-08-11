import { useDashboardBillingSync } from '../lib/useDashboardBillingSync';

/** Single dashboard-scoped billing polling mount point (renders nothing). */
export function DashboardBillingSync() {
  useDashboardBillingSync();
  return null;
}
