import clsx from 'clsx';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import {
  DashboardButton,
  DashboardCard,
  DashboardRow,
  DashboardRowValue,
  DashboardSection,
} from '@shared/ui/dashboard';
import { DashboardSaveSpinner } from '@shared/ui/dashboard-save/DashboardSaveSpinner';
import { InfoCircleIcon } from '@shared/ui/icons/InfoCircleIcon';
import { StatusBadge } from '@shared/ui/statusBadge';
import { usePaymentSettings } from '../model/usePaymentSettings';
import { PAYMENT_PROVIDERS } from '../lib/constants';
import '@shared/ui/dashboard-save/dashboard-save.scss';
import './PaymentSettings.style.scss';

interface PaymentSettingsProps {
  userId: string;
}

function PaymentProviderLogo({ providerId }: { providerId: string }) {
  if (providerId === 'yookassa') {
    return (
      <svg
        className="payment-settings__provider-logo-svg"
        viewBox="0 0 40 40"
        aria-hidden="true"
        focusable="false"
      >
        <rect width="40" height="40" rx="8" fill="#1a1a1a" />
        <path
          fill="#fff"
          d="M10 26V14h3.2l4.1 7.2V14H21v12h-3.1l-4.2-7.4V26H10zm14.2-6.1c0-3.4 2.5-5.9 6-5.9 3.5 0 6 2.5 6 5.9s-2.5 5.9-6 5.9c-3.5 0-6-2.5-6-5.9zm3.2 0c0 1.8 1.2 3.1 2.8 3.1s2.8-1.3 2.8-3.1-1.2-3.1-2.8-3.1-2.8 1.3-2.8 3.1z"
        />
      </svg>
    );
  }

  return null;
}

type ProviderRowLabelProps = {
  providerId: string;
  providerName: string;
  tagline: string;
};

function ProviderRowLabel({ providerId, providerName, tagline }: ProviderRowLabelProps) {
  return (
    <div className="payment-settings__provider-row-info">
      <div className="payment-settings__provider-logo">
        <PaymentProviderLogo providerId={providerId} />
      </div>
      <div className="payment-settings__provider-row-text">
        <span className="payment-settings__provider-row-name">{providerName}</span>
        <span className="payment-settings__provider-row-tagline">{tagline}</span>
      </div>
    </div>
  );
}

function updatedAtRowLabel(template: string | undefined) {
  const raw = template ?? 'Updated: {date}';
  return raw.split('{date}')[0]?.replace(/:\s*$/, '').trim() || 'Updated';
}

