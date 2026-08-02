import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { readConsentStatus, saveConsentDecision, type ConsentStatus } from './consentStorage';
import { ConsentBanner } from './ConsentBanner';

type ConsentContextValue = {
  status: ConsentStatus;
  accept: () => void;
  decline: () => void;
};

const ConsentContext = createContext<ConsentContextValue | null>(null);

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConsentStatus>(() => readConsentStatus());

  const accept = useCallback(() => {
    saveConsentDecision('accepted');
    setStatus('accepted');
  }, []);

  const decline = useCallback(() => {
    saveConsentDecision('declined');
    setStatus('declined');
  }, []);

  const value = useMemo(
    () => ({
      status,
      accept,
      decline,
    }),
    [status, accept, decline]
  );

  return (
    <ConsentContext.Provider value={value}>
      {children}
      {status === 'unknown' ? <ConsentBanner /> : null}
    </ConsentContext.Provider>
  );
}

export function useConsent(): ConsentContextValue {
  const context = useContext(ConsentContext);
  if (!context) {
    throw new Error('useConsent must be used within ConsentProvider');
  }

  return context;
}
