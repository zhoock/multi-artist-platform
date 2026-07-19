import { useEffect, useState } from 'react';
import { getPaymentSettings } from '@shared/api/payment/settings';
import { resolveMonetizationEnabled } from './artistMonetization';
import { subscribeArtistMonetizationChanged } from './artistMonetizationEvents';

/**
 * Активная ЮKassa у пользователя: запись в БД с is_active и непустым shopId.
 * `monetizationEnabled` — канонический флаг для premium-функций артиста.
 *
 * While `loading` is true, `monetizationEnabled === false` means "unknown", not
 * "disconnected". Callers must not render "connect payments" CTAs until `!loading`.
 */
export function useYooKassaPaymentConnected(userId: string | undefined | null) {
  const [loading, setLoading] = useState(true);
  const [monetizationEnabled, setMonetizationEnabled] = useState(false);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      setMonetizationEnabled(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const refresh = () => {
      void getPaymentSettings({ provider: 'yookassa' }).then((res) => {
        if (cancelled) return;
        const ok = res.success && resolveMonetizationEnabled(res.settings);
        setMonetizationEnabled(ok);
        setLoading(false);
      });
    };

    refresh();
    const unsubscribe = subscribeArtistMonetizationChanged((enabled) => {
      if (cancelled) return;
      setMonetizationEnabled(enabled);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [userId]);

  return {
    loading,
    monetizationEnabled,
    /** @deprecated Prefer `monetizationEnabled` */
    hasYooKassa: monetizationEnabled,
  };
}
