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
import { usePaymentSettings } from '../model/usePaymentSettings';
import { PAYMENT_PROVIDERS } from '../lib/constants';
import '@shared/ui/dashboard-save/dashboard-save.scss';
import './PaymentSettings.style.scss';

interface PaymentSettingsProps {
  userId: string;
}

function PaymentProviderLogo({
  srcLight,
  srcDark,
  alt,
}: {
  srcLight: string;
  srcDark: string;
  alt: string;
}) {
  return (
    <>
      <img
        className="payment-settings__provider-logo-img payment-settings__provider-logo-img--light"
        src={srcLight}
        alt={alt}
        width={96}
        height={32}
        loading="lazy"
        decoding="async"
      />
      <img
        className="payment-settings__provider-logo-img payment-settings__provider-logo-img--dark"
        src={srcDark}
        alt=""
        aria-hidden
        width={96}
        height={32}
        loading="lazy"
        decoding="async"
      />
    </>
  );
}

type ProviderRowLabelProps = {
  providerName: string;
  providerLogoSrcLight: string;
  providerLogoSrcDark: string;
};

function ProviderRowLabel({
  providerName,
  providerLogoSrcLight,
  providerLogoSrcDark,
}: ProviderRowLabelProps) {
  return (
    <div className="dashboard-row__label payment-settings__provider-row-label">
      <div className="payment-settings__provider-logo">
        <PaymentProviderLogo
          srcLight={providerLogoSrcLight}
          srcDark={providerLogoSrcDark}
          alt={providerName}
        />
      </div>
    </div>
  );
}

export function PaymentSettings({ userId }: PaymentSettingsProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const copy = ui?.dashboard?.paymentSettings;

  const {
    settingsMap,
    loading,
    saving,
    error,
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
      <DashboardSection key={provider.id} title={provider.name}>
        <DashboardCard
          className={clsx(isThisSaving && 'dashboard-save-card--busy')}
          aria-busy={isThisSaving}
        >
          {isConnected ? (
            <>
              <DashboardRow
                variant="action"
                className="payment-settings__provider-row"
                label={
                  <ProviderRowLabel
                    providerName={provider.name}
                    providerLogoSrcLight={provider.logoSrcLight}
                    providerLogoSrcDark={provider.logoSrcDark}
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
                {null}
              </DashboardRow>

              <p className="payment-settings__disconnect-note">
                {copy?.disconnectNote ?? 'Payments will stop after disconnecting.'}
              </p>
            </>
          ) : (
            <>
              <div className="payment-settings__intro">
                <DashboardRowValue>
                  {providerCopy?.description ?? 'Connect YooKassa to accept payments on your site.'}
                </DashboardRowValue>
              </div>

              {!isFormOpen ? (
                <>
                  <div className="payment-settings__instructions">
                    <p>{providerCopy?.instructionsIntro ?? 'To connect:'}</p>
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

      {PAYMENT_PROVIDERS.map(renderProviderSection)}
    </div>
  );
}
