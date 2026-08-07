import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { getMyArchive } from '@shared/api/archive';
import { EMPTY_BILLING_SNAPSHOT, type BillingSnapshot } from '@shared/api/billing';
import { AUTH_SESSION_CHANGED_EVENT, getToken } from '@shared/lib/auth';
import {
  resolveEffectiveSubscriptionPlanSlug,
  type SubscriptionPlanSlug,
} from '@shared/lib/payment/subscriptionPlans';
import { ARCHIVE_CHANGED_EVENT, SUBSCRIPTION_ACTIVATED_EVENT } from '@features/artistArchive';

export type PremiumSubscriptionContextValue = {
  isPremium: boolean;
  slotsLimit: number;
  slotsUsed: number;
  planSlug: SubscriptionPlanSlug | null;
  billing: BillingSnapshot;
  loading: boolean;
  refetch: () => Promise<void>;
};

const PremiumSubscriptionContext = createContext<PremiumSubscriptionContextValue | null>(null);

export function PremiumSubscriptionProvider({ children }: { children: ReactNode }) {
  const [isPremium, setIsPremium] = useState(false);
  const [slotsLimit, setSlotsLimit] = useState(3);
  const [slotsUsed, setSlotsUsed] = useState(0);
  const [billing, setBilling] = useState<BillingSnapshot>(EMPTY_BILLING_SNAPSHOT);
  const [loading, setLoading] = useState(() => Boolean(getToken()));

  const refetch = useCallback(async () => {
    if (!getToken()) {
      setIsPremium(false);
      setSlotsLimit(3);
      setSlotsUsed(0);
      setBilling(EMPTY_BILLING_SNAPSHOT);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await getMyArchive();
      setIsPremium(data.isPremium);
      setSlotsLimit(data.slotsLimit);
      setSlotsUsed(data.slotsUsed);
      setBilling(data.billing ?? EMPTY_BILLING_SNAPSHOT);
    } catch {
      setIsPremium(false);
      setBilling(EMPTY_BILLING_SNAPSHOT);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();

    const onChanged = () => {
      void refetch();
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refetch();
      }
    };

    window.addEventListener(SUBSCRIPTION_ACTIVATED_EVENT, onChanged);
    window.addEventListener(ARCHIVE_CHANGED_EVENT, onChanged);
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, onChanged);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(SUBSCRIPTION_ACTIVATED_EVENT, onChanged);
      window.removeEventListener(ARCHIVE_CHANGED_EVENT, onChanged);
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, onChanged);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refetch]);

  const value = useMemo(() => {
    const planSlug = resolveEffectiveSubscriptionPlanSlug({
      billing,
      slotsLimit,
      slotsUsed,
      isPremium,
    });
    return { isPremium, slotsLimit, slotsUsed, planSlug, billing, loading, refetch };
  }, [billing, isPremium, loading, refetch, slotsLimit, slotsUsed]);

  return (
    <PremiumSubscriptionContext.Provider value={value}>
      {children}
    </PremiumSubscriptionContext.Provider>
  );
}

export function usePremiumSubscription(): PremiumSubscriptionContextValue {
  const ctx = useContext(PremiumSubscriptionContext);
  if (!ctx) {
    return {
      isPremium: false,
      slotsLimit: 3,
      slotsUsed: 0,
      planSlug: null,
      billing: EMPTY_BILLING_SNAPSHOT,
      loading: false,
      refetch: async () => {},
    };
  }
  return ctx;
}
