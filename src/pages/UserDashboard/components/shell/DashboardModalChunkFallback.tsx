import { DashboardLoadingState } from '@shared/ui/dashboard';

/** Shown while a lazy dashboard modal chunk is loading. */
export function DashboardModalChunkFallback() {
  return (
    <div className="user-dashboard__modal-chunk-fallback" role="status" aria-live="polite">
      <DashboardLoadingState />
    </div>
  );
}
