import React, { useState } from 'react';
import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import clsx from 'clsx';
import { ChangeEmailModal } from '@features/auth/ui/ChangeEmailModal';
import { isProfileAvatarPlaceholderUrl } from '@shared/lib/avatarUpload';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { SettingsSelect } from '../modals/settings/SettingsSelect';
import { SettingsEmailVerificationStatus } from '../SettingsEmailVerificationStatus';
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

  return (
    <>
      <div
        className={clsx('user-dashboard__settings-page', {
          'dashboard-save-card--busy': isBusy,
        })}
        aria-busy={isBusy}
      >
        <section className="user-dashboard__profile-block">
          <h4 className="user-dashboard__profile-block-heading user-dashboard__profile-block-heading--accent">
            {d?.settingsModal?.tabs?.general ?? 'General'}
          </h4>
          <div className="user-dashboard__settings-page__card">
            <div className="user-dashboard__settings-page__row">
              <p className="user-dashboard__settings-page__row-label">
                {d?.settingsModal?.fields?.language ?? 'Language'}
              </p>
              <div className="user-dashboard__settings-page__row-control">
                <SettingsSelect
                  value={currentLang}
                  options={languages}
                  onChange={handleLanguageChange}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="user-dashboard__profile-block">
          <h4 className="user-dashboard__profile-block-heading user-dashboard__profile-block-heading--accent">
            {d?.publicProfilePreview?.sectionTitle ?? 'Public Profile'}
          </h4>
          <div className="user-dashboard__settings-page__card">
            <div className="user-dashboard__settings-page__row user-dashboard__settings-page__row--start">
              <p className="user-dashboard__settings-page__row-label">
                {d?.changeAvatar ?? 'Profile Image'}
              </p>
              <div className="user-dashboard__settings-page__row-control">
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
                    <button
                      type="button"
                      className="user-dashboard__settings-page__avatar-upload"
                      onClick={onAvatarUploadClick}
                      disabled={isUploadingAvatar}
                    >
                      {hasAvatar ? changeLabel : uploadLabel}
                    </button>
                    {hasAvatar ? (
                      <button
                        type="button"
                        className="user-dashboard__settings-page__avatar-remove"
                        onClick={() => void onAvatarRemove()}
                        disabled={isUploadingAvatar}
                      >
                        {removeLabel}
                      </button>
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
              </div>
            </div>

            <div className="user-dashboard__settings-page__row">
              <label
                htmlFor="settings-band-name"
                className="user-dashboard__settings-page__row-label"
              >
                {d?.settingsModal?.fields?.bandName ?? 'Band Name'}
              </label>
              <div className="user-dashboard__settings-page__row-control">
                <input
                  id="settings-band-name"
                  type="text"
                  className="settings-modal__input"
                  placeholder={
                    d?.settingsModal?.placeholders?.bandName ?? 'Enter the name of your band'
                  }
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onBlur={handleNameBlur}
                />
              </div>
            </div>

            <div className="user-dashboard__settings-page__row">
              <label
                htmlFor="settings-primary-genre"
                className="user-dashboard__settings-page__row-label"
              >
                {d?.settingsModal?.fields?.primaryGenre ?? 'Primary genre'}
              </label>
              <div className="user-dashboard__settings-page__row-control">
                <SettingsSelect
                  id="settings-primary-genre"
                  value={genreCode}
                  options={genreOptions}
                  onChange={handleGenreChange}
                />
              </div>
            </div>

            <div className="user-dashboard__settings-page__row">
              <label
                htmlFor="settings-public-slug"
                className="user-dashboard__settings-page__row-label"
              >
                {d?.publicProfilePreview?.publicUrl ?? 'Public URL (slug)'}
              </label>
              <div className="user-dashboard__settings-page__row-control">
                <div className="user-dashboard__settings-page__slug-control">
                  <input
                    id="settings-public-slug"
                    type="text"
                    className="settings-modal__input"
                    placeholder="my-band"
                    value={publicSlug}
                    onChange={(event) => handlePublicSlugChange(event.target.value)}
                    onBlur={handlePublicSlugBlur}
                  />
                  <button
                    type="button"
                    className="user-dashboard__settings-page__slug-open"
                    onClick={onOpenArtistPage}
                    disabled={!profilePublicSlug}
                    aria-label={d?.profileHero?.openArtistPage ?? 'Open artist page'}
                    title={d?.profileHero?.openArtistPage ?? 'Open artist page'}
                  >
                    <ExternalLinkIcon {...dashboardActionIconProps({ size: 18 })} />
                  </button>
                </div>
              </div>
            </div>

            <div className="user-dashboard__settings-page__row user-dashboard__settings-page__row--start">
              <label
                htmlFor="settings-about-band"
                className="user-dashboard__settings-page__row-label"
              >
                {d?.settingsModal?.fields?.aboutBand ?? 'About the Band'}
              </label>
              <div className="user-dashboard__settings-page__row-control">
                {isLoadingAboutText ? (
                  <div className="settings-modal__loading">
                    {d?.loading ?? d?.uploading ?? 'Loading…'}
                  </div>
                ) : (
                  <textarea
                    id="settings-about-band"
                    className="settings-modal__textarea"
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
              </div>
            </div>
          </div>
        </section>

        <section className="user-dashboard__profile-block">
          <h4 className="user-dashboard__profile-block-heading user-dashboard__profile-block-heading--accent">
            {d?.settingsModal?.fields?.headerImages ?? 'Header Images'}
          </h4>
          <div className="user-dashboard__settings-page__card">
            <div className="user-dashboard__settings-page__header-images">
              {isLoadingHeaderImages ? (
                <div className="settings-modal__loading">
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
          </div>
        </section>

        <section className="user-dashboard__profile-block user-dashboard__account-section">
          <h4 className="user-dashboard__profile-block-heading user-dashboard__profile-block-heading--accent">
            {d?.accountSectionTitle ?? 'Account'}
          </h4>
          <div className="user-dashboard__settings-page__card">
            <div className="user-dashboard__settings-page__row user-dashboard__settings-page__row--action">
              <p className="user-dashboard__settings-page__row-label">
                {d?.profileFields?.email ?? d?.settingsModal?.fields?.email ?? 'Email'}
              </p>
              <p className="user-dashboard__settings-page__row-value">{userEmail?.trim() || '—'}</p>
              <button
                type="button"
                className="user-dashboard__settings-page__row-action"
                onClick={() => setIsChangeEmailOpen(true)}
              >
                {ui?.auth?.emailVerification?.changeEmail ?? 'Change email'}
              </button>
            </div>
            <div className="user-dashboard__account-verification">
              <SettingsEmailVerificationStatus verified={emailVerified} />
            </div>
          </div>
        </section>

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

        <section className="user-dashboard__profile-block">
          <h4 className="user-dashboard__profile-block-heading user-dashboard__profile-block-heading--accent">
            {d?.settingsModal?.tabs?.security ?? 'Security'}
          </h4>
          <div className="user-dashboard__settings-page__card">
            <div className="user-dashboard__settings-page__row user-dashboard__settings-page__row--action">
              <p className="user-dashboard__settings-page__row-label">
                {currentLang === 'en' ? 'Password' : 'Пароль'}
              </p>
              <p
                className="user-dashboard__settings-page__row-value user-dashboard__settings-page__password-mask"
                aria-hidden="true"
              >
                ••••••••••••••••
              </p>
              <button
                type="button"
                className="user-dashboard__settings-page__row-action"
                onClick={() => setIsChangePasswordOpen(true)}
              >
                {d?.settingsModal?.buttons?.changePassword ?? 'Change password'}
              </button>
            </div>
          </div>
        </section>

        <section className="user-dashboard__profile-block">
          <h4 className="user-dashboard__profile-block-heading user-dashboard__profile-block-heading--accent">
            {currentLang === 'en' ? 'More' : 'Ещё'}
          </h4>
          <div className="user-dashboard__settings-page__card">
            <div className="user-dashboard__settings-page__row user-dashboard__settings-page__row--action">
              <p className="user-dashboard__settings-page__row-label">{d?.logout ?? 'Log Out'}</p>
              <span className="user-dashboard__settings-page__row-value" aria-hidden="true" />
              <button
                type="button"
                className="user-dashboard__settings-page__row-action"
                onClick={onLogout}
              >
                {d?.logout ?? 'Log Out'}
              </button>
            </div>
            <div className="user-dashboard__settings-page__row user-dashboard__settings-page__row--action">
              <p className="user-dashboard__settings-page__row-label">
                {d?.deleteAccount ?? 'Delete Account'}
              </p>
              <span className="user-dashboard__settings-page__row-value" aria-hidden="true" />
              <button
                type="button"
                className="user-dashboard__settings-page__row-action user-dashboard__settings-page__row-action--destructive"
                onClick={onDeleteAccount}
              >
                {currentLang === 'en' ? 'Delete' : 'Удалить'}
              </button>
            </div>
          </div>
        </section>
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
