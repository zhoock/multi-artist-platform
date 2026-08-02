import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router-dom';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { getToken, updateStoredUserName } from '@shared/lib/auth';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { useDashboardModalShell } from '@shared/lib/dashboardModalShellContext';
import type { DashboardOpenIntent } from '@shared/lib/dashboardOpenIntent';
import {
  captureDashboardModalBackground,
  isValidDashboardModalBackground,
  localizeDashboardModalBackground,
  readDashboardModalBackground,
  type DashboardModalBackground,
} from '@shared/lib/dashboardModalBackground';
import {
  loadTheBandFromDatabase,
  saveTheBandToDatabase,
  loadHeaderImagesFromDatabase,
} from '@entities/user/lib';
import { notifyPublicSurfaceChanged, type ProfileAspect } from '@shared/lib/publicSurfaceSync';
import { GENRE_OPTIONS } from '../modals/album/EditAlbumModal.constants';

function normalizePublicSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

type UseSettingsPageOptions = {
  enabled: boolean;
  userName?: string;
  isListener?: boolean;
  onNotAuthorized?: () => void;
  onSaveError?: (message: string) => void;
};

export function useSettingsPage({
  enabled,
  userName = '',
  isListener = false,
  onNotAuthorized,
  onSaveError,
}: UseSettingsPageOptions) {
  const { lang: currentLang, setLang } = useLang();
  const location = useLocation();
  const navigate = useNavigate();
  const { surfaceLocation: dashboardSurfaceFromLayout } = useDashboardModalShell();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, currentLang));

  const [name, setName] = useState(userName);
  const [publicSlug, setPublicSlug] = useState('');
  const [genreCode, setGenreCode] = useState('other');
  const [headerImages, setHeaderImages] = useState<string[]>([]);
  const [aboutTextRu, setAboutTextRu] = useState('');
  const [aboutTextEn, setAboutTextEn] = useState('');
  const [aboutText, setAboutText] = useState('');

  const [initialName, setInitialName] = useState(userName);
  const [initialPublicSlug, setInitialPublicSlug] = useState('');
  const [initialGenreCode, setInitialGenreCode] = useState('other');
  const [initialHeaderImages, setInitialHeaderImages] = useState<string[]>([]);
  const [initialAboutTextRu, setInitialAboutTextRu] = useState('');
  const [initialAboutTextEn, setInitialAboutTextEn] = useState('');
  const [initialAboutText, setInitialAboutText] = useState('');

  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isLoadingAboutText, setIsLoadingAboutText] = useState(false);
  const [isLoadingHeaderImages, setIsLoadingHeaderImages] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingAboutText, setIsSavingAboutText] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const saveProfileRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const saveAboutRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const aboutDebounceRef = useRef<number | null>(null);

  const languages = [
    { value: 'ru', label: 'Русский' },
    { value: 'en', label: 'English' },
  ];

  const genreOptions = GENRE_OPTIONS.map((option) => ({
    value: option.code,
    label: option.label[currentLang === 'en' ? 'en' : 'ru'],
  }));

  const formatSaveError = useCallback(
    (error: unknown) => {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      const prefix = ui?.dashboard?.error ?? 'Error';
      return `${prefix}: ${detail}`;
    },
    [ui?.dashboard?.error]
  );

  const persistProfile = useCallback(
    async (updates: Record<string, unknown>) => {
      const token = getToken();
      if (!token) {
        onNotAuthorized?.();
        return false;
      }

      setIsSavingProfile(true);
      try {
        const response = await fetchWithAuthSession('/api/user-profile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error((errorData as { error?: string })?.error || `HTTP ${response.status}`);
        }

        return true;
      } catch (error) {
        console.error('❌ [useSettingsPage] Profile save failed:', error);
        onSaveError?.(formatSaveError(error));
        return false;
      } finally {
        setIsSavingProfile(false);
      }
    },
    [formatSaveError, onNotAuthorized, onSaveError]
  );

  const saveProfileFields = useCallback(async () => {
    const needsSiteNameUpdate = name !== initialName;
    const needsPublicSlugUpdate = publicSlug !== initialPublicSlug;
    const needsGenreUpdate = genreCode !== initialGenreCode;
    const safeHeaderImages = Array.isArray(headerImages) ? headerImages : [];
    const safeInitialHeaderImages = Array.isArray(initialHeaderImages) ? initialHeaderImages : [];
    const needsHeaderImagesUpdate =
      safeHeaderImages.length !== safeInitialHeaderImages.length ||
      safeHeaderImages.some((url, index) => url !== safeInitialHeaderImages[index]);

    if (
      !needsSiteNameUpdate &&
      !needsPublicSlugUpdate &&
      !needsGenreUpdate &&
      !needsHeaderImagesUpdate
    ) {
      return;
    }

    const updateData: Record<string, unknown> = {};
    if (needsSiteNameUpdate) {
      const trimmedName = name.trim();
      if (!trimmedName) {
        const message = isListener
          ? 'Name is required'
          : (ui?.auth?.register?.siteBandNameRequired ?? 'Site / band name is required');
        setNameError(message);
        setName(initialName);
      } else {
        updateData.siteName = trimmedName;
      }
    }
    if (needsPublicSlugUpdate) updateData.publicSlug = publicSlug.trim();
    if (needsGenreUpdate) updateData.genreCode = genreCode;
    if (needsHeaderImagesUpdate) updateData.headerImages = safeHeaderImages;

    if (Object.keys(updateData).length === 0) {
      return;
    }

    const savedSiteName = updateData.siteName as string | undefined;

    const ok = await persistProfile(updateData);
    if (!ok) return;

    if (savedSiteName !== undefined) {
      setNameError(null);
      localStorage.setItem('profile-name', savedSiteName);
      updateStoredUserName(savedSiteName);
    }

    const aspects: ProfileAspect[] = [];
    if (savedSiteName !== undefined) aspects.push('name');
    if (needsPublicSlugUpdate) aspects.push('slug');
    if (needsGenreUpdate) aspects.push('genre');
    if (needsHeaderImagesUpdate) aspects.push('headerImages');

    notifyPublicSurfaceChanged(
      { type: 'profileChanged', aspects },
      {
        artistSlug: publicSlug.trim() || undefined,
        displayName: savedSiteName,
        headerImages: needsHeaderImagesUpdate ? safeHeaderImages : undefined,
      }
    );

    if (savedSiteName !== undefined) {
      setInitialName(savedSiteName);
      setName(savedSiteName);
    }
    setInitialPublicSlug(publicSlug);
    setInitialGenreCode(genreCode);
    setInitialHeaderImages([...safeHeaderImages]);
  }, [
    genreCode,
    headerImages,
    initialGenreCode,
    initialHeaderImages,
    initialName,
    initialPublicSlug,
    isListener,
    name,
    persistProfile,
    publicSlug,
    ui,
  ]);

  saveProfileRef.current = saveProfileFields;

  const saveAboutText = useCallback(async () => {
    if (aboutText === initialAboutText) return;

    setIsSavingAboutText(true);
    try {
      const paragraphs = aboutText
        .split('\n')
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      const isClearing = paragraphs.length === 0;

      const result = isClearing
        ? await saveTheBandToDatabase({ ru: [], en: [] })
        : await saveTheBandToDatabase(paragraphs, currentLang);
      if (!result.success) {
        onSaveError?.(`${ui?.dashboard?.error ?? 'Error'}: ${result.error || 'Unknown error'}`);
        return;
      }

      if (isClearing) {
        setAboutTextRu('');
        setAboutTextEn('');
        setInitialAboutTextRu('');
        setInitialAboutTextEn('');
      } else if (currentLang === 'ru') {
        setAboutTextRu(aboutText);
        setInitialAboutTextRu(aboutText);
      } else {
        setAboutTextEn(aboutText);
        setInitialAboutTextEn(aboutText);
      }
      setInitialAboutText(aboutText);
      notifyPublicSurfaceChanged({ type: 'profileChanged', aspects: ['about'] });
    } catch (error) {
      onSaveError?.(formatSaveError(error));
    } finally {
      setIsSavingAboutText(false);
    }
  }, [
    aboutText,
    currentLang,
    formatSaveError,
    initialAboutText,
    onSaveError,
    ui?.dashboard?.error,
  ]);

  saveAboutRef.current = saveAboutText;

  const handleLanguageChange = useCallback(
    (value: string) => {
      const nextLang = value as 'ru' | 'en';
      if (nextLang === currentLang) return;
      setLang(nextLang);

      const routerBackground = (location.state as DashboardOpenIntent | null)?.backgroundLocation;
      const storedBackground = readDashboardModalBackground();
      const backgroundSource: Location | DashboardModalBackground | null | undefined =
        routerBackground ?? dashboardSurfaceFromLayout ?? storedBackground;

      if (!backgroundSource || !isValidDashboardModalBackground(backgroundSource)) {
        return;
      }

      const localizedBackground = localizeDashboardModalBackground(
        {
          pathname: backgroundSource.pathname,
          search: backgroundSource.search,
          hash: backgroundSource.hash ?? '',
        },
        nextLang
      );

      captureDashboardModalBackground(localizedBackground);

      const nextBackgroundLocation: Location = {
        pathname: localizedBackground.pathname,
        search: localizedBackground.search,
        hash: localizedBackground.hash,
        state: null,
        key: 'dashboard-lang-bg',
      };

      navigate(
        {
          pathname: location.pathname,
          search: location.search,
          hash: location.hash,
        },
        {
          replace: true,
          state: {
            ...(location.state && typeof location.state === 'object' ? location.state : {}),
            backgroundLocation: nextBackgroundLocation,
          },
        }
      );
    },
    [currentLang, dashboardSurfaceFromLayout, location, navigate, setLang]
  );

  const handleNameChange = useCallback((value: string) => {
    setName(value);
    setNameError(null);
  }, []);

  const handleNameBlur = useCallback(() => {
    void saveProfileRef.current?.();
  }, []);

  const handlePublicSlugChange = useCallback((value: string) => {
    setPublicSlug(normalizePublicSlug(value));
  }, []);

  const handlePublicSlugBlur = useCallback(() => {
    setPublicSlug((prev) => normalizePublicSlug(prev));
    void saveProfileRef.current?.();
  }, []);

  const handleGenreChange = useCallback(
    async (value: string) => {
      setGenreCode(value);
      if (value === initialGenreCode) return;
      const ok = await persistProfile({ genreCode: value });
      if (!ok) return;
      setInitialGenreCode(value);
      notifyPublicSurfaceChanged({ type: 'profileChanged', aspects: ['genre'] });
    },
    [initialGenreCode, persistProfile]
  );

  const handleHeaderImagesUpdated = useCallback(
    async (urls: string[]) => {
      const safe = Array.isArray(urls) ? urls : [];
      setHeaderImages(safe);
      const safeInitial = Array.isArray(initialHeaderImages) ? initialHeaderImages : [];
      const changed =
        safe.length !== safeInitial.length || safe.some((url, index) => url !== safeInitial[index]);
      if (!changed) return;
      const ok = await persistProfile({ headerImages: safe });
      if (!ok) return;
      setInitialHeaderImages([...safe]);
      notifyPublicSurfaceChanged(
        { type: 'profileChanged', aspects: ['headerImages'] },
        { headerImages: safe }
      );
    },
    [initialHeaderImages, persistProfile]
  );

  const handleAboutChange = useCallback((value: string) => {
    setAboutText(value);
    if (aboutDebounceRef.current !== null) {
      window.clearTimeout(aboutDebounceRef.current);
    }
    aboutDebounceRef.current = window.setTimeout(() => {
      void saveAboutRef.current?.();
    }, 800);
  }, []);

  const handleAboutBlur = useCallback(() => {
    if (aboutDebounceRef.current !== null) {
      window.clearTimeout(aboutDebounceRef.current);
      aboutDebounceRef.current = null;
    }
    void saveAboutRef.current?.();
  }, []);

  useEffect(() => {
    return () => {
      if (aboutDebounceRef.current !== null) {
        window.clearTimeout(aboutDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const loadSiteName = async () => {
      setIsLoadingProfile(true);
      try {
        const token = getToken();
        if (!token) {
          const storedName = localStorage.getItem('profile-name');
          const initialUserName = storedName || userName || '';
          setInitialName(initialUserName);
          setName(initialUserName);
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
            localStorage.setItem('profile-name', profileName);
            updateStoredUserName(profileName);
          } else {
            const storedName = localStorage.getItem('profile-name');
            const initialUserName = storedName || userName || '';
            setInitialName(initialUserName);
            setName(initialUserName);
          }
          setInitialPublicSlug(loadedPublicSlug);
          setPublicSlug(loadedPublicSlug);
        }
      } catch (error) {
        console.warn('⚠️ [useSettingsPage] Failed to load profile:', error);
      } finally {
        setIsLoadingProfile(false);
      }
    };

    const loadAboutText = async () => {
      setIsLoadingAboutText(true);
      try {
        const [ruData, enData] = await Promise.all([
          loadTheBandFromDatabase('ru', {
            includeArtist: false,
            useAuth: true,
            noBandFallback: true,
          }),
          loadTheBandFromDatabase('en', {
            includeArtist: false,
            useAuth: true,
            noBandFallback: true,
          }),
        ]);

        const textRu = ruData && ruData.length > 0 ? ruData.join('\n') : '';
        const textEn = enData && enData.length > 0 ? enData.join('\n') : '';

        setAboutTextRu(textRu);
        setAboutTextEn(textEn);
        setInitialAboutTextRu(textRu);
        setInitialAboutTextEn(textEn);

        const currentText = currentLang === 'ru' ? textRu : textEn;
        setAboutText(currentText);
        setInitialAboutText(currentText);
      } catch (error) {
        console.error('[useSettingsPage] Failed to load about text:', error);
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
        const safeImages = Array.isArray(images) ? images : [];
        setHeaderImages(safeImages);
        setInitialHeaderImages(safeImages);
      } catch (error) {
        console.error('[useSettingsPage] Failed to load header images:', error);
        setHeaderImages([]);
        setInitialHeaderImages([]);
      } finally {
        setIsLoadingHeaderImages(false);
      }
    };

    void Promise.all([loadSiteName(), loadAboutText(), loadHeaderImages()]).finally(() => {
      setHasLoadedOnce(true);
    });
  }, [currentLang, enabled, userName]);

  useEffect(() => {
    if (!enabled) return;
    const currentText = currentLang === 'ru' ? aboutTextRu : aboutTextEn;
    setAboutText(currentText);
    setInitialAboutText(currentText);
  }, [aboutTextEn, aboutTextRu, currentLang, enabled]);

  const headerImagesDirty = useMemo(() => {
    if (headerImages.length !== initialHeaderImages.length) {
      return true;
    }
    return headerImages.some((image, index) => image !== initialHeaderImages[index]);
  }, [headerImages, initialHeaderImages]);

  const hasUnsavedChanges = useMemo(
    () =>
      name !== initialName ||
      publicSlug !== initialPublicSlug ||
      genreCode !== initialGenreCode ||
      aboutText !== initialAboutText ||
      aboutTextRu !== initialAboutTextRu ||
      aboutTextEn !== initialAboutTextEn ||
      headerImagesDirty,
    [
      aboutText,
      aboutTextEn,
      aboutTextRu,
      genreCode,
      headerImagesDirty,
      initialAboutText,
      initialAboutTextEn,
      initialAboutTextRu,
      initialGenreCode,
      initialName,
      initialPublicSlug,
      name,
      publicSlug,
    ]
  );

  return {
    ui,
    currentLang,
    languages,
    genreOptions,
    name,
    setName: handleNameChange,
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
    normalizePublicSlug,
    isLoadingProfile,
    isLoadingAboutText,
    isLoadingHeaderImages,
    hasLoadedOnce,
    isSavingProfile,
    isSavingAboutText,
    isBusy: isSavingProfile || isSavingAboutText,
    hasUnsavedChanges,
  };
}
