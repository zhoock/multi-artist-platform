import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mail as MailIcon } from 'lucide-react';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { useLang } from '@app/providers/lang';
import { getToken } from '@shared/lib/auth';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { SETTINGS_MANAGER_CONTACTS_SECTION_ID } from '@shared/constants/settingsManagerContactsSection';
import {
  formatManagerTelegramForSettingsDisplay,
  normalizeManagerTelegramForStorage,
} from '@shared/lib/parseTelegramFromSocialLinks';
import { notifyPublicSurfaceChanged } from '@shared/lib/publicSurfaceSync';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import {
  DashboardCard,
  DashboardLoadingState,
  DashboardRow,
  DashboardSection,
} from '@shared/ui/dashboard';
import { TelegramBrandIcon } from '@features/artistContactManager/ui/TelegramBrandIcon';
import '../social/SocialLinksContent.scss';
import './ManagerContactsContent.scss';

type ManagerContactsFormState = {
  managerEmail: string;
  telegram: string;
};

const EMPTY_FORM: ManagerContactsFormState = {
  managerEmail: '',
  telegram: '',
};

function formsEqual(a: ManagerContactsFormState, b: ManagerContactsFormState): boolean {
  return a.managerEmail === b.managerEmail && a.telegram === b.telegram;
}

type ManagerContactsContentProps = {
  active: boolean;
  onMountPinChange?: (pinned: boolean) => void;
  onNotAuthorized?: () => void;
  onSaveError?: (message: string) => void;
  sectionRef?: React.RefObject<HTMLDivElement>;
};

