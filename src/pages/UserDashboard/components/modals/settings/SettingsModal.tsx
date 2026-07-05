// src/pages/UserDashboard/components/SettingsModal.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useCloseWithUnsavedConfirmation } from '@shared/lib/hooks/useCloseWithUnsavedConfirmation';
import { Popup } from '@shared/ui/popup';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { getUser, getToken, updateStoredUserName } from '@shared/lib/auth';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import {
  loadTheBandFromDatabase,
  saveTheBandToDatabase,
  loadHeaderImagesFromDatabase,
  saveHeaderImagesToDatabase,
} from '@entities/user/lib';
import { HeaderImagesUpload } from '../../upload/HeaderImagesUpload';
import { GENRE_OPTIONS } from '../album/EditAlbumModal.constants';
import { DashboardSaveSpinner } from '@shared/ui/dashboard-save/DashboardSaveSpinner';
import '@shared/ui/dashboard-save/dashboard-save.scss';
import {
  InlineEditDiscardDialog,
  getCloseDiscardConfirmLabels,
} from '../../shared/EditableCardField';
import { SettingsEmailVerificationStatus } from '../../SettingsEmailVerificationStatus';
import { SettingsSelect } from './SettingsSelect';
import { Eye as EyeIcon, EyeOff as EyeOffIcon } from 'lucide-react';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import './SettingsModal.style.scss';

function PasswordVisibilityIcon({ visible }: { visible: boolean }) {
  const Icon = visible ? EyeIcon : EyeOffIcon;

  return (
    <Icon
      {...dashboardActionIconProps({
        size: 20,
        className: 'settings-modal__password-toggle-icon',
      })}
    />
  );
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
  userEmail?: string;
  emailVerified?: boolean;
  initialTab?: TabType;
  showBecomeArtist?: boolean;
  onBecomeArtist?: () => void;
}

type TabType = 'general' | 'profile' | 'security';

const SECURITY_FORM_ID = 'security-form';

type PasswordFieldKey = 'currentPassword' | 'newPassword' | 'confirmPassword';
type PasswordFieldErrors = Partial<Record<PasswordFieldKey, string>>;

