import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { useLang } from '@app/providers/lang';
import { getToken } from '@shared/lib/auth';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import {
  DashboardCard,
  DashboardLoadingState,
  DashboardRow,
  DashboardSection,
} from '@shared/ui/dashboard';
import {
  EMPTY_SOCIAL_LINKS_FORM,
  normalizeSocialLinksForSave,
  parseSocialLinksFromApi,
  SOCIAL_PLATFORMS,
  socialLinksFormStatesEqual,
  socialLinksToFormState,
  type SocialLinksFormState,
  type SocialPlatform,
} from '@shared/constants/socialLinks';
import { notifyPublicSurfaceChanged } from '@shared/lib/publicSurfaceSync';
import './SocialLinksContent.scss';

interface SocialLinksContentProps {
  active: boolean;
  onMountPinChange?: (pinned: boolean) => void;
  onNotAuthorized?: () => void;
  onSaveError?: (message: string) => void;
}

const PLATFORM_ICON_CLASS: Record<SocialPlatform, string> = {
  instagram: 'icon-instagram',
  facebook: 'icon-facebook',
  youtube: 'icon-youtube',
  vk: 'icon-vk',
};

export function SocialLinksContent({
  active,
  onMountPinChange,
  onNotAuthorized,
  onSaveError,
}: SocialLinksContentProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const copy = ui?.dashboard?.socialLinks;

  const [form, setForm] = useState<SocialLinksFormState>(EMPTY_SOCIAL_LINKS_FORM);
  const [initialForm, setInitialForm] = useState<SocialLinksFormState>(EMPTY_SOCIAL_LINKS_FORM);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const formRef = useRef(form);
  const initialFormRef = useRef(initialForm);
  const isSavingRef = useRef(false);
  const saveSocialLinksRef = useRef<(() => Promise<void>) | undefined>(undefined);

  formRef.current = form;
  initialFormRef.current = initialForm;

  const hasChanges = !socialLinksFormStatesEqual(form, initialForm);
  const sectionTitle = copy?.title ?? 'Social Links';

  useEffect(() => {
    if (!onMountPinChange) return;
    onMountPinChange(hasChanges || isSaving);
  }, [hasChanges, isSaving, onMountPinChange]);

  const loadSocialLinks = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = getToken();
      if (!token) {
        setForm(EMPTY_SOCIAL_LINKS_FORM);
        setInitialForm(EMPTY_SOCIAL_LINKS_FORM);
        return;
      }

      const response = await fetchWithAuthSession('/api/user-profile', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      const nextForm = socialLinksToFormState(
        result.success ? parseSocialLinksFromApi(result.data?.socialLinks) : {}
      );
      setForm(nextForm);
      setInitialForm(nextForm);
    } catch (error) {
      console.error('Failed to load social links:', error);
      setForm(EMPTY_SOCIAL_LINKS_FORM);
      setInitialForm(EMPTY_SOCIAL_LINKS_FORM);
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (active && !hasLoaded) {
      void loadSocialLinks();
    }
  }, [active, hasLoaded, loadSocialLinks]);

  const updateField = (platform: SocialPlatform, value: string) => {
    setForm((current) => ({ ...current, [platform]: value }));
  };

  const saveSocialLinks = useCallback(async () => {
    const current = formRef.current;
    const initial = initialFormRef.current;
    if (socialLinksFormStatesEqual(current, initial) || isSavingRef.current) return;

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const token = getToken();
      if (!token) {
        onNotAuthorized?.();
        return;
      }

      const socialLinks = normalizeSocialLinksForSave(current);
      const response = await fetchWithAuthSession('/api/user-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ socialLinks }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error((errorData as { error?: string })?.error || `HTTP ${response.status}`);
      }

      const savedForm = socialLinksToFormState(socialLinks);
      setForm(savedForm);
      setInitialForm(savedForm);
      notifyPublicSurfaceChanged({ type: 'socialLinksChanged' });
    } catch (error) {
      console.error('Failed to save social links:', error);
      const detail = error instanceof Error ? error.message : 'Unknown error';
      onSaveError?.(`${ui?.dashboard?.error ?? 'Error'}: ${detail}`);
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [onNotAuthorized, onSaveError, ui?.dashboard?.error]);

  saveSocialLinksRef.current = saveSocialLinks;

  const handleFieldBlur = useCallback(() => {
    void saveSocialLinksRef.current?.();
  }, []);

  const handleFieldKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void saveSocialLinksRef.current?.();
    event.currentTarget.blur();
  }, []);

  return (
    <DashboardSection title={sectionTitle}>
      <div className="social-links">
        <DashboardCard aria-busy={isSaving || undefined}>
          {!hasLoaded ? (
            <DashboardLoadingState className="social-links__loading" />
          ) : (
            SOCIAL_PLATFORMS.map((platform) => (
              <DashboardRow
                key={platform}
                label={
                  <span className="social-links__field-label">
                    <span
                      className={`social-links__icon ${PLATFORM_ICON_CLASS[platform]}`}
                      aria-hidden="true"
                    />
                    {copy?.platforms?.[platform] ?? platform}
                  </span>
                }
                labelFor={`social-link-${platform}`}
              >
                <input
                  id={`social-link-${platform}`}
                  type="url"
                  className="dashboard-form-input"
                  value={form[platform]}
                  onChange={(event) => updateField(platform, event.target.value)}
                  onBlur={handleFieldBlur}
                  onKeyDown={handleFieldKeyDown}
                  placeholder={copy?.placeholders?.[platform]}
                  disabled={isLoading}
                  autoComplete="off"
                />
              </DashboardRow>
            ))
          )}
        </DashboardCard>
      </div>
    </DashboardSection>
  );
}
