import { useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { getToken, updateStoredUserName } from '@shared/lib/auth';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import {
  loadTheBandFromDatabase,
  saveTheBandToDatabase,
  loadHeaderImagesFromDatabase,
} from '@entities/user/lib';
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
};

export function useSettingsPage({ enabled, userName = '' }: UseSettingsPageOptions) {
  const { lang: currentLang, setLang } = useLang();
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
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingAboutText, setIsSavingAboutText] = useState(false);

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

  const persistProfile = useCallback(async (updates: Record<string, unknown>) => {
    const token = getToken();
    if (!token) {
      alert('Error: you are not signed in.');
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

      window.dispatchEvent(new Event('artist:updated'));
      return true;
    } catch (error) {
      console.error('❌ [useSettingsPage] Profile save failed:', error);
      alert(`Save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    } finally {
      setIsSavingProfile(false);
    }
  }, []);

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
    if (needsSiteNameUpdate) updateData.siteName = name.trim() || null;
    if (needsPublicSlugUpdate) updateData.publicSlug = publicSlug.trim();
    if (needsGenreUpdate) updateData.genreCode = genreCode;
    if (needsHeaderImagesUpdate) updateData.headerImages = safeHeaderImages;

    const ok = await persistProfile(updateData);
    if (!ok) return;

    if (needsSiteNameUpdate) {
      localStorage.setItem('profile-name', name);
      updateStoredUserName(name);
      window.dispatchEvent(
        new CustomEvent('profile-name-updated', {
          detail: { name, publicSlug: publicSlug.trim() || undefined },
        })
      );
    }

    if (needsHeaderImagesUpdate) {
      window.dispatchEvent(
        new CustomEvent('header-images-updated', {
          detail: { images: safeHeaderImages },
        })
      );
    }

    setInitialName(name);
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
    name,
    persistProfile,
    publicSlug,
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

      const result = await saveTheBandToDatabase(paragraphs, currentLang);
      if (!result.success) {
        alert(`Save failed: ${result.error || 'Unknown error'}`);
        return;
      }

      if (currentLang === 'ru') {
        setAboutTextRu(aboutText);
        setInitialAboutTextRu(aboutText);
      } else {
        setAboutTextEn(aboutText);
        setInitialAboutTextEn(aboutText);
      }
      setInitialAboutText(aboutText);
      window.dispatchEvent(new Event('artist:updated'));
    } catch (error) {
      alert(`Save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSavingAboutText(false);
    }
  }, [aboutText, currentLang, initialAboutText]);

  saveAboutRef.current = saveAboutText;

  const handleLanguageChange = useCallback(
    (value: string) => {
      const nextLang = value as 'ru' | 'en';
      if (nextLang === currentLang) return;
      setLang(nextLang);
    },
    [currentLang, setLang]
  );

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
      if (ok) setInitialGenreCode(value);
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
      if (ok) setInitialHeaderImages([...safe]);
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
          loadTheBandFromDatabase('ru', { includeArtist: false, useAuth: true }),
          loadTheBandFromDatabase('en', { includeArtist: false, useAuth: true }),
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

    void loadSiteName();
    void loadAboutText();
    void loadHeaderImages();
  }, [currentLang, enabled, userName]);

  useEffect(() => {
    if (!enabled) return;
    const currentText = currentLang === 'ru' ? aboutTextRu : aboutTextEn;
    setAboutText(currentText);
    setInitialAboutText(currentText);
  }, [aboutTextEn, aboutTextRu, currentLang, enabled]);

  return {
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
    normalizePublicSlug,
    isLoadingProfile,
    isLoadingAboutText,
    isLoadingHeaderImages,
    isSavingProfile,
    isSavingAboutText,
    isBusy: isSavingProfile || isSavingAboutText,
  };
}
