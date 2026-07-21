import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import {
  getPaymentSettings,
  savePaymentSettings,
  disconnectPaymentProvider,
} from '@shared/api/payment/settings';
import type { PaymentProvider, UserPaymentSettings } from '@shared/api/payment/types';
import { resolveMonetizationEnabled } from '@shared/lib/payment/artistMonetization';
import { notifyPublicSurfaceChanged } from '@shared/lib/publicSurfaceSync';
import { refreshPremiumContentForArchiveChange } from '@features/artistArchive';
import { getStore } from '@shared/model/appStore';
import { PAYMENT_PROVIDERS } from '../lib/constants';
import { fillPaymentSettingsTemplate } from '../lib/fillPaymentSettingsTemplate';

interface UsePaymentSettingsOptions {
  userId: string;
  active: boolean;
}

interface UsePaymentSettingsReturn {
  settingsMap: Record<PaymentProvider, UserPaymentSettings | null>;
  loading: boolean;
  loadSucceeded: boolean;
  saving: PaymentProvider | null;
  error: string | null;
  success: string | null;
  activeProvider: PaymentProvider;
  shopId: string;
  secretKey: string;
  localShopId: Record<PaymentProvider, string>;
  localSecretKey: Record<PaymentProvider, string>;
  showForm: Record<PaymentProvider, boolean>;
  setActiveProvider: (provider: PaymentProvider) => void;
  setShopId: Dispatch<SetStateAction<string>>;
  setSecretKey: Dispatch<SetStateAction<string>>;
  setLocalShopId: Dispatch<SetStateAction<Record<PaymentProvider, string>>>;
  setLocalSecretKey: Dispatch<SetStateAction<Record<PaymentProvider, string>>>;
  setShowForm: Dispatch<SetStateAction<Record<PaymentProvider, boolean>>>;
  loadSettings: () => Promise<void>;
  handleConnect: (
    provider: PaymentProvider,
    shopIdFromForm?: string,
    secretKeyFromForm?: string
  ) => Promise<void>;
  handleDisconnect: (provider: PaymentProvider) => Promise<void>;
}

export function usePaymentSettings({
  userId,
  active,
}: UsePaymentSettingsOptions): UsePaymentSettingsReturn {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const copy = ui?.dashboard?.paymentSettings;

  const [settingsMap, setSettingsMap] = useState<
    Record<PaymentProvider, UserPaymentSettings | null>
  >({
    yookassa: null,
    stripe: null,
    paypal: null,
  });
  const [loading, setLoading] = useState(false);
  const [loadSucceeded, setLoadSucceeded] = useState(false);
  const [saving, setSaving] = useState<PaymentProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [activeProvider, setActiveProvider] = useState<PaymentProvider>('yookassa');
  const [shopId, setShopId] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [localShopId, setLocalShopId] = useState<Record<PaymentProvider, string>>({
    yookassa: '',
    stripe: '',
    paypal: '',
  });
  const [localSecretKey, setLocalSecretKey] = useState<Record<PaymentProvider, string>>({
    yookassa: '',
    stripe: '',
    paypal: '',
  });
  const [showForm, setShowForm] = useState<Record<PaymentProvider, boolean>>({
    yookassa: false,
    stripe: false,
    paypal: false,
  });

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const providers: PaymentProvider[] = ['yookassa'];
      const results = await Promise.all(
        providers.map((provider) => getPaymentSettings({ provider }))
      );

      const newSettingsMap: Record<PaymentProvider, UserPaymentSettings | null> = {
        yookassa: null,
        stripe: null,
        paypal: null,
      };

      providers.forEach((provider, index) => {
        const result = results[index];
        if (result.success && result.settings) {
          newSettingsMap[provider] = result.settings;
        }
      });

      setSettingsMap(newSettingsMap);

      const activeSettings = newSettingsMap[activeProvider];
      if (activeSettings) {
        setShopId(activeSettings.shopId || '');
      }
      setLoadSucceeded(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load payment settings';
      if (!errorMessage.includes('netlify') && !errorMessage.includes('JSON')) {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }, [activeProvider, userId]);

  useEffect(() => {
    if (!active || loadSucceeded) return;
    void loadSettings();
  }, [active, loadSucceeded, loadSettings]);

  const handleConnect = async (
    provider: PaymentProvider,
    shopIdFromForm?: string,
    secretKeyFromForm?: string
  ) => {
    const sid = (shopIdFromForm ?? shopId).trim();
    const sec = (secretKeyFromForm ?? secretKey).trim();
    if (!sid || !sec) {
      setError(copy?.fillAllFields ?? 'Please fill in all fields');
      return;
    }

    setSaving(provider);
    setError(null);
    setSuccess(null);

    const providerName = PAYMENT_PROVIDERS.find((p) => p.id === provider)?.name || provider;

    try {
      const result = await savePaymentSettings({
        provider,
        shopId: sid,
        secretKey: sec,
        isActive: true,
      });

      if (result.success) {
        setSuccess(
          fillPaymentSettingsTemplate(
            copy?.connectSuccess ?? '{provider} connected successfully!',
            {
              provider: providerName,
            }
          )
        );
        setSettingsMap((prev) => ({
          ...prev,
          [provider]: result.settings || null,
        }));
        setShowForm((prev) => ({ ...prev, [provider]: false }));
        setSecretKey('');
        await loadSettings();
        if (provider === 'yookassa') {
          const enabled = resolveMonetizationEnabled(result.settings);
          notifyPublicSurfaceChanged({ type: 'monetizationChanged', enabled });
          refreshPremiumContentForArchiveChange(getStore().dispatch, undefined, {
            immediate: true,
          });
        }
      } else {
        const errorMessage = result.message || result.error || 'Failed to save payment settings';
        console.error('❌ Payment settings save failed:', {
          error: result.error,
          message: result.message,
          fullResult: result,
        });
        setError(errorMessage);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save payment settings');
    } finally {
      setSaving(null);
    }
  };

  const handleDisconnect = async (provider: PaymentProvider) => {
    const providerName = PAYMENT_PROVIDERS.find((p) => p.id === provider)?.name || provider;

    setSaving(provider);
    setError(null);
    setSuccess(null);

    try {
      const result = await disconnectPaymentProvider(provider);

      if (result.success) {
        setSuccess(
          fillPaymentSettingsTemplate(
            copy?.disconnectSuccess ?? '{provider} disconnected successfully',
            { provider: providerName }
          )
        );
        setSettingsMap((prev) => ({ ...prev, [provider]: null }));
        setShopId('');
        setSecretKey('');
        setShowForm((prev) => ({ ...prev, [provider]: false }));
        await loadSettings();
        if (provider === 'yookassa') {
          notifyPublicSurfaceChanged({ type: 'monetizationChanged', enabled: false });
          refreshPremiumContentForArchiveChange(getStore().dispatch, undefined, {
            immediate: true,
          });
        }
      } else {
        setError(result.error || 'Failed to disconnect payment provider');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect payment provider');
    } finally {
      setSaving(null);
    }
  };

  return {
    settingsMap,
    loading,
    loadSucceeded,
    saving,
    error,
    success,
    activeProvider,
    shopId,
    secretKey,
    localShopId,
    localSecretKey,
    showForm,
    setActiveProvider,
    setShopId,
    setSecretKey,
    setLocalShopId,
    setLocalSecretKey,
    setShowForm,
    loadSettings,
    handleConnect,
    handleDisconnect,
  };
}
