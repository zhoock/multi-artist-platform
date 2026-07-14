import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { getUser } from '@shared/lib/auth';
import { useYooKassaPaymentConnected } from './useYooKassaPaymentConnected';

export type ArtistMonetizationValue = {
  /** True when the current artist has connected payment acceptance. */
  monetizationEnabled: boolean;
  loading: boolean;
};

const ArtistMonetizationContext = createContext<ArtistMonetizationValue | null>(null);

function ArtistMonetizationProviderFromSettings({ children }: { children: ReactNode }) {
  const userId = getUser()?.id;
  const { loading, monetizationEnabled } = useYooKassaPaymentConnected(userId);
  const value = useMemo(() => ({ monetizationEnabled, loading }), [monetizationEnabled, loading]);
  return (
    <ArtistMonetizationContext.Provider value={value}>
      {children}
    </ArtistMonetizationContext.Provider>
  );
}

/**
 * Single source of monetization state for the artist dashboard.
 * Premium UI (subscribers_only, etc.) reads this instead of re-fetching payment settings.
 * Pass `value` to override (tests / storybook).
 */
export function ArtistMonetizationProvider({
  children,
  value,
}: {
  children: ReactNode;
  value?: ArtistMonetizationValue;
}) {
  if (value) {
    return (
      <ArtistMonetizationContext.Provider value={value}>
        {children}
      </ArtistMonetizationContext.Provider>
    );
  }
  return (
    <ArtistMonetizationProviderFromSettings>{children}</ArtistMonetizationProviderFromSettings>
  );
}

export function useArtistMonetization(): ArtistMonetizationValue {
  const ctx = useContext(ArtistMonetizationContext);
  if (ctx) return ctx;
  return { monetizationEnabled: false, loading: false };
}
