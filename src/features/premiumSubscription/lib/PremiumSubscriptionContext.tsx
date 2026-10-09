import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { getMyArchive, type MyArchiveData } from '@shared/api/archive';
import { EMPTY_BILLING_SNAPSHOT, type BillingSnapshot } from '@shared/api/billing';
import { AUTH_SESSION_CHANGED_EVENT, getToken } from '@shared/lib/auth';
import {
  resolveEffectiveSubscriptionPlanSlug,
  type SubscriptionPlanSlug,
} from '@shared/lib/payment/subscriptionPlans';
import { ARCHIVE_CHANGED_EVENT, SUBSCRIPTION_ACTIVATED_EVENT } from '@features/artistArchive';
import {
  beginMyArchiveProviderFetch,
  isMyArchiveProviderFetchStale,
} from '@shared/lib/archive/myArchiveFetchGeneration';
import { traceCollectionExpiredBanner } from '@shared/lib/archive/collectionExpiredBannerTrace';
import { traceCollectionRemove } from '@shared/lib/archive/collectionArtistRemoveTrace';

export type PremiumSubscriptionRefetchOptions = {
  /** Skip global loading flag — use for renewal polling and other background sync. */
  silent?: boolean;
};

export type PremiumSubscriptionContextValue = {
  isPremium: boolean;
  slotsLimit: number;
  slotsUsed: number;
  planSlug: SubscriptionPlanSlug | null;
  billing: BillingSnapshot;
  loading: boolean;
  refetch: (options?: PremiumSubscriptionRefetchOptions) => Promise<void>;
  /** Apply `/api/my-archive` fields without a second network round-trip. */
  applyArchiveSnapshot: (
    data: Pick<MyArchiveData, 'isPremium' | 'slotsLimit' | 'slotsUsed' | 'billing'>
  ) => void;
};

const PremiumSubscriptionContext = createContext<PremiumSubscriptionContextValue | null>(null);

export function PremiumSubscriptionProvider({ children }: { children: ReactNode }) {
  const [isPremium, setIsPremium] = useState(false);
  const [slotsLimit, setSlotsLimit] = useState(3);
  const [slotsUsed, setSlotsUsed] = useState(0);
  const [billing, setBilling] = useState<BillingSnapshot>(EMPTY_BILLING_SNAPSHOT);
  const [loading, setLoading] = useState(() => Boolean(getToken()));

  const applyArchiveSnapshot = useCallback(
    (data: Pick<MyArchiveData, 'isPremium' | 'slotsLimit' | 'slotsUsed' | 'billing'>) => {
      setIsPremium(data.isPremium);
      setSlotsLimit(data.slotsLimit);
      setSlotsUsed(data.slotsUsed);
      setBilling(data.billing ?? EMPTY_BILLING_SNAPSHOT);
    },
    []
  );

  const refetch = useCallback(
    async (options?: PremiumSubscriptionRefetchOptions) => {
      if (!getToken()) {
        setIsPremium(false);
        setSlotsLimit(3);
        setSlotsUsed(0);
        setBilling(EMPTY_BILLING_SNAPSHOT);
        setLoading(false);
        return;
      }

      const silent = options?.silent === true;
      if (!silent) {
        setLoading(true);
      }
      try {
        const generation = beginMyArchiveProviderFetch();
        const data = await getMyArchive();
        if (isMyArchiveProviderFetchStale(generation)) {
          traceCollectionRemove({
            source: 'PremiumSubscriptionProvider.refetch(stale-skip)',
            fetchGeneration: generation,
            extra: silent ? 'silent' : 'foreground',
          });
          return;
        }
        applyArchiveSnapshot(data);
        traceCollectionExpiredBanner({
          source: 'PremiumSubscriptionProvider.refetch(apply)',
          hasPremiumAccess: data.billing?.hasPremiumAccess,
          status: data.billing?.status,
          autoRenewEnabled: data.billing?.autoRenewEnabled,
          hasSavedPaymentMethod: data.billing?.hasSavedPaymentMethod,
          nextChargeAt: data.billing?.nextChargeAt,
          expiresAt: data.billing?.expiresAt,
        });
        traceCollectionRemove({
          source: 'PremiumSubscriptionProvider.refetch(apply)',
          fetchGeneration: generation,
          billingStatus: data.billing?.status,
          hasPremiumAccess: data.billing?.hasPremiumAccess,
          autoRenewEnabled: data.billing?.autoRenewEnabled,
          hasSavedPaymentMethod: data.billing?.hasSavedPaymentMethod,
          nextChargeAt: data.billing?.nextChargeAt,
          expiresAt: data.billing?.expiresAt,
          extra: silent ? 'silent' : 'foreground',
        });
      } catch {
        setIsPremium(false);
        setBilling(EMPTY_BILLING_SNAPSHOT);
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [applyArchiveSnapshot]
  );

  useEffect(() => {
    void refetch();

    const onChanged = () => {
      void refetch({ silent: true });
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refetch({ silent: true });
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
    return {
      isPremium,
      slotsLimit,
      slotsUsed,
      planSlug,
      billing,
      loading,
      refetch,
      applyArchiveSnapshot,
    };
  }, [applyArchiveSnapshot, billing, isPremium, loading, refetch, slotsLimit, slotsUsed]);

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
      applyArchiveSnapshot: () => {},
    };
  }
  return ctx;
}
