import clsx from 'clsx';
import React, { useCallback, useEffect, useState } from 'react';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { useLang } from '@app/providers/lang';
import { getToken } from '@shared/lib/auth';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { DashboardButton, DashboardCard, DashboardRow } from '@shared/ui/dashboard';
import '@shared/ui/dashboard-save/dashboard-save.scss';
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
import './SocialLinksContent.scss';

interface SocialLinksContentProps {
  active: boolean;
}

const PLATFORM_ICON_CLASS: Record<SocialPlatform, string> = {
  instagram: 'icon-instagram',
  facebook: 'icon-facebook',
  youtube: 'icon-youtube',
  vk: 'icon-vk',
};

export function SocialLinksContent({ active }: SocialLinksContentProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const copy = ui?.dashboard?.socialLinks;

  const [form, setForm] = useState<SocialLinksFormState>(EMPTY_SOCIAL_LINKS_FORM);
  const [initialForm, setInitialForm] = useState<SocialLinksFormState>(EMPTY_SOCIAL_LINKS_FORM);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const hasChanges = !socialLinksFormStatesEqual(form, initialForm);

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

  const handleCancel = () => {
    setForm(initialForm);
  };

  const handleSave = async () => {
    if (!hasChanges || isSaving) return;

    setIsSaving(true);
    try {
      const token = getToken();
      if (!token) {
        alert(ui?.dashboard?.errorLoading ?? 'Error loading');
        return;
      }

      const socialLinks = normalizeSocialLinksForSave(form);
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
      window.dispatchEvent(new Event('artist:updated'));
    } catch (error) {
      console.error('Failed to save social links:', error);
      alert(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsSaving(false);
    }
  };

  const updateField = (platform: SocialPlatform, value: string) => {
    setForm((current) => ({ ...current, [platform]: value }));
  };

  return (
    <div className="social-links">
      <div className="social-links__scroll">
        <div className="user-dashboard__section">
          <DashboardCard
            className={clsx(isSaving && 'dashboard-save-card--busy')}
            aria-busy={isSaving}
          >
            {SOCIAL_PLATFORMS.map((platform) => (
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
                  placeholder={copy?.placeholders?.[platform]}
                  disabled={isLoading || isSaving}
                  autoComplete="off"
                />
              </DashboardRow>
            ))}
          </DashboardCard>
        </div>
      </div>

      <footer className="dashboard-modal-footer social-links__footer">
        <DashboardButton
          variant="outline"
          onClick={handleCancel}
          disabled={isSaving || !hasChanges}
        >
          {ui?.dashboard?.cancel ?? 'Cancel'}
        </DashboardButton>
        <DashboardButton
          variant="primary"
          className="social-links__cta"
          loading={isSaving}
          onClick={() => void handleSave()}
          disabled={isSaving || isLoading || !hasChanges}
        >
          {isSaving
            ? (ui?.dashboard?.saving ?? ui?.dashboard?.uploading ?? 'Saving...')
            : (ui?.dashboard?.save ?? 'Save')}
        </DashboardButton>
      </footer>
    </div>
  );
}
