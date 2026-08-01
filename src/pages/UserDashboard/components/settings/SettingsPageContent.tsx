import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
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
  DashboardSpinner,
  DashboardLoadingState,
} from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { StatusBadge } from '@shared/ui/statusBadge';
import { SettingsSelect } from '../modals/settings/SettingsSelect';
import { HeaderImagesUpload } from '../upload/HeaderImagesUpload';
import { ChangePasswordModal } from './ChangePasswordModal';
import { useSettingsPage } from './useSettingsPage';
import { getDashboardRowFlashProps, useDashboardRowFlash } from '../../lib/dashboardRowStateFlash';
import './SettingsPageContent.style.scss';

const SETTINGS_HEADER_IMAGES_FLASH_ID = 'settings-header-images-section';
const HEADER_IMAGES_SCROLL_FLASH_DELAY_MS = 650;

function scrollDashboardSectionIntoView(section: HTMLElement): void {
  const scrollContainer = section.closest<HTMLElement>('.user-dashboard__content');
  if (!scrollContainer) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  const containerRect = scrollContainer.getBoundingClientRect();
  const sectionRect = section.getBoundingClientRect();
  const targetTop = scrollContainer.scrollTop + (sectionRect.top - containerRect.top);

  scrollContainer.scrollTo({
    top: Math.max(0, targetTop),
    behavior: 'smooth',
  });
}

type SettingsPageContentProps = {
  enabled: boolean;
  scrollToHeaderImages?: boolean;
  onScrollToHeaderImagesHandled?: () => void;
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
  onNotAuthorized?: () => void;
  onSaveError?: (message: string) => void;
};

export function SettingsPageContent({
  enabled,
  scrollToHeaderImages = false,
  onScrollToHeaderImagesHandled,
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
  onNotAuthorized,
  onSaveError,
}: SettingsPageContentProps) {
  const [isChangeEmailOpen, setIsChangeEmailOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isSendingVerificationEmail, setIsSendingVerificationEmail] = useState(false);
  const [verificationEmailError, setVerificationEmailError] = useState<string | null>(null);
  const headerImagesSectionRef = useRef<HTMLDivElement>(null);
  const { flashes: headerImagesSectionFlashes, flashRow: flashHeaderImagesSection } =
    useDashboardRowFlash();
  const emailVerificationCopy = useEmailVerificationCopy();
  const { remaining, isCoolingDown, startCooldown } = useResendCooldown();

  const {
    ui,
    currentLang,
    languages,
    genreOptions,
    name,
    setName,
    nameError,
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
    hasLoadedOnce,
    isBusy,
  } = useSettingsPage({ enabled, userName, isListener, onNotAuthorized, onSaveError });

  useLayoutEffect(() => {
    if (!scrollToHeaderImages || !enabled || isListener) return;
    if (!hasLoadedOnce || isLoadingHeaderImages) return;

    const section = headerImagesSectionRef.current;
    if (!section) return;

    onScrollToHeaderImagesHandled?.();

    requestAnimationFrame(() => {
      scrollDashboardSectionIntoView(section);
      window.setTimeout(() => {
        flashHeaderImagesSection(SETTINGS_HEADER_IMAGES_FLASH_ID, 'subscribers_only');
      }, HEADER_IMAGES_SCROLL_FLASH_DELAY_MS);
    });
  }, [
    enabled,
    flashHeaderImagesSection,
    hasLoadedOnce,
    isListener,
    isLoadingHeaderImages,
    onScrollToHeaderImagesHandled,
    scrollToHeaderImages,
  ]);

  const headerImagesSectionFlash = getDashboardRowFlashProps(
    SETTINGS_HEADER_IMAGES_FLASH_ID,
    headerImagesSectionFlashes
  );

  const d = ui?.dashboard;
  const hasAvatar = !isProfileAvatarPlaceholderUrl(avatarSrc);
  const avatarHint = d?.avatarFormatsHint ?? 'PNG, JPEG, or WebP up to 2 MB';
  const uploadLabel = d?.uploadAvatarImage ?? 'Upload image';
  const changeLabel = d?.changeAvatarImage ?? 'Change image';
  const removeLabel = d?.removeAvatarPhoto ?? 'Remove photo';
  const displayNameLabel = isListener
    ? (d?.profileFields?.name ?? 'Name')
    : (d?.settingsModal?.fields?.bandName ?? 'Band Name');
  const displayNamePlaceholder = isListener
    ? (d?.profileFields?.namePlaceholder ?? 'Enter your name')
    : (d?.settingsModal?.placeholders?.bandName ?? 'Enter the name of your band');
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

  if (enabled && !hasLoadedOnce) {
    return <DashboardLoadingState className="user-dashboard__tab-loading" />;
  }

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
                      <DashboardSpinner className="user-dashboard__settings-page__avatar-spinner" />
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

            <DashboardRow label={displayNameLabel} labelFor="settings-band-name">
              <input
                id="settings-band-name"
                type="text"
                className="dashboard-form-input"
                placeholder={displayNamePlaceholder}
                value={name}
                onChange={(event) => setName(event.target.value)}
                onBlur={handleNameBlur}
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? 'settings-band-name-error' : undefined}
              />
              {nameError ? (
                <DashboardRowInlineError id="settings-band-name-error">
                  {nameError}
                </DashboardRowInlineError>
              ) : null}
            </DashboardRow>

            {!isListener ? (
              <>
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
                    <div className="dashboard-form-loading" aria-busy="true">
                      <DashboardSpinner />
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
              </>
            ) : null}
          </DashboardCard>
        </DashboardSection>

        {!isListener ? (
          <div
            ref={headerImagesSectionRef}
            className="user-dashboard__settings-page__header-images-section"
          >
            <DashboardSection title={d?.settingsModal?.fields?.headerImages ?? 'Header Images'}>
              <DashboardCard>
                <div
                  className={clsx(
                    'user-dashboard__settings-page__header-images',
                    headerImagesSectionFlash.className
                  )}
                  style={headerImagesSectionFlash.style}
                  data-visibility-flash={headerImagesSectionFlash['data-visibility-flash']}
                >
                  {isLoadingHeaderImages ? (
                    <div className="dashboard-form-loading" aria-busy="true">
                      <DashboardSpinner />
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
          </div>
        ) : null}

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
              label={d?.settingsModal?.fields?.password ?? 'Password'}
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

        <DashboardSection title={d?.dangerZone ?? 'Danger Zone'}>
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
                  {d?.deleteAccountShort ?? 'Delete'}
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
