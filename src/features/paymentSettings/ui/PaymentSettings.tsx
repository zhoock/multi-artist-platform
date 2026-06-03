import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { InfoCircleIcon } from '@shared/ui/icons/InfoCircleIcon';
import { usePaymentSettings } from '../model/usePaymentSettings';
import { PAYMENT_PROVIDERS } from '../lib/constants';
import { fillPaymentSettingsTemplate } from '../lib/fillPaymentSettingsTemplate';
import { DashboardSaveSpinner } from '@shared/ui/dashboard-save/DashboardSaveSpinner';
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

  const renderProviderCard = (provider: (typeof PAYMENT_PROVIDERS)[0]) => {
    const settings = settingsMap[provider.id];
    const isThisSaving = saving === provider.id;
    const isFormOpen = showForm[provider.id];
    const isConnected = Boolean(settings?.isActive);
    const providerCopy = copy?.providers?.[provider.id];

    return (
      <div
        key={provider.id}
        className={`payment-settings__provider-card${isThisSaving ? ' dashboard-save-card--busy' : ''}`}
        aria-busy={isThisSaving}
      >
        {isConnected ? (
          <div className="payment-settings__connected">
            <h3 className="payment-settings__provider-name">{provider.name}</h3>
            <p className="payment-settings__connected-status" role="status">
              ✔ {copy?.connectedStatus ?? 'Connected'}
            </p>
            {settings?.connectedAt ? (
              <p className="payment-settings__connected-meta">
                {fillPaymentSettingsTemplate(copy?.updatedAt ?? 'Updated: {date}', {
                  date: new Date(settings.connectedAt).toLocaleDateString(dateLocale),
                })}
              </p>
            ) : null}
            <p className="payment-settings__connected-lede">
              {copy?.connectedLede ?? 'Fans can now pay for purchases on your site'}
            </p>

            <div className="payment-settings__provider-row">
              <div className="payment-settings__provider-row-info">
                <div className="payment-settings__provider-logo">
                  <PaymentProviderLogo providerId={provider.id} />
                </div>
                <div className="payment-settings__provider-row-text">
                  <span className="payment-settings__provider-row-name">{provider.name}</span>
                  <span className="payment-settings__provider-row-tagline">
                    {providerCopy?.tagline ?? 'Online payment acceptance'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className={`payment-settings__disconnect-button${
                  isThisSaving ? ' payment-settings__disconnect-button--loading' : ''
                }`}
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
              </button>
            </div>

            <p className="payment-settings__disconnect-note">
              <InfoCircleIcon className="payment-settings__disconnect-note-icon" size={18} />
              <span>
                {copy?.disconnectNote ??
                  'If you disconnect YooKassa, payment acceptance will be unavailable. Your payment data will be saved.'}
              </span>
            </p>
          </div>
        ) : (
          <>
            <h3 className="payment-settings__provider-name">{provider.name}</h3>
            <p className="payment-settings__description">
              {providerCopy?.description ??
                'Let people pay for purchases on your site through YooKassa'}
            </p>
            <p className="payment-settings__details">
              {providerCopy?.details ?? 'To receive payments you need a YooKassa business account.'}
            </p>

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
                    <a
                      href="https://yookassa.ru/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="payment-settings__link"
                    >
                      {providerCopy?.registerLink ?? 'Go to YooKassa to sign up →'}
                    </a>
                  </p>
                </div>
                <button
                  type="button"
                  className="payment-settings__connect-button"
                  onClick={() => {
                    setShowForm((prev) => ({ ...prev, [provider.id]: true }));
                    setActiveProvider(provider.id);
                    setLocalShopId((prev) => ({ ...prev, [provider.id]: settings?.shopId || '' }));
                    setLocalSecretKey((prev) => ({ ...prev, [provider.id]: '' }));
                  }}
                  disabled={isSaveInProgress}
                >
                  {copy?.connectButton ?? 'Enter Shop ID and Secret Key'}
                </button>
              </>
            ) : (
              <div className="payment-settings__form">
                <div className="payment-settings__form-field">
                  <label
                    htmlFor={`shop-id-${provider.id}`}
                    className="payment-settings__form-label"
                  >
                    {providerCopy?.shopIdLabel ?? 'Shop ID'}
                  </label>
                  <input
                    type="text"
                    id={`shop-id-${provider.id}`}
                    className="payment-settings__form-input"
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
                </div>

                <div className="payment-settings__form-field">
                  <label
                    htmlFor={`secret-key-${provider.id}`}
                    className="payment-settings__form-label"
                  >
                    {providerCopy?.secretKeyLabel ?? 'Secret Key'}
                  </label>
                  <input
                    type="password"
                    id={`secret-key-${provider.id}`}
                    className="payment-settings__form-input"
                    value={localSecretKey[provider.id] || ''}
                    onChange={(event) =>
                      setLocalSecretKey((prev) => ({ ...prev, [provider.id]: event.target.value }))
                    }
                    placeholder={providerCopy?.secretKeyPlaceholder ?? 'Enter your Secret Key'}
                    disabled={isSaveInProgress}
                  />
                  <small className="payment-settings__form-hint">
                    {providerCopy?.secretKeyHint ??
                      'Issue a Secret Key under Integration → API keys. Important: the key is shown only once — be sure to save it!'}
                  </small>
                </div>

                <div className="payment-settings__form-actions">
                  <button
                    type="button"
                    className="payment-settings__cancel-button"
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
                  </button>
                  <button
                    type="button"
                    className={`payment-settings__save-button${
                      isThisSaving ? ' payment-settings__save-button--loading' : ''
                    }`}
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
                    {isThisSaving ? (
                      <>
                        <DashboardSaveSpinner />
                        {copy?.connecting ?? 'Connecting...'}
                      </>
                    ) : (
                      (copy?.connect ?? 'Connect')
                    )}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
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

      <div className="payment-settings__providers-list">
        {PAYMENT_PROVIDERS.map(renderProviderCard)}
      </div>
    </div>
  );
}
