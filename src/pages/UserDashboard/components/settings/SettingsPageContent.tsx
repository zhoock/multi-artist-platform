import React, { useCallback, useState } from 'react';
import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import clsx from 'clsx';
import { ChangeEmailModal } from '@features/auth/ui/ChangeEmailModal';
import { refreshAuthSession, resendVerificationEmail } from '@shared/lib/auth';
import { isProfileAvatarPlaceholderUrl } from '@shared/lib/avatarUpload';
import {
  resolveVerificationEmailSend,
  useEmailVerificationCopy,
  useResendCooldown,
} from '@shared/lib/emailVerification';
import {
  DashboardButton,
  DashboardCard,
  DashboardRow,
  DashboardRowInlineError,
  DashboardRowValue,
  DashboardRowValueWrap,
  DashboardSection,
} from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { StatusBadge } from '@shared/ui/statusBadge';
import { SettingsSelect } from '../modals/settings/SettingsSelect';
import { HeaderImagesUpload } from '../upload/HeaderImagesUpload';
import { ChangePasswordModal } from './ChangePasswordModal';
import { useSettingsPage } from './useSettingsPage';
import './SettingsPageContent.style.scss';

type SettingsPageContentProps = {
  enabled: boolean;
  userName?: string;
  userEmail?: string;
  emailVerified: boolean;
  isListener: boolean;
  isArtistPagePublic: boolean;
  profilePublicSlug?: string | null;
  onOpenArtistPage: () => void;
  onDeleteAccount: () => void;
  onUpgradeToArtist: () => void;
  onLogout: () => void;
  avatarSrc: string;
  avatarRetinaSrc?: string;
  isUploadingAvatar: boolean;
  avatarInputRef: React.RefObject<HTMLInputElement>;
  onAvatarUploadClick: () => void;
  onAvatarChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onAvatarRemove: () => void;
  getProfileAvatarInitials: () => string;
};

