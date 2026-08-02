export const CURRENT_CONSENT_VERSION = 1;

const STORAGE_KEY = 'sc_analytics_consent';

export type ConsentDecision = 'accepted' | 'declined';

export type ConsentStatus = 'unknown' | ConsentDecision;

type StoredConsent = {
  status: ConsentDecision;
  consentVersion: number;
  decidedAt: string;
};

function readStoredConsent(): StoredConsent | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredConsent>;
    if (parsed.status !== 'accepted' && parsed.status !== 'declined') {
      return null;
    }
    if (typeof parsed.consentVersion !== 'number' || !Number.isFinite(parsed.consentVersion)) {
      return null;
    }
    if (typeof parsed.decidedAt !== 'string' || parsed.decidedAt.trim().length === 0) {
      return null;
    }

    return {
      status: parsed.status,
      consentVersion: parsed.consentVersion,
      decidedAt: parsed.decidedAt,
    };
  } catch {
    return null;
  }
}

function writeStoredConsent(record: StoredConsent): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* ignore quota */
  }
}

export function readConsentStatus(): ConsentStatus {
  const stored = readStoredConsent();
  if (!stored) {
    return 'unknown';
  }

  if (stored.consentVersion !== CURRENT_CONSENT_VERSION) {
    return 'unknown';
  }

  return stored.status;
}

export function saveConsentDecision(status: ConsentDecision): void {
  writeStoredConsent({
    status,
    consentVersion: CURRENT_CONSENT_VERSION,
    decidedAt: new Date().toISOString(),
  });
}

/** @internal Reset for tests. */
export function __resetConsentStorageForTests(): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem(STORAGE_KEY);
}