export function SettingsModal({
  isOpen,
  onClose,
  userName = 'Site Owner',
  userEmail = '',
  emailVerified = false,
  initialTab = 'general',
  showBecomeArtist = false,
  onBecomeArtist,
}: SettingsModalProps) {
  const { lang: currentLang, setLang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, currentLang));
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const [name, setName] = useState(userName);
  const [publicSlug, setPublicSlug] = useState('');
  const [selectedLang, setSelectedLang] = useState<'ru' | 'en'>(currentLang || 'ru');
  const [headerImages, setHeaderImages] = useState<string[]>([]);
  const [initialHeaderImages, setInitialHeaderImages] = useState<string[]>([]);
  const [genreCode, setGenreCode] = useState<string>('other');
  const [initialGenreCode, setInitialGenreCode] = useState<string>('other');
  const [isLoadingHeaderImages, setIsLoadingHeaderImages] = useState(false);
  const [aboutTextRu, setAboutTextRu] = useState<string>('');
  const [aboutTextEn, setAboutTextEn] = useState<string>('');
  const [aboutText, setAboutText] = useState<string>(''); // Текущий текст для выбранного языка
  const [isLoadingAboutText, setIsLoadingAboutText] = useState(false);
  const [isSavingAboutText, setIsSavingAboutText] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Поля для смены пароля
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Состояние для показа/скрытия паролей
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Autofocus the first password field whenever the user lands on the
  // Security tab (covers initialTab='security' and runtime tab switches).
  // Popup itself focuses the first focusable element on open, which is
  // usually the tab header — schedule slightly later so we override that.
  const currentPasswordRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!isOpen || activeTab !== 'security') return;
    const id = window.setTimeout(() => {
      currentPasswordRef.current?.focus();
    }, 30);
    return () => window.clearTimeout(id);
  }, [isOpen, activeTab]);

  // Состояние для смены пароля
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Исходные значения для отслеживания изменений
  const [initialName, setInitialName] = useState(userName);
  const [initialPublicSlug, setInitialPublicSlug] = useState('');
  const [initialLang, setInitialLang] = useState<'ru' | 'en'>(currentLang || 'ru');
  const [initialAboutTextRu, setInitialAboutTextRu] = useState<string>('');
  const [initialAboutTextEn, setInitialAboutTextEn] = useState<string>('');
  const [initialAboutText, setInitialAboutText] = useState<string>('');

  const normalizePublicSlug = useCallback((value: string): string => {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '');
  }, []);

  const languages = [
    { value: 'ru', label: 'Русский' },
    { value: 'en', label: 'English' },
  ];

  const genreOptions = GENRE_OPTIONS.map((option) => ({
    value: option.code,
    label: option.label[currentLang === 'en' ? 'en' : 'ru'],
  }));

  // Валидация формы смены пароля — одна ошибка на конкретное поле (как в EditAlbumModal)
  const getPasswordFieldErrors = (): PasswordFieldErrors => {
    if (activeTab !== 'security') return {};

    if (!currentPassword && !newPassword && !confirmPassword) return {};

    const validation = ui?.dashboard?.settingsModal?.validation;

    if (!currentPassword) {
      return {
        currentPassword: validation?.enterCurrentPassword ?? 'Введите текущий пароль',
      };
    }

    if (!newPassword) {
      return {
        newPassword: validation?.enterNewPassword ?? 'Введите новый пароль',
      };
    }

    if (newPassword.length < 8) {
      return {
        newPassword:
          validation?.passwordMinLength ?? 'Новый пароль должен содержать минимум 8 символов',
      };
    }

    if (newPassword === currentPassword) {
      return {
        newPassword: validation?.passwordDifferent ?? 'Новый пароль должен отличаться от текущего',
      };
    }

    if (newPassword !== confirmPassword) {
      return {
        confirmPassword: validation?.passwordsNotMatch ?? 'Пароли не совпадают',
      };
    }

    return {};
  };

  const passwordFieldErrors = getPasswordFieldErrors();
  const currentPasswordError = passwordFieldErrors.currentPassword ?? null;
  const newPasswordError = passwordFieldErrors.newPassword ?? null;
  const confirmPasswordError = passwordFieldErrors.confirmPassword ?? null;
  const isPasswordFormValid =
    !currentPasswordError &&
    !newPasswordError &&
    !confirmPasswordError &&
    Boolean(currentPassword && newPassword && confirmPassword);

  // Проверка наличия изменений
  const hasProfileChanges =
    (activeTab === 'general' && selectedLang !== initialLang) ||
    (activeTab === 'profile' &&
      (name !== initialName ||
        publicSlug !== initialPublicSlug ||
        genreCode !== initialGenreCode ||
        aboutText !== initialAboutText ||
        (headerImages || []).length !== (initialHeaderImages || []).length ||
        (headerImages || []).some((url, index) => url !== (initialHeaderImages || [])[index]))) ||
    (activeTab === 'security' && (currentPassword || newPassword || confirmPassword));
  const hasPasswordChanges =
    activeTab === 'security' && (currentPassword || newPassword || confirmPassword);
  const hasChanges = hasProfileChanges || hasPasswordChanges;

  const isDashboardBusy = isChangingPassword || isSavingAboutText || isSavingProfile;

  const revertLocalEdits = useCallback(() => {
    if (activeTab === 'general') {
      setSelectedLang(initialLang);
    } else if (activeTab === 'profile') {
      setName(initialName);
      setPublicSlug(initialPublicSlug);
      setGenreCode(initialGenreCode);
      setAboutText(selectedLang === 'ru' ? initialAboutTextRu : initialAboutTextEn);
      setHeaderImages([...(initialHeaderImages || [])]);
    } else if (activeTab === 'security') {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordError(null);
      setPasswordSuccess(false);
    }
  }, [
    activeTab,
    initialLang,
    initialName,
    initialPublicSlug,
    initialGenreCode,
    selectedLang,
    initialAboutTextRu,
    initialAboutTextEn,
    initialHeaderImages,
  ]);

  const finalizeSettingsModalClose = useCallback(() => {
    if (hasChanges) {
      revertLocalEdits();
    }
    onClose();
  }, [hasChanges, revertLocalEdits, onClose]);

  const popupRequestCloseRef = useRef<(() => void) | null>(null);
  const closeDialog = useCallback(() => {
    popupRequestCloseRef.current?.();
  }, []);

  const settingsCloseGuard = useCloseWithUnsavedConfirmation({
    isOpen,
    isBusy: isDashboardBusy,
    hasUnsavedChanges: Boolean(hasChanges),
    closeDialog,
  });

  const handleSave = async () => {
    if (activeTab === 'general') {
      // Сохраняем только язык
      if (selectedLang !== initialLang) {
        setLang(selectedLang);
        setInitialLang(selectedLang);
      }
    } else if (activeTab === 'security') {
      if (!isPasswordFormValid) {
        return;
      }

      // Смена пароля через API
      setIsChangingPassword(true);
      setPasswordError(null);
      setPasswordSuccess(false);

      try {
        const token = getToken();
        if (!token) {
          setPasswordError('Не удалось получить токен авторизации');
          setIsChangingPassword(false);
          return;
        }

        const response = await fetchWithAuthSession('/api/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            currentPassword,
            newPassword,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          setPasswordError(result.error || 'Ошибка при смене пароля');
          setIsChangingPassword(false);
          return;
        }

        setPasswordSuccess(true);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setPasswordError(null);

        setTimeout(() => {
          onClose();
          setPasswordSuccess(false);
        }, 1500);
      } catch (error) {
        setPasswordError(error instanceof Error ? error.message : 'Неизвестная ошибка');
      } finally {
        setIsChangingPassword(false);
      }
    } else if (activeTab === 'profile') {
      // Сохранение изменений профиля (имя, о группе, header images)
      // Сохранение текста "О Группе" для текущего выбранного языка
      if (aboutText !== initialAboutText) {
        setIsSavingAboutText(true);
        try {
          // Разбиваем текст на параграфы по переносам строк
          const paragraphs = aboutText
            .split('\n')
            .map((p) => p.trim())
            .filter((p) => p.length > 0);

          // Сохраняем только для текущего выбранного языка
          // API автоматически сохранит оба языка (обновит только выбранный, сохранив другой)
          const result = await saveTheBandToDatabase(paragraphs, selectedLang);

          if (!result.success) {
            console.error('Ошибка сохранения текста "О Группе":', result.error);
            alert(`Ошибка сохранения: ${result.error || 'Неизвестная ошибка'}`);
            setIsSavingAboutText(false);
            return;
          }

          // Обновляем локальное состояние для сохраненного языка
          if (selectedLang === 'ru') {
            setAboutTextRu(aboutText);
            setInitialAboutTextRu(aboutText);
          } else {
            setAboutTextEn(aboutText);
            setInitialAboutTextEn(aboutText);
          }
        } catch (error) {
          console.error('Ошибка сохранения текста "О Группе":', error);
          alert(
            `Ошибка сохранения: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
          );
          setIsSavingAboutText(false);
          return;
        } finally {
          setIsSavingAboutText(false);
        }
      }

      // Сохранение site_name (название группы) и header images
      const needsSiteNameUpdate = name !== initialName;
      const needsPublicSlugUpdate = publicSlug !== initialPublicSlug;
      const needsGenreUpdate = genreCode !== initialGenreCode;
      const safeHeaderImages = Array.isArray(headerImages) ? headerImages : [];
      const safeInitialHeaderImages = Array.isArray(initialHeaderImages) ? initialHeaderImages : [];
      const needsHeaderImagesUpdate =
        safeHeaderImages.length !== safeInitialHeaderImages.length ||
        safeHeaderImages.some((url, index) => url !== safeInitialHeaderImages[index]);

      console.log('💾 [SettingsModal] Сохранение профиля:', {
        needsSiteNameUpdate,
        needsPublicSlugUpdate,
        needsGenreUpdate,
        needsHeaderImagesUpdate,
        name,
        initialName,
        headerImagesLength: safeHeaderImages.length,
        initialHeaderImagesLength: safeInitialHeaderImages.length,
      });

      if (
        needsSiteNameUpdate ||
        needsPublicSlugUpdate ||
        needsHeaderImagesUpdate ||
        needsGenreUpdate
      ) {
        setIsSavingProfile(true);
        try {
          const token = getToken();
          if (!token) {
            alert('Ошибка: вы не авторизованы. Пожалуйста, войдите в систему.');
            return;
          }

          const updateData: Record<string, unknown> = {};
          if (needsSiteNameUpdate) {
            updateData.siteName = name.trim() || null;
          }
          if (needsPublicSlugUpdate) {
            updateData.publicSlug = publicSlug.trim();
          }
          if (needsGenreUpdate) {
            updateData.genreCode = genreCode;
          }
          if (needsHeaderImagesUpdate) {
            updateData.headerImages = safeHeaderImages;
            console.log('📤 [SettingsModal] Header images для сохранения:', {
              count: safeHeaderImages.length,
              urls: safeHeaderImages,
            });
          }

          console.log('📤 [SettingsModal] Отправка данных:', updateData);

          const response = await fetchWithAuthSession('/api/user-profile', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(updateData),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error((errorData as any)?.error || `HTTP error! status: ${response.status}`);
          }

          // Отправляем событие для обновления Hero компонента
          if (needsSiteNameUpdate) {
            localStorage.setItem('profile-name', name);
            updateStoredUserName(name);
            window.dispatchEvent(
              new CustomEvent('profile-name-updated', {
                detail: { name, publicSlug: publicSlug.trim() || undefined },
              })
            );
          }

          // Отправляем событие для обновления header images в Hero компоненте
          if (needsHeaderImagesUpdate) {
            console.log(
              '✅ [SettingsModal] Header images успешно сохранены в БД, отправляем событие обновления'
            );
            window.dispatchEvent(
              new CustomEvent('header-images-updated', {
                detail: { images: safeHeaderImages },
              })
            );
          }

          console.log('✅ [SettingsModal] Профиль успешно сохранен');
        } catch (error) {
          console.error('❌ [SettingsModal] Ошибка сохранения профиля:', error);
          alert(
            `Ошибка сохранения: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
          );
          return;
        } finally {
          setIsSavingProfile(false);
        }
      } else {
        console.log('ℹ️ [SettingsModal] Нет изменений для сохранения');
      }

      setInitialName(name);
      setInitialPublicSlug(publicSlug);
      setInitialGenreCode(genreCode);
      setInitialHeaderImages([...(headerImages || [])]);
      setInitialAboutText(aboutText);

      console.log('🔄 [SettingsModal] Обновлены начальные значения:', {
        initialName: name,
        initialHeaderImagesCount: (headerImages || []).length,
      });

      window.dispatchEvent(new Event('artist:updated'));

      onClose();
    }
  };

  // Сброс состояния пароля при переключении вкладок
  useEffect(() => {
    if (activeTab !== 'security') {
      setPasswordError(null);
      setPasswordSuccess(false);
    }
  }, [activeTab]);

  // Загрузка текста "О Группе" и header images при открытии модального окна или переключении на вкладку "Профиль"
  useEffect(() => {
    if (isOpen && activeTab === 'profile') {
      const loadAboutText = async () => {
        setIsLoadingAboutText(true);
        try {
          // Загружаем оба языка из БД
          const [ruData, enData] = await Promise.all([
            loadTheBandFromDatabase('ru', { includeArtist: false, useAuth: true }),
            loadTheBandFromDatabase('en', { includeArtist: false, useAuth: true }),
          ]);
          const bilingualData = { ru: ruData, en: enData };
          const source = 'БД';

          const textRu =
            bilingualData.ru && bilingualData.ru.length > 0 ? bilingualData.ru.join('\n') : '';
          const textEn =
            bilingualData.en && bilingualData.en.length > 0 ? bilingualData.en.join('\n') : '';

          // Сохраняем оба языка в состояние
          setAboutTextRu(textRu);
          setAboutTextEn(textEn);
          setInitialAboutTextRu(textRu);
          setInitialAboutTextEn(textEn);

          // Показываем текст для текущего выбранного языка
          const currentText = selectedLang === 'ru' ? textRu : textEn;
          setAboutText(currentText);
          setInitialAboutText(currentText);

          if (
            (bilingualData.ru && bilingualData.ru.length > 0) ||
            (bilingualData.en && bilingualData.en.length > 0)
          ) {
            console.log('✅ Текст "О Группе" загружен:', {
              source,
              ruParagraphs: bilingualData.ru?.length || 0,
              enParagraphs: bilingualData.en?.length || 0,
              currentLang: selectedLang,
            });
          } else {
            console.log('ℹ️ Текст "О Группе" пуст, можно ввести новый');
          }
        } catch (error) {
          console.error('Ошибка загрузки текста "О Группе":', error);
          setAboutTextRu('');
          setAboutTextEn('');
          setAboutText('');
          setInitialAboutTextRu('');
          setInitialAboutTextEn('');
          setInitialAboutText('');
        } finally {
          setIsLoadingAboutText(false);
        }
      };

      const loadHeaderImages = async () => {
        setIsLoadingHeaderImages(true);
        try {
          const images = await loadHeaderImagesFromDatabase(true, {
            includeArtist: false,
            useAuth: true,
          });
          // Гарантируем, что images всегда массив
          const safeImages = Array.isArray(images) ? images : [];
          console.log('📥 [SettingsModal] Header images загружены из БД:', {
            count: safeImages.length,
            urls: safeImages,
            raw: images,
          });
          setHeaderImages(safeImages);
          setInitialHeaderImages(safeImages);
          if (safeImages.length > 0) {
            console.log('✅ Header images загружены:', safeImages.length);
          } else {
            console.log('ℹ️ Header images отсутствуют в БД (пустой массив)');
          }
        } catch (error) {
          console.error('❌ Ошибка загрузки header images:', error);
          setHeaderImages([]);
          setInitialHeaderImages([]);
        } finally {
          setIsLoadingHeaderImages(false);
        }
      };

      loadAboutText();
      loadHeaderImages();
    }
  }, [isOpen, activeTab, selectedLang]);

  // Обновляем отображаемый текст при изменении выбранного языка
  useEffect(() => {
    if (isOpen && activeTab === 'profile') {
      const currentText = selectedLang === 'ru' ? aboutTextRu : aboutTextEn;
      setAboutText(currentText);
      setInitialAboutText(currentText);
    }
  }, [selectedLang, isOpen, activeTab, aboutTextRu, aboutTextEn]);

  // Сброс значений при открытии модального окна
  useEffect(() => {
    if (isOpen) {
      // Загружаем название группы из API
      const loadSiteName = async () => {
        try {
          const token = getToken();
          if (!token) {
            // Если не авторизован, используем значение из localStorage или userName
            const storedName = localStorage.getItem('profile-name');
            const initialUserName = storedName || userName || '';
            setInitialName(initialUserName);
            setName(initialUserName);
            setGenreCode('other');
            setInitialGenreCode('other');
            return;
          }

          const response = await fetchWithAuthSession('/api/user-profile', {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          });

          if (response.ok) {
            const result = await response.json();
            const profileName = result.success
              ? (result.data?.siteName ?? result.data?.name ?? null)
              : null;
            const loadedPublicSlug = result.success ? (result.data?.publicSlug ?? '') : '';
            const allowedGenreCodes = new Set(GENRE_OPTIONS.map((g) => g.code));
            const rawLoaded =
              result.success && typeof result.data?.genreCode === 'string'
                ? result.data.genreCode.trim().toLowerCase()
                : '';
            const loadedGenre = rawLoaded && allowedGenreCodes.has(rawLoaded) ? rawLoaded : 'other';
            setGenreCode(loadedGenre);
            setInitialGenreCode(loadedGenre);
            if (profileName) {
              setInitialName(profileName);
              setName(profileName);
              // Сохраняем в localStorage для использования в Hero
              localStorage.setItem('profile-name', profileName);
              updateStoredUserName(profileName);
            } else {
              // Если в API нет siteName, используем значение из localStorage или userName
              const storedName = localStorage.getItem('profile-name');
              const initialUserName = storedName || userName || '';
              setInitialName(initialUserName);
              setName(initialUserName);
            }
            setInitialPublicSlug(loadedPublicSlug);
            setPublicSlug(loadedPublicSlug);
          } else {
            // В случае ошибки используем значение из localStorage или userName
            const storedName = localStorage.getItem('profile-name');
            const initialUserName = storedName || userName || '';
            setInitialName(initialUserName);
            setName(initialUserName);
            setInitialPublicSlug('');
            setPublicSlug('');
            setGenreCode('other');
            setInitialGenreCode('other');
          }
        } catch (error) {
          console.warn('⚠️ Ошибка загрузки site_name из профиля:', error);
          // В случае ошибки используем значение из localStorage или userName
          const storedName = localStorage.getItem('profile-name');
          const initialUserName = storedName || userName || '';
          setInitialName(initialUserName);
          setName(initialUserName);
          setInitialPublicSlug('');
          setPublicSlug('');
          setGenreCode('other');
          setInitialGenreCode('other');
        }
      };

      loadSiteName();

      const initialUserLang = currentLang || 'ru';
      setInitialLang(initialUserLang);
      setSelectedLang(initialUserLang);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordError(null);
      setPasswordSuccess(false);
      // Текст "О Группе" будет загружен отдельно при открытии вкладки "Профиль"
    }
  }, [isOpen, userName, currentLang]);

  // Закрытие при нажатии Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDashboardBusy) return;
        settingsCloseGuard.requestClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
    // isDashboardBusy: блокируем Escape во время сохранения; handleHeaderClose — см. стабильность выше
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isDashboardBusy]);

  return (
    <>
      <Popup
        isActive={isOpen}
        onClose={finalizeSettingsModalClose}
        onCancelRequest={() => settingsCloseGuard.requestClose()}
        requestCloseRef={popupRequestCloseRef}
        closeBlocked={isDashboardBusy || settingsCloseGuard.discardDialogOpen}
      >
        <div className="settings-modal">
          <div
            className={`settings-modal__card${isDashboardBusy ? ' dashboard-save-card--busy' : ''}`}
            aria-busy={isDashboardBusy}
          >
            <div className="settings-modal__header">
              <h2 className="settings-modal__title">{ui?.dashboard?.settings ?? 'Settings'}</h2>
              <button
                type="button"
                className="settings-modal__close"
                onClick={() => settingsCloseGuard.requestClose()}
                disabled={isDashboardBusy}
                aria-label={ui?.dashboard?.close ?? 'Закрыть'}
              >
                <ModalCloseIcon />
              </button>
            </div>

            <nav className="settings-modal__tabs">
              <button
                type="button"
                className={`settings-modal__tab ${
                  activeTab === 'general' ? 'settings-modal__tab--active' : ''
                }`}
                onClick={() => setActiveTab('general')}
              >
                {ui?.dashboard?.settingsModal?.tabs?.general ?? 'General'}
              </button>
              <button
                type="button"
                className={`settings-modal__tab ${
                  activeTab === 'profile' ? 'settings-modal__tab--active' : ''
                }`}
                onClick={() => setActiveTab('profile')}
              >
                {ui?.dashboard?.settingsModal?.tabs?.profile ?? 'Profile'}
              </button>
              <button
                type="button"
                className={`settings-modal__tab ${
                  activeTab === 'security' ? 'settings-modal__tab--active' : ''
                }`}
                onClick={() => setActiveTab('security')}
              >
                {ui?.dashboard?.settingsModal?.tabs?.security ?? 'Security'}
              </button>
            </nav>

            <div className="settings-modal__body">
              <div className="settings-modal__content">
                {activeTab === 'general' && (
                  <div className="settings-modal__general-tab">
                    <div className="settings-modal__field">
                      <label className="settings-modal__label">
                        {ui?.dashboard?.settingsModal?.fields?.language ?? 'Язык'}
                      </label>
                      <p className="settings-modal__field-description">
                        {ui?.dashboard?.settingsModal?.hints?.languageDescription ??
                          (currentLang === 'en'
                            ? 'Used throughout the application.'
                            : 'Используется во всём приложении.')}
                      </p>
                      <SettingsSelect
                        value={selectedLang}
                        options={languages}
                        onChange={(value) => setSelectedLang(value as 'ru' | 'en')}
                      />
                      <p className="settings-modal__field-hint settings-modal__field-hint--muted">
                        {ui?.dashboard?.settingsModal?.hints?.languageReloadNote ??
                          (currentLang === 'en'
                            ? 'The interface will reload after changing the language.'
                            : 'После смены языка интерфейс будет перезагружен.')}
                      </p>
                    </div>

                    {showBecomeArtist && onBecomeArtist ? (
                      <p className="settings-modal__upgrade">
                        <span className="settings-modal__upgrade-lead">
                          {ui?.dashboard?.becomeArtistLead ??
                            (currentLang === 'en'
                              ? 'Want to publish music?'
                              : 'Хотите публиковать музыку?')}
                        </span>{' '}
                        <button
                          type="button"
                          className="settings-modal__upgrade-link"
                          onClick={onBecomeArtist}
                        >
                          {ui?.dashboard?.becomeArtist ??
                            (currentLang === 'en'
                              ? 'Upgrade to artist account'
                              : 'Перейти на аккаунт артиста')}
                        </button>
                      </p>
                    ) : null}
                  </div>
                )}

                {activeTab === 'profile' && (
                  <div className="settings-modal__profile-tab">
                    <div className="settings-modal__field">
                      <label htmlFor="profile-name" className="settings-modal__label">
                        {ui?.dashboard?.settingsModal?.fields?.bandName ?? 'Band Name'}
                      </label>
                      <input
                        id="profile-name"
                        type="text"
                        className="settings-modal__input"
                        placeholder={
                          ui?.dashboard?.settingsModal?.placeholders?.bandName ??
                          'Enter the name of your band'
                        }
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>

                    <div className="settings-modal__field">
                      <label htmlFor="profile-primary-genre" className="settings-modal__label">
                        {ui?.dashboard?.settingsModal?.fields?.primaryGenre ?? 'Основной жанр'}
                      </label>
                      <SettingsSelect
                        id="profile-primary-genre"
                        value={genreCode}
                        options={genreOptions}
                        onChange={setGenreCode}
                      />
                      <div className="settings-modal__field-hint">
                        {ui?.dashboard?.settingsModal?.hints?.primaryGenreCatalog ??
                          'Этот жанр используется для отображения артиста в каталоге'}
                      </div>
                    </div>

                    <div className="settings-modal__field">
                      <label htmlFor="profile-public-slug" className="settings-modal__label">
                        Public URL (slug)
                      </label>
                      <input
                        id="profile-public-slug"
                        type="text"
                        className="settings-modal__input"
                        placeholder="my-band"
                        value={publicSlug}
                        onChange={(e) => setPublicSlug(normalizePublicSlug(e.target.value))}
                        onBlur={(e) => setPublicSlug(normalizePublicSlug(e.target.value))}
                      />
                      <div className="settings-modal__field-hint">
                        {ui?.dashboard?.settingsModal?.hints?.publicSlug ??
                          (currentLang === 'en'
                            ? 'Changing the slug may affect existing public links.'
                            : 'Изменение slug может повлиять на существующие публичные ссылки.')}
                      </div>
                    </div>

                    <div className="settings-modal__field">
                      <label htmlFor="profile-email" className="settings-modal__label">
                        {ui?.dashboard?.settingsModal?.fields?.email ?? 'Email'}
                      </label>
                      <input
                        id="profile-email"
                        type="email"
                        className="settings-modal__input"
                        value={userEmail}
                        disabled
                      />
                      <SettingsEmailVerificationStatus verified={emailVerified} />
                    </div>

                    <div className="settings-modal__field">
                      <label htmlFor="profile-about" className="settings-modal__label">
                        {ui?.dashboard?.settingsModal?.fields?.aboutBand ?? 'О Группе'}
                        {selectedLang === 'ru' ? ' (RU)' : ' (EN)'}
                      </label>
                      {isLoadingAboutText ? (
                        <div className="settings-modal__loading">
                          {ui?.dashboard?.loading ?? ui?.dashboard?.uploading ?? 'Загрузка...'}
                        </div>
                      ) : (
                        <textarea
                          id="profile-about"
                          className="settings-modal__textarea"
                          placeholder={
                            selectedLang === 'ru'
                              ? (ui?.dashboard?.settingsModal?.placeholders?.aboutBand ??
                                'Введите описание группы на русском языке. Каждая строка будет отдельным параграфом.')
                              : (ui?.dashboard?.settingsModal?.placeholders?.aboutBand ??
                                'Enter band description in English. Each line will be a separate paragraph.')
                          }
                          value={aboutText}
                          onChange={(e) => setAboutText(e.target.value)}
                          rows={8}
                        />
                      )}
                      <div className="settings-modal__field-hint">
                        {selectedLang === 'ru'
                          ? (ui?.dashboard?.settingsModal?.hints?.aboutBand ??
                            'Каждая строка будет отдельным параграфом в описании группы')
                          : (ui?.dashboard?.settingsModal?.hints?.aboutBand ??
                            'Each line will be a separate paragraph in the band description')}
                      </div>
                    </div>

                    <div className="settings-modal__field">
                      <label className="settings-modal__label">
                        {ui?.dashboard?.settingsModal?.fields?.headerImages ?? 'Header Images'}
                      </label>
                      {isLoadingHeaderImages ? (
                        <div>
                          {ui?.dashboard?.loading ?? ui?.dashboard?.uploading ?? 'Loading...'}
                        </div>
                      ) : (
                        <HeaderImagesUpload
                          currentImages={headerImages || []}
                          onImagesUpdated={(urls) => {
                            setHeaderImages(Array.isArray(urls) ? urls : []);
                          }}
                        />
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'security' && (
                  <form
                    id={SECURITY_FORM_ID}
                    className="settings-modal__security-tab"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleSave();
                    }}
                    noValidate
                  >
                    {passwordSuccess && (
                      <div className="settings-modal__success-message">
                        {ui?.dashboard?.settingsModal?.messages?.passwordUpdated ??
                          'Пароль обновлён'}
                      </div>
                    )}

                    {passwordError && (
                      <div className="settings-modal__error-message">{passwordError}</div>
                    )}

                    <div className="settings-modal__field">
                      <label htmlFor="current-password" className="settings-modal__label">
                        {ui?.dashboard?.settingsModal?.fields?.currentPassword ?? 'Текущий пароль'}
                      </label>
                      <div className="settings-modal__input-wrapper">
                        <input
                          ref={currentPasswordRef}
                          id="current-password"
                          type={showCurrentPassword ? 'text' : 'password'}
                          className={`settings-modal__input${
                            currentPasswordError ? ' settings-modal__input--invalid' : ''
                          }`}
                          value={currentPassword}
                          onChange={(e) => {
                            setCurrentPassword(e.target.value);
                            setPasswordError(null);
                          }}
                          autoComplete="current-password"
                          disabled={isChangingPassword}
                          aria-invalid={Boolean(currentPasswordError)}
                          aria-describedby={
                            currentPasswordError ? 'current-password-error' : undefined
                          }
                        />
                        <button
                          type="button"
                          className="settings-modal__password-toggle"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          aria-label={showCurrentPassword ? 'Скрыть пароль' : 'Показать пароль'}
                          tabIndex={-1}
                        >
                          <PasswordVisibilityIcon visible={showCurrentPassword} />
                        </button>
                      </div>
                      {currentPasswordError ? (
                        <p
                          id="current-password-error"
                          className="settings-modal__field-error"
                          role="alert"
                        >
                          {currentPasswordError}
                        </p>
                      ) : null}
                    </div>

                    <div className="settings-modal__field">
                      <label htmlFor="new-password" className="settings-modal__label">
                        {ui?.dashboard?.settingsModal?.fields?.newPassword ?? 'Новый пароль'}
                      </label>
                      <div className="settings-modal__input-wrapper">
                        <input
                          id="new-password"
                          type={showNewPassword ? 'text' : 'password'}
                          className={`settings-modal__input${
                            newPasswordError ? ' settings-modal__input--invalid' : ''
                          }`}
                          value={newPassword}
                          onChange={(e) => {
                            setNewPassword(e.target.value);
                            setPasswordError(null);
                          }}
                          autoComplete="new-password"
                          disabled={isChangingPassword}
                          minLength={8}
                          aria-invalid={Boolean(newPasswordError)}
                          aria-describedby={newPasswordError ? 'new-password-error' : undefined}
                        />
                        <button
                          type="button"
                          className="settings-modal__password-toggle"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          aria-label={showNewPassword ? 'Скрыть пароль' : 'Показать пароль'}
                          tabIndex={-1}
                        >
                          <PasswordVisibilityIcon visible={showNewPassword} />
                        </button>
                      </div>
                      {newPasswordError ? (
                        <p
                          id="new-password-error"
                          className="settings-modal__field-error"
                          role="alert"
                        >
                          {newPasswordError}
                        </p>
                      ) : null}
                    </div>

                    <div className="settings-modal__field">
                      <label htmlFor="confirm-password" className="settings-modal__label">
                        {ui?.dashboard?.settingsModal?.fields?.confirmPassword ??
                          'Подтвердите новый пароль'}
                      </label>
                      <div className="settings-modal__input-wrapper">
                        <input
                          id="confirm-password"
                          type={showConfirmPassword ? 'text' : 'password'}
                          className={`settings-modal__input${
                            confirmPasswordError ? ' settings-modal__input--invalid' : ''
                          }`}
                          value={confirmPassword}
                          onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            setPasswordError(null);
                          }}
                          autoComplete="new-password"
                          disabled={isChangingPassword}
                          aria-invalid={Boolean(confirmPasswordError)}
                          aria-describedby={
                            confirmPasswordError ? 'confirm-password-error' : undefined
                          }
                        />
                        <button
                          type="button"
                          className="settings-modal__password-toggle"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          aria-label={showConfirmPassword ? 'Скрыть пароль' : 'Показать пароль'}
                          tabIndex={-1}
                        >
                          <PasswordVisibilityIcon visible={showConfirmPassword} />
                        </button>
                      </div>
                      {confirmPasswordError ? (
                        <p
                          id="confirm-password-error"
                          className="settings-modal__field-error"
                          role="alert"
                        >
                          {confirmPasswordError}
                        </p>
                      ) : null}
                    </div>
                  </form>
                )}
              </div>
            </div>

            <div className="settings-modal__footer">
              <button
                type="button"
                className="settings-modal__button settings-modal__button--cancel"
                onClick={() => settingsCloseGuard.requestClose()}
                disabled={isDashboardBusy}
              >
                {ui?.dashboard?.cancel ?? 'Отмена'}
              </button>
              <button
                type={activeTab === 'security' ? 'submit' : 'button'}
                form={activeTab === 'security' ? SECURITY_FORM_ID : undefined}
                className={`settings-modal__button settings-modal__button--save${
                  isDashboardBusy ? ' settings-modal__button--save-loading' : ''
                }`}
                onClick={activeTab === 'security' ? undefined : handleSave}
                disabled={
                  isDashboardBusy ||
                  !hasChanges ||
                  (activeTab === 'security' && !isPasswordFormValid)
                }
              >
                {isDashboardBusy ? (
                  <>
                    <DashboardSaveSpinner />
                    {ui?.dashboard?.saving ?? ui?.dashboard?.uploading ?? 'Сохранение...'}
                  </>
                ) : (
                  (ui?.dashboard?.save ?? 'Сохранить')
                )}
              </button>
            </div>
          </div>
        </div>
        <InlineEditDiscardDialog
          open={settingsCloseGuard.discardDialogOpen}
          labels={getCloseDiscardConfirmLabels(ui ?? undefined)}
          titleId={settingsCloseGuard.discardTitleDomId}
          onStay={settingsCloseGuard.dismissDiscardDialog}
          onDiscard={settingsCloseGuard.finalizeCloseWithoutSaving}
        />
      </Popup>
    </>
  );
}
