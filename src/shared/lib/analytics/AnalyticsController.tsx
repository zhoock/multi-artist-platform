import { useEffect } from 'react';

import { useConsent } from '@shared/lib/consent';

import { initAnalytics } from './initAnalytics';

/**
 * Initializes analytics when the user has accepted cookie/analytics consent.
 *
 * Consent note: until initAnalytics() runs, gaEvent() is a no-op by design —
 * pre-consent interactions are not buffered or replayed after consent.
 */
export function AnalyticsController() {
  const { status } = useConsent();

  useEffect(() => {
    if (status === 'accepted') {
      void initAnalytics();
    }
  }, [status]);

  return null;
}