export function ManagerContactsContent({
  active,
  onMountPinChange,
  onNotAuthorized,
  onSaveError,
  sectionRef,
}: ManagerContactsContentProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const copy = ui?.dashboard?.managerContacts;

  const [form, setForm] = useState<ManagerContactsFormState>(EMPTY_FORM);
  const [initialForm, setInitialForm] = useState<ManagerContactsFormState>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const formRef = useRef(form);
  const initialFormRef = useRef(initialForm);
  const isSavingRef = useRef(false);
  const saveRef = useRef<(() => Promise<void>) | undefined>(undefined);

  formRef.current = form;
  initialFormRef.current = initialForm;

  const hasChanges = !formsEqual(form, initialForm);
  const sectionTitle = copy?.title ?? 'Manager Contacts';

  useEffect(() => {
    if (!onMountPinChange) return;
    onMountPinChange(hasChanges || isSaving);
  }, [hasChanges, isSaving, onMountPinChange]);

  const loadManagerContacts = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = getToken();
      if (!token) {
        setForm(EMPTY_FORM);
        setInitialForm(EMPTY_FORM);
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
      const data = result?.data;
      const nextForm: ManagerContactsFormState = {
        managerEmail: typeof data?.managerEmail === 'string' ? data.managerEmail.trim() : '',
        telegram:
          typeof data?.managerTelegramUrl === 'string' && data.managerTelegramUrl.trim()
            ? formatManagerTelegramForSettingsDisplay(data.managerTelegramUrl)
            : '',
      };
      setForm(nextForm);
      setInitialForm(nextForm);
    } catch (error) {
      console.error('Failed to load manager contacts:', error);
      setForm(EMPTY_FORM);
      setInitialForm(EMPTY_FORM);
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (active && !hasLoaded) {
      void loadManagerContacts();
    }
  }, [active, hasLoaded, loadManagerContacts]);

  const saveManagerContacts = useCallback(async () => {
    const current = formRef.current;
    const initial = initialFormRef.current;
    if (formsEqual(current, initial) || isSavingRef.current) return;

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const token = getToken();
      if (!token) {
        onNotAuthorized?.();
        return;
      }

      const telegramInput = current.telegram.trim();
      const canonicalTelegram = telegramInput
        ? normalizeManagerTelegramForStorage(telegramInput)
        : null;
      if (telegramInput && !canonicalTelegram) {
        onSaveError?.(`${ui?.dashboard?.error ?? 'Error'}: Invalid Telegram username or URL`);
        return;
      }

      const response = await fetchWithAuthSession('/api/user-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          socialLinks: {
            managerEmail: current.managerEmail.trim(),
            telegram: canonicalTelegram ?? '',
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error((errorData as { error?: string })?.error || `HTTP ${response.status}`);
      }

      const saved: ManagerContactsFormState = {
        managerEmail: current.managerEmail.trim(),
        telegram: canonicalTelegram
          ? formatManagerTelegramForSettingsDisplay(canonicalTelegram)
          : '',
      };
      setForm(saved);
      setInitialForm(saved);
      notifyPublicSurfaceChanged({ type: 'socialLinksChanged' });
      window.dispatchEvent(new Event('artist:updated'));
    } catch (error) {
      console.error('Failed to save manager contacts:', error);
      const detail = error instanceof Error ? error.message : 'Unknown error';
      onSaveError?.(`${ui?.dashboard?.error ?? 'Error'}: ${detail}`);
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [onNotAuthorized, onSaveError, ui?.dashboard?.error]);

  saveRef.current = saveManagerContacts;

  const handleFieldBlur = useCallback(() => {
    if (!hasLoaded) return;
    void saveRef.current?.();
  }, [hasLoaded]);

  const handleFieldKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (!hasLoaded || event.key !== 'Enter') return;
      event.preventDefault();
      void saveRef.current?.();
      event.currentTarget.blur();
    },
    [hasLoaded]
  );

  return (
    <div
      ref={sectionRef}
      id={SETTINGS_MANAGER_CONTACTS_SECTION_ID}
      className="manager-contacts-section"
    >
      <DashboardSection title={sectionTitle}>
        {copy?.hint ? <p className="manager-contacts-section__hint">{copy.hint}</p> : null}
        <div className="social-links manager-contacts-section__card">
          <DashboardCard aria-busy={isSaving || undefined}>
            {!hasLoaded ? (
              <DashboardLoadingState className="social-links__loading" />
            ) : (
              <>
                <DashboardRow
                  label={
                    <span className="social-links__field-label">
                      <MailIcon
                        className="manager-contacts-section__lucide-icon"
                        {...dashboardActionIconProps({ size: 16 })}
                      />
                      {copy?.fields?.email ?? 'Manager Email'}
                    </span>
                  }
                  labelFor="manager-contact-email"
                >
                  <input
                    id="manager-contact-email"
                    type="email"
                    inputMode="email"
                    className="dashboard-form-input"
                    value={form.managerEmail}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, managerEmail: event.target.value }))
                    }
                    onBlur={handleFieldBlur}
                    onKeyDown={handleFieldKeyDown}
                    placeholder={copy?.placeholders?.email ?? 'manager@example.com'}
                    disabled={isLoading}
                    autoComplete="off"
                  />
                </DashboardRow>
                <DashboardRow
                  label={
                    <span className="social-links__field-label">
                      <TelegramBrandIcon
                        className="manager-contacts-section__telegram-icon"
                        size={16}
                      />
                      {copy?.fields?.telegram ?? 'Manager Telegram'}
                    </span>
                  }
                  labelFor="manager-contact-telegram"
                >
                  <input
                    id="manager-contact-telegram"
                    type="url"
                    className="dashboard-form-input"
                    value={form.telegram}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, telegram: event.target.value }))
                    }
                    onBlur={handleFieldBlur}
                    onKeyDown={handleFieldKeyDown}
                    placeholder={copy?.placeholders?.telegram ?? 'https://t.me/username'}
                    disabled={isLoading}
                    autoComplete="off"
                  />
                </DashboardRow>
              </>
            )}
          </DashboardCard>
        </div>
      </DashboardSection>
    </div>
  );
}
