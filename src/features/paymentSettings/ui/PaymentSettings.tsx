import clsx from 'clsx';
import { useState } from 'react';
import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import type { PaymentProvider } from '@shared/api/payment/types';
import { ConfirmationModal } from '@shared/ui/confirmationModal';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import {
  DashboardButton,
  DashboardCard,
  DashboardRow,
  DashboardSection,
} from '@shared/ui/dashboard';
import { DashboardSaveSpinner } from '@shared/ui/dashboard-save/DashboardSaveSpinner';
import { usePaymentSettings } from '../model/usePaymentSettings';
import { PAYMENT_PROVIDERS } from '../lib/constants';
import { fillPaymentSettingsTemplate } from '../lib/fillPaymentSettingsTemplate';
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

  const [providerToDisconnect, setProviderToDisconnect] = useState<PaymentProvider | null>(null);

  const isSaveInProgress = saving !== null;
  const pendingDisconnectProvider = providerToDisconnect
    ? PAYMENT_PROVIDERS.find((provider) => provider.id === providerToDisconnect)
    : null;

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
                    onClick={() => setProviderToDisconnect(provider.id)}
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
              {!isFormOpen ? (
                <div className="payment-settings__setup">
                  <p className="payment-settings__setup-lede">
                    {providerCopy?.description ??
                      'Connect YooKassa to accept payments on your site.'}
                  </p>

                  <section
                    className="payment-settings__setup-steps"
                    aria-label={providerCopy?.instructionsIntro ?? 'To connect:'}
                  >
                    <h4 className="payment-settings__setup-steps-title">
                      {providerCopy?.instructionsIntro ?? 'To connect:'}
                    </h4>
                    <ol className="payment-settings__setup-steps-list">
                      {(providerCopy?.instructionSteps ?? []).map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </section>

                  <a
                    className="payment-settings__external-link"
                    href="https://yookassa.ru/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLinkIcon {...dashboardActionIconProps({ size: 18 })} />
                    <span>{providerCopy?.registerLink ?? 'Open YooKassa website →'}</span>
                  </a>

                  <DashboardButton
                    variant="outline"
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
                </div>
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
    <>
      <div className="payment-settings" aria-busy={isSaveInProgress}>
        {error ? (
          <div className="payment-settings__error" role="alert">
            <strong>{copy?.errorLabel ?? 'Error:'}</strong> {error}
          </div>
        ) : null}

        {PAYMENT_PROVIDERS.map(renderProviderSection)}
      </div>

      <ConfirmationModal
        isOpen={providerToDisconnect !== null}
        title={ui?.dashboard?.confirmAction ?? 'Confirm action'}
        message={
          pendingDisconnectProvider
            ? fillPaymentSettingsTemplate(
                copy?.disconnectConfirm ??
                  'Are you sure you want to disconnect {provider}? You will no longer be able to accept payments through this provider.',
                { provider: pendingDisconnectProvider.name }
              )
            : ''
        }
        irreversibleHint={null}
        variant="danger"
        confirmText={copy?.disconnect ?? 'Disconnect'}
        cancelText={ui?.dashboard?.cancel ?? 'Cancel'}
        closeLabel={ui?.dashboard?.close ?? 'Close'}
        onCancel={() => {
          if (!isSaveInProgress) {
            setProviderToDisconnect(null);
          }
        }}
        onConfirm={() => {
          if (!providerToDisconnect) return;
          const provider = providerToDisconnect;
          setProviderToDisconnect(null);
          void handleDisconnect(provider);
        }}
      />
    </>
  );
}