export function PaymentSettings({ userId }: PaymentSettingsProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const copy = ui?.dashboard?.paymentSettings;
  const dateLocale = lang === 'ru' ? 'ru-RU' : 'en-US';

  const {
    settingsMap,
    loading,
    saving,
    error,
    success,
    localShopId,
    localSecretKey,
    showForm,
    setActiveProvider,
    setShopId,
    setSecretKey,
    setLocalShopId,
    setLocalSecretKey,
    setShowForm,
    handleConnect,
    handleDisconnect,
  } = usePaymentSettings(userId);

  const isSaveInProgress = saving !== null;

  const renderProviderSection = (provider: (typeof PAYMENT_PROVIDERS)[0]) => {
    const settings = settingsMap[provider.id];
    const isThisSaving = saving === provider.id;
    const isFormOpen = showForm[provider.id];
    const isConnected = Boolean(settings?.isActive);
    const providerCopy = copy?.providers?.[provider.id];

    return (
      <DashboardSection
        key={provider.id}
        title={provider.name}
        headingExtra={
          isConnected ? (
            <StatusBadge variant="published">{copy?.connectedStatus ?? 'Connected'}</StatusBadge>
          ) : undefined
        }
      >
        <DashboardCard
          className={clsx(isThisSaving && 'dashboard-save-card--busy')}
          aria-busy={isThisSaving}
        >
          {isConnected ? (
            <>
              {settings?.connectedAt ? (
                <DashboardRow label={updatedAtRowLabel(copy?.updatedAt)}>
                  <DashboardRowValue>
                    {new Date(settings.connectedAt).toLocaleDateString(dateLocale)}
                  </DashboardRowValue>
                </DashboardRow>
              ) : null}

              <p className="payment-settings__connected-lede">
                {copy?.connectedLede ?? 'Fans can now pay for purchases on your site'}
              </p>

              <DashboardRow
                variant="action"
                label={
                  <ProviderRowLabel
                    providerId={provider.id}
                    providerName={provider.name}
                    tagline={providerCopy?.tagline ?? 'Online payment acceptance'}
                  />
                }
                action={
                  <DashboardButton
                    variant="outline"
                    destructive
                    className={clsx(isThisSaving && 'payment-settings__action--loading')}
                    onClick={() => handleDisconnect(provider.id)}
                    disabled={isSaveInProgress}
                  >
                    {isThisSaving ? (
                      <>
                        <DashboardSaveSpinner />
                        {copy?.disconnecting ?? 'Disconnecting...'}
                      </>
                    ) : (
                      (copy?.disconnect ?? 'Disconnect')
                    )}
                  </DashboardButton>
                }
              >
                <DashboardRowValue aria-hidden="true" />
              </DashboardRow>

              <p className="payment-settings__disconnect-note">
                <InfoCircleIcon className="payment-settings__disconnect-note-icon" size={18} />
                <span>
                  {copy?.disconnectNote ??
                    'If you disconnect YooKassa, payment acceptance will be unavailable. Your payment data will be saved.'}
                </span>
              </p>
            </>
          ) : (
            <>
              <div className="payment-settings__intro">
                <DashboardRowValue>
                  {providerCopy?.description ??
                    'Let people pay for purchases on your site through YooKassa'}
                </DashboardRowValue>
                <DashboardRowValue>
                  {providerCopy?.details ??
                    'To receive payments you need a YooKassa business account.'}
                </DashboardRowValue>
              </div>

              {!isFormOpen ? (
                <>
                  <div className="payment-settings__instructions">
                    <p>{providerCopy?.instructionsIntro ?? 'To connect, you need to:'}</p>
                    <ol>
                      {(providerCopy?.instructionSteps ?? []).map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                    <p>
                      <a href="https://yookassa.ru/" target="_blank" rel="noopener noreferrer">
                        {providerCopy?.registerLink ?? 'Go to YooKassa to sign up →'}
                      </a>
                    </p>
                  </div>
                  <DashboardButton
                    variant="primary"
                    className="payment-settings__cta"
                    onClick={() => {
                      setShowForm((prev) => ({ ...prev, [provider.id]: true }));
                      setActiveProvider(provider.id);
                      setLocalShopId((prev) => ({
                        ...prev,
                        [provider.id]: settings?.shopId || '',
                      }));
                      setLocalSecretKey((prev) => ({ ...prev, [provider.id]: '' }));
                    }}
                    disabled={isSaveInProgress}
                  >
                    {copy?.connectButton ?? 'Enter Shop ID and Secret Key'}
                  </DashboardButton>
                </>
              ) : (
                <div className="payment-settings__form">
                  <DashboardRow
                    label={providerCopy?.shopIdLabel ?? 'Shop ID'}
                    labelFor={`shop-id-${provider.id}`}
                  >
                    <input
                      type="text"
                      id={`shop-id-${provider.id}`}
                      className="dashboard-form-input"
                      value={localShopId[provider.id] || ''}
                      onChange={(event) =>
                        setLocalShopId((prev) => ({ ...prev, [provider.id]: event.target.value }))
                      }
                      placeholder={providerCopy?.shopIdPlaceholder ?? 'Enter your Shop ID'}
                      disabled={isSaveInProgress}
                    />
                    <small className="payment-settings__form-hint">
                      {providerCopy?.shopIdHint ??
                        'Shop ID is located under Settings → Store in your YooKassa dashboard'}
                    </small>
                  </DashboardRow>

                  <DashboardRow
                    label={providerCopy?.secretKeyLabel ?? 'Secret Key'}
                    labelFor={`secret-key-${provider.id}`}
                  >
                    <input
                      type="password"
                      id={`secret-key-${provider.id}`}
                      className="dashboard-form-input"
                      value={localSecretKey[provider.id] || ''}
                      onChange={(event) =>
                        setLocalSecretKey((prev) => ({
                          ...prev,
                          [provider.id]: event.target.value,
                        }))
                      }
                      placeholder={providerCopy?.secretKeyPlaceholder ?? 'Enter your Secret Key'}
                      disabled={isSaveInProgress}
                    />
                    <small className="payment-settings__form-hint">
                      {providerCopy?.secretKeyHint ??
                        'Issue a Secret Key under Integration → API keys. Important: the key is shown only once — be sure to save it!'}
                    </small>
                  </DashboardRow>

                  <div className="payment-settings__form-actions">
                    <DashboardButton
                      variant="outline"
                      onClick={() => {
                        setShowForm((prev) => ({ ...prev, [provider.id]: false }));
                        setLocalShopId((prev) => ({
                          ...prev,
                          [provider.id]: settings?.shopId || '',
                        }));
                        setLocalSecretKey((prev) => ({ ...prev, [provider.id]: '' }));
                      }}
                      disabled={isSaveInProgress}
                    >
                      {ui?.dashboard?.cancel ?? 'Cancel'}
                    </DashboardButton>
                    <DashboardButton
                      variant="primary"
                      className="payment-settings__cta"
                      loading={isThisSaving}
                      onClick={() => {
                        const sid = localShopId[provider.id] || '';
                        const sec = localSecretKey[provider.id] || '';
                        setShopId(sid);
                        setSecretKey(sec);
                        void handleConnect(provider.id, sid, sec);
                      }}
                      disabled={
                        isSaveInProgress ||
                        !localShopId[provider.id]?.trim() ||
                        !localSecretKey[provider.id]?.trim()
                      }
                    >
                      {isThisSaving
                        ? (copy?.connecting ?? 'Connecting...')
                        : (copy?.connect ?? 'Connect')}
                    </DashboardButton>
                  </div>
                </div>
              )}
            </>
          )}
        </DashboardCard>
      </DashboardSection>
    );
  };

  if (loading) {
    return (
      <div className="payment-settings">
        <div className="payment-settings__loading">{copy?.loading ?? 'Loading...'}</div>
      </div>
    );
  }

  return (
    <div className="payment-settings" aria-busy={isSaveInProgress}>
      {error ? (
        <div className="payment-settings__error" role="alert">
          <strong>{copy?.errorLabel ?? 'Error:'}</strong> {error}
        </div>
      ) : null}

      {success ? (
        <div className="payment-settings__success" role="alert">
          {success}
        </div>
      ) : null}

      {PAYMENT_PROVIDERS.map(renderProviderSection)}
    </div>
  );
}