export function SettingsPageContent({
  enabled,
  userName,
  userEmail,
  emailVerified,
  isListener,
  isArtistPagePublic,
  profilePublicSlug,
  onOpenArtistPage,
  onDeleteAccount,
  onUpgradeToArtist,
  onLogout,
  avatarSrc,
  avatarRetinaSrc,
  isUploadingAvatar,
  avatarInputRef,
  onAvatarUploadClick,
  onAvatarChange,
  onAvatarRemove,
  getProfileAvatarInitials,
}: SettingsPageContentProps) {
  const [isChangeEmailOpen, setIsChangeEmailOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isSendingVerificationEmail, setIsSendingVerificationEmail] = useState(false);
  const [verificationEmailError, setVerificationEmailError] = useState<string | null>(null);
  const emailVerificationCopy = useEmailVerificationCopy();
  const { remaining, isCoolingDown, startCooldown } = useResendCooldown();

  const {
    ui,
    currentLang,
    languages,
    genreOptions,
    name,
    setName,
    publicSlug,
    handlePublicSlugChange,
    handlePublicSlugBlur,
    genreCode,
    handleGenreChange,
    aboutText,
    handleAboutChange,
    handleAboutBlur,
    headerImages,
    handleHeaderImagesUpdated,
    handleLanguageChange,
    handleNameBlur,
    isLoadingAboutText,
    isLoadingHeaderImages,
    isBusy,
  } = useSettingsPage({ enabled, userName });

  const d = ui?.dashboard;
  const hasAvatar = !isProfileAvatarPlaceholderUrl(avatarSrc);
  const avatarHint =
    currentLang === 'en' ? 'PNG, JPEG, or WebP up to 2 MB' : 'PNG, JPEG или WebP до 2 МБ';
  const uploadLabel = currentLang === 'en' ? 'Upload image' : 'Загрузить изображение';
  const changeLabel = currentLang === 'en' ? 'Change image' : 'Заменить изображение';
  const removeLabel = d?.removeAvatarPhoto ?? (currentLang === 'en' ? 'Remove' : 'Удалить');
  const verifyEmailLabel = isCoolingDown
    ? `${emailVerificationCopy.resendEmail} (${remaining}s)`
    : emailVerificationCopy.resendEmail;

  const handleVerifyEmail = useCallback(async () => {
    if (isCoolingDown || isSendingVerificationEmail) return;

    setIsSendingVerificationEmail(true);
    setVerificationEmailError(null);

    const result = await resendVerificationEmail();
    setIsSendingVerificationEmail(false);

    const resolution = resolveVerificationEmailSend(result, emailVerificationCopy, startCooldown);
    if (resolution.kind === 'success') {
      return;
    }
    if (resolution.kind === 'already-verified') {
      void refreshAuthSession();
      return;
    }
    setVerificationEmailError(resolution.message);
  }, [emailVerificationCopy, isCoolingDown, isSendingVerificationEmail, startCooldown]);

  return (
    <>
      <div
        className={clsx('user-dashboard__settings-page', {
          'dashboard-save-card--busy': isBusy,
        })}
        aria-busy={isBusy}
      >
        <DashboardSection title={d?.settingsModal?.tabs?.general ?? 'General'}>
          <DashboardCard>
            <DashboardRow label={d?.settingsModal?.fields?.language ?? 'Language'}>
              <SettingsSelect
                value={currentLang}
                options={languages}
                onChange={handleLanguageChange}
              />
            </DashboardRow>
          </DashboardCard>
        </DashboardSection>

        <DashboardSection
          title={d?.publicProfilePreview?.sectionTitle ?? 'Profile'}
          headingExtra={
            !isListener && !isArtistPagePublic ? (
              <StatusBadge variant="private">
                {d?.profileHero?.pagePrivate ?? 'Page is private'}
              </StatusBadge>
            ) : undefined
          }
        >
          <DashboardCard>
            <DashboardRow label={d?.changeAvatar ?? 'Profile Image'} variant="start">
              <div className="user-dashboard__settings-page__avatar-row">
                <div className="user-dashboard__settings-page__avatar">
                  {isProfileAvatarPlaceholderUrl(avatarSrc) ? (
                    <span
                      className="user-dashboard__settings-page__avatar-placeholder"
                      aria-hidden="true"
                    >
                      {getProfileAvatarInitials()}
                    </span>
                  ) : (
                    <img
                      src={avatarSrc}
                      srcSet={avatarRetinaSrc ? `${avatarRetinaSrc} 2x` : undefined}
                      alt={d?.changeAvatar ?? 'Avatar'}
                    />
                  )}
                  {isUploadingAvatar ? (
                    <div
                      className="user-dashboard__settings-page__avatar-loader"
                      aria-live="polite"
                      aria-busy="true"
                    >
                      <div className="user-dashboard__settings-page__avatar-spinner" />
                    </div>
                  ) : null}
                </div>
                <div className="user-dashboard__settings-page__avatar-actions">
                  <DashboardButton
                    variant="outline"
                    onClick={onAvatarUploadClick}
                    disabled={isUploadingAvatar}
                  >
                    {hasAvatar ? changeLabel : uploadLabel}
                  </DashboardButton>
                  {hasAvatar ? (
                    <DashboardButton
                      variant="outline"
                      destructive
                      onClick={() => void onAvatarRemove()}
                      disabled={isUploadingAvatar}
                    >
                      {removeLabel}
                    </DashboardButton>
                  ) : null}
                </div>
                <p className="user-dashboard__settings-page__avatar-hint">{avatarHint}</p>
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="user-dashboard__settings-page__hidden-input"
                onChange={onAvatarChange}
              />
            </DashboardRow>

            <DashboardRow
              label={d?.settingsModal?.fields?.bandName ?? 'Band Name'}
              labelFor="settings-band-name"
            >
              <input
                id="settings-band-name"
                type="text"
                className="dashboard-form-input"
                placeholder={
                  d?.settingsModal?.placeholders?.bandName ?? 'Enter the name of your band'
                }
                value={name}
                onChange={(event) => setName(event.target.value)}
                onBlur={handleNameBlur}
              />
            </DashboardRow>

            <DashboardRow
              label={d?.settingsModal?.fields?.primaryGenre ?? 'Primary genre'}
              labelFor="settings-primary-genre"
            >
              <SettingsSelect
                id="settings-primary-genre"
                value={genreCode}
                options={genreOptions}
                onChange={handleGenreChange}
              />
            </DashboardRow>

            <DashboardRow
              label={d?.publicProfilePreview?.publicUrl ?? 'Public URL (slug)'}
              labelFor="settings-public-slug"
            >
              <div className="user-dashboard__settings-page__slug-control">
                <input
                  id="settings-public-slug"
                  type="text"
                  className="dashboard-form-input"
                  placeholder="my-band"
                  value={publicSlug}
                  onChange={(event) => handlePublicSlugChange(event.target.value)}
                  onBlur={handlePublicSlugBlur}
                />
                <DashboardButton
                  variant="icon"
                  onClick={onOpenArtistPage}
                  disabled={!profilePublicSlug}
                  aria-label={d?.profileHero?.openArtistPage ?? 'Open artist page'}
                >
                  <ExternalLinkIcon {...dashboardActionIconProps({ size: 18 })} />
                </DashboardButton>
              </div>
            </DashboardRow>

            <DashboardRow
              label={d?.settingsModal?.fields?.aboutBand ?? 'About the Band'}
              labelFor="settings-about-band"
              variant="start"
            >
              {isLoadingAboutText ? (
                <div className="dashboard-form-loading">
                  {d?.loading ?? d?.uploading ?? 'Loading…'}
                </div>
              ) : (
                <textarea
                  id="settings-about-band"
                  className="dashboard-form-textarea"
                  placeholder={
                    d?.settingsModal?.placeholders?.aboutBand ??
                    'Enter band description. Each line will be a separate paragraph.'
                  }
                  value={aboutText}
                  onChange={(event) => handleAboutChange(event.target.value)}
                  onBlur={handleAboutBlur}
                  rows={6}
                />
              )}
            </DashboardRow>
          </DashboardCard>
        </DashboardSection>

        <DashboardSection title={d?.settingsModal?.fields?.headerImages ?? 'Header Images'}>
          <DashboardCard>
            <div className="user-dashboard__settings-page__header-images">
              {isLoadingHeaderImages ? (
                <div className="dashboard-form-loading">
                  {d?.loading ?? d?.uploading ?? 'Loading…'}
                </div>
              ) : (
                <HeaderImagesUpload
                  layout="inline"
                  currentImages={headerImages}
                  onImagesUpdated={handleHeaderImagesUpdated}
                />
              )}
            </div>
          </DashboardCard>
        </DashboardSection>

        <DashboardSection
          title={d?.accountSectionTitle ?? 'Account'}
          className="user-dashboard__account-section"
        >
          <DashboardCard>
            <DashboardRow
              label={d?.profileFields?.email ?? d?.settingsModal?.fields?.email ?? 'Email'}
              variant="action"
              action={
                emailVerified ? (
                  <DashboardButton variant="outline" onClick={() => setIsChangeEmailOpen(true)}>
                    {emailVerificationCopy.changeEmail}
                  </DashboardButton>
                ) : (
                  <DashboardButton
                    variant="outline"
                    onClick={() => void handleVerifyEmail()}
                    disabled={isSendingVerificationEmail || isCoolingDown}
                  >
                    {isSendingVerificationEmail
                      ? emailVerificationCopy.submitting
                      : verifyEmailLabel}
                  </DashboardButton>
                )
              }
            >
              <DashboardRowValueWrap>
                <DashboardRowValue>{userEmail?.trim() || '—'}</DashboardRowValue>
                {!emailVerified ? (
                  <StatusBadge variant="notVerified">
                    {d?.profileFields?.emailVerification?.notVerified ?? 'Email not verified'}
                  </StatusBadge>
                ) : null}
                {verificationEmailError ? (
                  <DashboardRowInlineError>{verificationEmailError}</DashboardRowInlineError>
                ) : null}
              </DashboardRowValueWrap>
            </DashboardRow>
          </DashboardCard>
        </DashboardSection>

        {isListener ? (
          <p className="user-dashboard__settings-page__upgrade">
            <span>{d?.becomeArtistLead ?? 'Want to publish music?'}</span>{' '}
            <button
              type="button"
              className="user-dashboard__settings-page__upgrade-link"
              onClick={onUpgradeToArtist}
            >
              {d?.becomeArtist ?? 'Upgrade to artist account'}
            </button>
          </p>
        ) : null}

        <DashboardSection title={d?.settingsModal?.tabs?.security ?? 'Security'}>
          <DashboardCard>
            <DashboardRow
              label={currentLang === 'en' ? 'Password' : 'Пароль'}
              variant="action"
              action={
                <DashboardButton variant="outline" onClick={() => setIsChangePasswordOpen(true)}>
                  {d?.settingsModal?.buttons?.changePassword ?? 'Change password'}
                </DashboardButton>
              }
            >
              <DashboardRowValue
                className="user-dashboard__settings-page__password-mask"
                aria-hidden="true"
              >
                ••••••••••••••••
              </DashboardRowValue>
            </DashboardRow>
          </DashboardCard>
        </DashboardSection>

        <DashboardSection title={currentLang === 'en' ? 'More' : 'Ещё'}>
          <DashboardCard>
            <DashboardRow
              label={d?.logout ?? 'Log Out'}
              variant="action"
              action={
                <DashboardButton variant="outline" onClick={onLogout}>
                  {d?.logout ?? 'Log Out'}
                </DashboardButton>
              }
            >
              <DashboardRowValue aria-hidden="true" />
            </DashboardRow>
            <DashboardRow
              label={d?.deleteAccount ?? 'Delete Account'}
              variant="action"
              action={
                <DashboardButton variant="outline" destructive onClick={onDeleteAccount}>
                  {currentLang === 'en' ? 'Delete' : 'Удалить'}
                </DashboardButton>
              }
            >
              <DashboardRowValue aria-hidden="true" />
            </DashboardRow>
          </DashboardCard>
        </DashboardSection>
      </div>

      <ChangeEmailModal
        isOpen={isChangeEmailOpen}
        onClose={() => setIsChangeEmailOpen(false)}
        onBack={() => setIsChangeEmailOpen(false)}
      />

      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </>
  );
}
