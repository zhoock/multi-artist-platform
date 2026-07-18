// src/pages/UserDashboard/components/EditAlbumModal.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Popup } from '@shared/ui/popup';
import { AlertModal } from '@shared/ui/alertModal';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { selectDashboardAlbumsData, fetchAlbums } from '@entities/album';
import { queueAlbumCreatedToast } from '@shared/lib/albumCreatedToast';
import { useLang } from '@app/providers/lang';
import { getToken, getUser } from '@shared/lib/auth';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { useSiteArtistDisplayName } from '@shared/lib/hooks/useSiteArtistDisplayName';
import { readStoredProfileDisplayName } from '@shared/lib/profileDisplayName';
import { getUserImageUrl } from '@shared/api/albums';
import { DashboardLoadingState, DashboardSpinner } from '@shared/ui/dashboard';
import { getAlbumStorageBaseName } from '@shared/lib/albumCoverUrl';
import { uploadCoverDraft, commitCover } from '@shared/api/albums/cover';
import type { IAlbums, detailsProps } from '@models';
import { mergeSemanticSourceIntoLocaleDetails } from '@entities/album/lib/albumDetailSemanticKind';
import { generateAlbumIdFromTitle } from '@shared/lib/album/generateAlbumIdFromTitle';
import type { SupportedLang } from '@shared/model/lang';
import {
  buildTranslatedContentEditFallbackNotice,
  collectAlbumEditFallbackSources,
  getAlbumDetailsForEdit,
  resolveAlbumFieldForEdit,
  resolveAlbumCoverCreditFieldForEdit,
} from '@entities/album/lib/resolveAlbumDisplay';
import type {
  EditAlbumModalProps,
  AlbumFormData,
  BandMember,
  RecordingEntry,
  RecordingFormDraft,
  StreamingLink,
} from './EditAlbumModal.types';
import {
  GENRE_OPTIONS,
  MAX_TAGS,
  MIN_TAG_LENGTH,
  MAX_TAG_LENGTH,
  MAX_BAND_MEMBERS,
  PURCHASE_SERVICES,
  STREAMING_SERVICES,
} from './EditAlbumModal.constants';
import type { AlbumStep1InvalidField, AlbumStep4InvalidField } from './EditAlbumModal.utils';
import {
  dedupeSemanticAlbumDetailBlocks,
  makeEmptyForm,
  getAlbumStep1InvalidFields,
  getAlbumStep4InvalidFields,
  scrollToFirstAlbumStep1InvalidField,
  scrollToFirstAlbumStep4InvalidField,
  scrollToAlbumStep2GenreField,
  isAlbumStep2GenreValid,
  transformFormDataToAlbumFormat,
  formatDateFromISO,
  formatDateToISO,
  formatDateInput,
  parseRecordingText,
  buildRecordingText,
  bandMemberEditHasChanges,
  EMPTY_BAND_MEMBER,
  EMPTY_LINK,
  linkEditHasChanges,
  emptyRecordingFormDraft,
  recordingFormDraftIsDirty,
  recordingFormDraftCanSave,
  buildAlbumDiscardFingerprint,
  makeEmptyDiscardAuxBaseline,
  parseBandMemberFromContentItem,
  parseProducerFromContentItem,
  parseRecordingEntryFromContentItem,
  createBandMember,
  createRecordingEntry,
  updateBandMemberPreservingId,
  updateRecordingEntryPreservingId,
  buildRecordingEntryFromEditFields,
} from './EditAlbumModal.utils';
import type { AlbumDiscardAuxState } from './EditAlbumModal.utils';
import { recordingEntryEditHasChanges } from './recordingEntryEditHasChanges';
import {
  InlineEditDiscardDialog,
  getSwitchEditConfirmLabels,
  getCloseDiscardConfirmLabels,
} from '../../shared/EditableCardField';
import { EditAlbumModalStep2 } from '../../steps/EditAlbumModalStep2';
import { EditAlbumModalStep3 } from '../../steps/EditAlbumModalStep3';
import { EditAlbumModalStep4 } from '../../steps/EditAlbumModalStep4';
import { EditAlbumModalStep5 } from '../../steps/EditAlbumModalStep5';
import './EditAlbumModal.style.scss';
import { useYooKassaPaymentConnected } from '@shared/lib/payment/useYooKassaPaymentConnected';
import { EditAlbumCloseIcon } from '../../steps/EditAlbumStepIcons';

// Re-export types for backward compatibility
export type {
  EditAlbumModalProps,
  BandMember,
  StreamingLink,
  AlbumFormData,
} from './EditAlbumModal.types';

export function EditAlbumModal({
  isOpen,
  albumId,
  onClose,
  onNext,
}: EditAlbumModalProps): JSX.Element | null {
  const navigate = useNavigate();
  const location = useLocation();
  const { lang } = useLang();
  const dispatch = useAppDispatch();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const { displayName: siteArtistDisplayName } = useSiteArtistDisplayName(lang, {
    variant: 'authenticated',
  });

  // Получаем альбомы для текущего языка сайта
  const albumsFromStore = useAppSelector(selectDashboardAlbumsData);
  const isNewAlbumWizard = !albumId;

  // Контроль инициализации - чтобы не перетирать ввод пользователя
  const didInitRef = useRef(false);
  /** Название альбома при открытии формы (для смены slug при редактировании title). */
  const albumTitleAtOpenRef = useRef('');
  /** Актуальный album_id из загруженного альбома (после переименования slug важнее пропа). */
  const canonicalAlbumIdRef = useRef('');
  const editAlbumModalCardRef = useRef<HTMLDivElement>(null);

  const [currentStep, setCurrentStep] = useState(1);
  /** Ошибки шага 1 — показ подполями вместо alert */
  const [step1InvalidFields, setStep1InvalidFields] = useState<AlbumStep1InvalidField[]>([]);
  const [step2GenreRequired, setStep2GenreRequired] = useState(false);
  const [step4InvalidFields, setStep4InvalidFields] = useState<AlbumStep4InvalidField[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Данные формы
  const [formData, setFormData] = useState<AlbumFormData>(makeEmptyForm());

  const paymentUser = getUser();
  const { loading: yookassaLoading, monetizationEnabled: hasYooKassa } =
    useYooKassaPaymentConnected(paymentUser?.id);
  /** Для валидации и сохранения: без ЮKassa продажа в релиз не уходит. */
  const saleModeForValidation: 'no' | 'yes' | 'preorder' = hasYooKassa
    ? formData.allowDownloadSale
    : 'no';
  const showPriceFields =
    hasYooKassa &&
    (formData.allowDownloadSale === 'yes' || formData.allowDownloadSale === 'preorder');
  const showPreorderDate = hasYooKassa && formData.allowDownloadSale === 'preorder';

  const [dragActive, setDragActive] = useState(false);
  const [genreDropdownOpen, setGenreDropdownOpen] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [tagError, setTagError] = useState('');

  const genreDropdownRef = useRef<HTMLDivElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const [bandMemberName, setBandMemberName] = useState('');
  const [bandMemberRole, setBandMemberRole] = useState('');
  const [bandMemberURL, setBandMemberURL] = useState('');
  const [editingBandMemberIndex, setEditingBandMemberIndex] = useState<number | null>(null);
  const [addBandMemberName, setAddBandMemberName] = useState('');
  const [addBandMemberRole, setAddBandMemberRole] = useState('');
  const [addBandMemberURL, setAddBandMemberURL] = useState('');

  const [sessionMusicianName, setSessionMusicianName] = useState('');
  const [sessionMusicianRole, setSessionMusicianRole] = useState('');
  const [sessionMusicianURL, setSessionMusicianURL] = useState('');
  const [editingSessionMusicianIndex, setEditingSessionMusicianIndex] = useState<number | null>(
    null
  );
  const [addSessionMusicianName, setAddSessionMusicianName] = useState('');
  const [addSessionMusicianRole, setAddSessionMusicianRole] = useState('');
  const [addSessionMusicianURL, setAddSessionMusicianURL] = useState('');

  const [producerName, setProducerName] = useState('');
  const [producerRole, setProducerRole] = useState('');
  const [producerURL, setProducerURL] = useState('');
  const [editingProducerIndex, setEditingProducerIndex] = useState<number | null>(null);
  const [addProducerName, setAddProducerName] = useState('');
  const [addProducerRole, setAddProducerRole] = useState('');
  const [addProducerURL, setAddProducerURL] = useState('');

  const [addRecordedAtDraft, setAddRecordedAtDraft] = useState<RecordingFormDraft>(() =>
    emptyRecordingFormDraft()
  );
  const [addMixedAtDraft, setAddMixedAtDraft] = useState<RecordingFormDraft>(() =>
    emptyRecordingFormDraft()
  );
  const [addMasteringDraft, setAddMasteringDraft] = useState<RecordingFormDraft>(() =>
    emptyRecordingFormDraft()
  );
  /** Диалог «Есть несохранённые изменения. Перейти?» при смене режима редактирования. */
  const [blockSwitchDialog, setBlockSwitchDialog] = useState<{ onDiscard: () => void } | null>(
    null
  );
  const discardCloseFingerprintRef = useRef<string | null>(null);
  const popupRequestCloseRef = useRef<(() => void) | null>(null);
  const [discardCloseDialogOpen, setDiscardCloseDialogOpen] = useState(false);

  const [editingPurchaseLink, setEditingPurchaseLink] = useState<number | null>(null);
  const [purchaseLinkService, setPurchaseLinkService] = useState('');
  const [purchaseLinkUrl, setPurchaseLinkUrl] = useState('');

  const [editingStreamingLink, setEditingStreamingLink] = useState<number | null>(null);
  const [streamingLinkService, setStreamingLinkService] = useState('');
  const [streamingLinkUrl, setStreamingLinkUrl] = useState('');

  const [albumArtPreview, setAlbumArtPreview] = useState<string | null>(null);
  const [coverDraftKey, setCoverDraftKey] = useState<string | null>(null);

  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'uploaded' | 'error'>(
    'idle'
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title?: string;
    message: string;
    variant?: 'success' | 'error' | 'warning' | 'info';
  } | null>(null);

  /** Сообщение, если форма заполнена из другой локали / корня (как на display). */
  const [editLocaleFallbackNotice, setEditLocaleFallbackNotice] = useState<string | null>(null);

  const getProfileArtistName = (): string => {
    const fromSite = siteArtistDisplayName.trim();
    if (fromSite) return fromSite;
    const storedName = readStoredProfileDisplayName();
    if (storedName) return storedName;
    const authName = getUser()?.name?.trim();
    return authName || '';
  };

  // ========= FIX: objectURL lifecycle =========
  const localPreviewUrlRef = useRef<string | null>(null);

  const setLocalPreview = (file: File) => {
    if (localPreviewUrlRef.current) {
      URL.revokeObjectURL(localPreviewUrlRef.current);
    }
    const url = URL.createObjectURL(file);
    localPreviewUrlRef.current = url;
    setAlbumArtPreview(url);
  };

  useEffect(() => {
    return () => {
      if (localPreviewUrlRef.current) {
        URL.revokeObjectURL(localPreviewUrlRef.current);
        localPreviewUrlRef.current = null;
      }
    };
  }, []);
  // ===========================================

  // Упрощенный handleInputChange для совместимости со старым кодом
  const handleInputChange = (field: keyof AlbumFormData, value: any) => {
    if (field === 'allowDownloadSale' && !hasYooKassa) {
      return;
    }
    setFormData((prev) => ({ ...prev, [field]: value as never }));
    if (field === 'albumCoverDesigner') {
      setStep4InvalidFields((p) => p.filter((x) => x !== 'albumCoverDesigner'));
    }
    if (field === 'bandMembers') {
      setStep4InvalidFields((p) => p.filter((x) => x !== 'bandMembers'));
    }
    if (field === 'producer') {
      setStep4InvalidFields((p) => p.filter((x) => x !== 'producer'));
    }
  };

  useEffect(() => {
    setStep1InvalidFields((prev) =>
      prev.filter((f) => {
        if (f === 'regularPrice' && saleModeForValidation === 'no') return false;
        if (f === 'preorderReleaseDate' && saleModeForValidation !== 'preorder') return false;
        return true;
      })
    );
  }, [saleModeForValidation]);

  // Загружаем данные альбома при открытии модального окна
  useEffect(() => {
    // Сбрасываем флаг инициализации при закрытии модалки
    if (!isOpen) {
      didInitRef.current = false;
      return;
    }

    // Инициализируем только если еще не инициализировали
    if (didInitRef.current) {
      return;
    }

    if (!albumId) return;
    if (!albumsFromStore || !Array.isArray(albumsFromStore)) return;

    const album = albumsFromStore.find((a: IAlbums) => a && a.albumId === albumId);
    if (!album) return;

    // Устанавливаем флаг инициализации
    didInitRef.current = true;

    const titleResolved = resolveAlbumFieldForEdit(album, 'album', lang);
    albumTitleAtOpenRef.current = (titleResolved.value || '').trim();
    canonicalAlbumIdRef.current = album.albumId ?? '';
    const descriptionResolved = resolveAlbumFieldForEdit(album, 'description', lang);
    const photographerResolved = resolveAlbumCoverCreditFieldForEdit(album, 'photographer', lang);
    const photographerURLResolved = resolveAlbumCoverCreditFieldForEdit(
      album,
      'photographerURL',
      lang
    );
    const designerResolved = resolveAlbumCoverCreditFieldForEdit(album, 'designer', lang);
    const designerURLResolved = resolveAlbumCoverCreditFieldForEdit(album, 'designerURL', lang);
    const detailsResolved = getAlbumDetailsForEdit(album, lang);

    const fallbackSources = collectAlbumEditFallbackSources([
      titleResolved,
      descriptionResolved,
      photographerResolved,
      photographerURLResolved,
      designerResolved,
      designerURLResolved,
      ...detailsResolved.blocksMeta.map((meta) => ({
        isFallback: meta.isFallback,
        source: meta.source,
      })),
    ]);
    setEditLocaleFallbackNotice(buildTranslatedContentEditFallbackNotice(fallbackSources, lang));

    // Парсим details, если это строка (JSONB из базы может приходить как строка)
    // ДОЛЖНО БЫТЬ ПЕРЕД ВСЕМИ ПАРСИНГАМИ!
    let parsedDetails: unknown = detailsResolved.details;
    if (typeof parsedDetails === 'string') {
      try {
        parsedDetails = JSON.parse(parsedDetails);
      } catch (e) {
        console.error('[EditAlbumModal] Error parsing details:', e);
        parsedDetails = [];
      }
    }

    // --- парсинг band members ---
    const bandMembers: BandMember[] = [];
    const bandMembersDetail = Array.isArray(parsedDetails)
      ? parsedDetails.find(
          (detail) =>
            detail &&
            (detail.title === 'Band members' ||
              detail.title === 'Участники группы' ||
              detail.title === 'Исполнители')
        )
      : null;

    if (bandMembersDetail && (bandMembersDetail as any).content) {
      for (const item of (bandMembersDetail as any).content) {
        const parsed = parseBandMemberFromContentItem(item);
        if (parsed) bandMembers.push(parsed);
      }
    }

    // --- парсинг session musicians ---
    const sessionMusicians: BandMember[] = [];
    const sessionMusiciansDetail = Array.isArray(parsedDetails)
      ? parsedDetails.find(
          (detail) =>
            detail &&
            (detail.title === 'Session musicians' ||
              detail.title === 'Сессионные музыканты' ||
              detail.title === 'Session Musicians')
        )
      : null;

    if (sessionMusiciansDetail && (sessionMusiciansDetail as any).content) {
      for (const item of (sessionMusiciansDetail as any).content) {
        const parsed = parseBandMemberFromContentItem(item);
        if (parsed) sessionMusicians.push(parsed);
      }
    }

    // --- Genre: `release.genreCodes` (канон); иначе legacy-блок в details ---
    const genreCodes: string[] = [];
    const releaseForGenre =
      album.release && typeof album.release === 'object'
        ? (album.release as Record<string, unknown>)
        : {};
    const codesFromRelease = releaseForGenre.genreCodes;
    if (Array.isArray(codesFromRelease)) {
      for (const c of codesFromRelease) {
        if (typeof c === 'string' && c.trim() && !genreCodes.includes(c.trim())) {
          genreCodes.push(c.trim());
        }
      }
    }

    const genreDetail = Array.isArray(parsedDetails)
      ? parsedDetails.find(
          (detail) =>
            detail &&
            (detail.title === 'Genre' ||
              detail.title === 'Genres' ||
              detail.title === 'Жанр' ||
              detail.title === 'Жанры')
        )
      : null;

    if (genreCodes.length === 0 && genreDetail && (genreDetail as any).content) {
      // Обрабатываем content - новый формат: массив строк в нижнем регистре ["grunge", "alternative rock"]
      // Поддерживаем обратную совместимость со старым форматом (строка с запятыми)
      const content = (genreDetail as any).content;

      if (Array.isArray(content)) {
        content.forEach((item: unknown) => {
          if (typeof item !== 'string' || !item.trim()) return;

          const genreLower = item.toLowerCase().trim();

          // Поддерживаем старый формат: "Grunge, alternative rock." (строка с запятыми и точкой)
          if (genreLower.includes(',')) {
            // Старый формат - разбиваем по запятым
            const parsedGenres = genreLower
              .split(',')
              .map((g: string) => g.trim().replace(/\.$/, ''))
              .filter((g: string) => g.length > 0);

            parsedGenres.forEach((parsedGenre: string) => {
              const matchedOption = GENRE_OPTIONS.find((option) => {
                const en = option.label.en.toLowerCase();
                const ru = option.label.ru.toLowerCase();
                return (
                  parsedGenre === option.code ||
                  en === parsedGenre ||
                  ru === parsedGenre ||
                  en.replace(/\s+/g, ' ') === parsedGenre.replace(/\s+/g, ' ') ||
                  ru.replace(/\s+/g, ' ') === parsedGenre.replace(/\s+/g, ' ')
                );
              });

              const finalCode = matchedOption?.code;
              if (finalCode && !genreCodes.includes(finalCode)) {
                genreCodes.push(finalCode);
              }
            });
          } else {
            // Новый формат - один элемент массива это строка с жанрами через запятую и точкой в конце
            // Например: "Grunge, alternative rock." или "Grunge."
            // Разбиваем по запятым, убираем точку в конце
            const genreWithoutDot = genreLower.replace(/\.$/, '').trim();
            const parsedGenres = genreWithoutDot
              .split(',')
              .map((g: string) => g.trim())
              .filter((g: string) => g.length > 0);

            parsedGenres.forEach((parsedGenre: string) => {
              const matchedOption = GENRE_OPTIONS.find((option) => {
                const en = option.label.en.toLowerCase();
                const ru = option.label.ru.toLowerCase();
                return (
                  parsedGenre === option.code ||
                  en === parsedGenre ||
                  ru === parsedGenre ||
                  en.replace(/\s+/g, ' ') === parsedGenre.replace(/\s+/g, ' ') ||
                  ru.replace(/\s+/g, ' ') === parsedGenre.replace(/\s+/g, ' ')
                );
              });

              const finalCode = matchedOption?.code;
              if (finalCode && !genreCodes.includes(finalCode)) {
                genreCodes.push(finalCode);
              }
            });
          }
        });
      }
    }

    // --- парсинг Recorded At ---
    const recordedAt: RecordingEntry[] = [];
    const recordedAtDetail = Array.isArray(parsedDetails)
      ? parsedDetails.find(
          (detail) => detail && (detail.title === 'Recorded At' || detail.title === 'Запись')
        )
      : null;

    if (recordedAtDetail && (recordedAtDetail as any).content) {
      for (const item of (recordedAtDetail as any).content) {
        const parsed = parseRecordingEntryFromContentItem(item, lang);
        if (parsed) recordedAt.push(parsed);
      }
    }

    // --- парсинг Mixed At ---
    const mixedAt: RecordingEntry[] = [];
    const mixedAtDetail = Array.isArray(parsedDetails)
      ? parsedDetails.find(
          (detail) => detail && (detail.title === 'Mixed At' || detail.title === 'Сведение')
        )
      : null;

    if (mixedAtDetail && (mixedAtDetail as any).content) {
      for (const item of (mixedAtDetail as any).content) {
        const parsed = parseRecordingEntryFromContentItem(item, lang);
        if (parsed) mixedAt.push(parsed);
      }
    }

    // --- парсинг Producer ---
    const producer: BandMember[] = [];
    const producingDetail = Array.isArray(parsedDetails)
      ? parsedDetails.find(
          (detail) =>
            detail &&
            (detail.title === 'Producing' ||
              detail.title === 'Продюсирование' ||
              detail.title === 'Продюсер')
        )
      : null;

    if (producingDetail && (producingDetail as any).content) {
      for (const item of (producingDetail as any).content) {
        const parsed = parseProducerFromContentItem(item);
        if (parsed) producer.push(parsed);
      }
    }

    // --- парсинг Mastered By ---
    const mastering: RecordingEntry[] = [];

    // Ищем отдельный блок "Mastered By" / "Мастеринг"
    const masteredByDetail = Array.isArray(parsedDetails)
      ? parsedDetails.find(
          (detail) => detail && (detail.title === 'Mastered By' || detail.title === 'Мастеринг')
        )
      : null;

    if (masteredByDetail && (masteredByDetail as any).content) {
      for (const item of (masteredByDetail as any).content) {
        const parsed = parseRecordingEntryFromContentItem(item, lang);
        if (parsed) mastering.push(parsed);
      }
    }

    // Заполняем поля из данных альбома (только при первой инициализации)
    let mergedDiscardBaselineForm: AlbumFormData | undefined;
    setFormData((prevForm) => {
      const release = album.release && typeof album.release === 'object' ? album.release : {};
      // Конвертируем дату из ISO формата (YYYY-MM-DD) в формат для отображения (DD/MM/YYYY)
      const releaseDateISO = (release as any).date || '';
      const releaseDate = releaseDateISO ? formatDateFromISO(releaseDateISO) : '';
      const upc = (release as any).UPC || '';

      const tagsFromRelease = Array.isArray((release as any).tags)
        ? ((release as any).tags as unknown[])
            .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
            .map((t) => t.trim())
        : [];

      const purchaseLinks: StreamingLink[] = (() => {
        const links: StreamingLink[] = [];
        if (album.buttons && typeof album.buttons === 'object') {
          const purchaseMap: Record<string, string> = {
            itunes: 'apple',
            bandcamp: 'bandcamp',
            amazon: 'amazon',
          };

          for (const [key, url] of Object.entries(album.buttons as Record<string, unknown>)) {
            const serviceId = purchaseMap[key.toLowerCase()];
            if (serviceId && typeof url === 'string' && url.trim()) {
              links.push({ service: serviceId, url: url.trim() });
            }
          }
        }
        return links;
      })();

      const streamingLinks: StreamingLink[] = (() => {
        const links: StreamingLink[] = [];
        if (album.buttons && typeof album.buttons === 'object') {
          const streamingMap: Record<string, string> = {
            apple: 'applemusic',
            vk: 'vk',
            youtube: 'youtube',
            spotify: 'spotify',
            yandex: 'yandex',
            deezer: 'deezer',
            tidal: 'tidal',
            applemusic: 'applemusic',
            googleplay: 'googleplay',
          };

          for (const [key, url] of Object.entries(album.buttons as Record<string, unknown>)) {
            const serviceId = streamingMap[key.toLowerCase()];
            if (serviceId && typeof url === 'string' && url.trim()) {
              links.push({ service: serviceId, url: url.trim() });
            }
          }
        }
        return links;
      })();

      const next: AlbumFormData = {
        ...prevForm,
        title: titleResolved.value || prevForm.title,
        releaseDate: releaseDate || prevForm.releaseDate,
        upcEan: upc || prevForm.upcEan,
        description: descriptionResolved.value || prevForm.description,
        genreCodes: genreCodes.length > 0 ? genreCodes : prevForm.genreCodes || [],
        allowDownloadSale:
          ((release as any).allowDownloadSale as 'no' | 'yes' | 'preorder') ||
          prevForm.allowDownloadSale ||
          'no',
        regularPrice: (release as any).regularPrice || prevForm.regularPrice || '9.99',
        currency: (release as any).currency || prevForm.currency || 'USD',
        preorderReleaseDate: (release as any).preorderReleaseDate
          ? formatDateFromISO((release as any).preorderReleaseDate)
          : prevForm.preorderReleaseDate || '',
        // Пустая строка — валидное «очищено в этой локали»; не подставлять prevForm через `||`.
        albumCoverPhotographer: photographerResolved.value,
        albumCoverPhotographerURL: photographerURLResolved.value,
        albumCoverDesigner: designerResolved.value,
        albumCoverDesignerURL: designerURLResolved.value,
        bandMembers: bandMembers.length > 0 ? bandMembers : prevForm.bandMembers,
        sessionMusicians:
          sessionMusicians.length > 0 ? sessionMusicians : prevForm.sessionMusicians,
        producingCredits: prevForm.producingCredits, // Оставляем для обратной совместимости, но больше не используем
        recordedAt: recordedAt,
        mixedAt: mixedAt,
        producer: producer.length > 0 ? producer : prevForm.producer || [],
        mastering: mastering.length > 0 ? mastering : prevForm.mastering || [],
        showAddBandMemberInputs: false,
        showAddSessionMusicianInputs: false,
        showAddRecordedAtInputs: false,
        showAddMixedAtInputs: false,
        showAddProducerInputs: false,
        showAddMasteringInputs: false,
        // Всегда брать распарсенные ссылки из альбома; при отсутствии ссылок в API — [] (не оставлять prevForm).
        purchaseLinks,
        streamingLinks,
        tags: tagsFromRelease.length > 0 ? tagsFromRelease : prevForm.tags || [],
      };

      mergedDiscardBaselineForm = next;
      return next;
    });

    discardCloseFingerprintRef.current = mergedDiscardBaselineForm
      ? buildAlbumDiscardFingerprint(mergedDiscardBaselineForm, 1, makeEmptyDiscardAuxBaseline())
      : null;

    // Показываем существующую обложку
    const coverName =
      typeof (album as any).cover === 'string'
        ? (album as any).cover
        : (album as any).cover && typeof (album as any).cover === 'object'
          ? (album as any).cover.img
          : null;

    if (coverName) {
      const stripExt = (s: string) => s.replace(/\.(webp|jpg|jpeg|png)$/i, '');
      const base = getAlbumStorageBaseName(stripExt(coverName));
      const storageUserId = album.userId ?? getUser()?.id ?? null;
      if (!storageUserId) {
        console.error('[BUG] album.userId missing', {
          albumId: album.albumId,
          context: 'editAlbumModalCoverPreview',
        });
      } else {
        const coverUrl = getUserImageUrl(`${base}-448`, 'albums', '.webp', false, storageUserId);
        if (coverUrl) {
          setAlbumArtPreview(`${coverUrl}${coverUrl.includes('?') ? '&' : '?'}v=${Date.now()}`);
        }
      }
    }
    // ВАЖНО: Инициализация происходит только один раз
  }, [isOpen, albumId, lang, albumsFromStore]);

  useEffect(() => {
    if (!isOpen || albumId) return;
    discardCloseFingerprintRef.current = buildAlbumDiscardFingerprint(
      makeEmptyForm(),
      1,
      makeEmptyDiscardAuxBaseline()
    );
  }, [isOpen, albumId]);

  useEffect(() => {
    if (isOpen && !albumId) {
      albumTitleAtOpenRef.current = '';
      canonicalAlbumIdRef.current = '';
    }
  }, [isOpen, albumId]);

  // Сбрасываем форму при закрытии модального окна
  useEffect(() => {
    if (isOpen) return;

    setFormData(makeEmptyForm());
    discardCloseFingerprintRef.current = null;
    setDiscardCloseDialogOpen(false);

    albumTitleAtOpenRef.current = '';
    canonicalAlbumIdRef.current = '';

    setCurrentStep(1);

    setStep1InvalidFields([]);
    setStep2GenreRequired(false);
    setStep4InvalidFields([]);

    setAlbumArtPreview(null);
    setCoverDraftKey(null);
    setUploadProgress(0);
    setUploadStatus('idle');
    setUploadError(null);

    setDragActive(false);
    setGenreDropdownOpen(false);
    setTagInput('');
    setTagError('');
    setBandMemberName('');
    setBandMemberRole('');
    setBandMemberURL('');
    setEditingBandMemberIndex(null);
    setAddBandMemberName('');
    setAddBandMemberRole('');
    setAddBandMemberURL('');
    setSessionMusicianName('');
    setSessionMusicianRole('');
    setSessionMusicianURL('');
    setEditingSessionMusicianIndex(null);
    setAddSessionMusicianName('');
    setAddSessionMusicianRole('');
    setAddSessionMusicianURL('');
    setProducerName('');
    setProducerRole('');
    setProducerURL('');
    setEditingProducerIndex(null);
    setAddProducerName('');
    setAddProducerRole('');
    setAddProducerURL('');
    setAddRecordedAtDraft(emptyRecordingFormDraft());
    setAddMixedAtDraft(emptyRecordingFormDraft());
    setAddMasteringDraft(emptyRecordingFormDraft());
    setBlockSwitchDialog(null);
    setEditingPurchaseLink(null);
    setPurchaseLinkService('');
    setPurchaseLinkUrl('');
    setEditingStreamingLink(null);
    setStreamingLinkService('');
    setStreamingLinkUrl('');
    setEditLocaleFallbackNotice(null);

    if (localPreviewUrlRef.current) {
      URL.revokeObjectURL(localPreviewUrlRef.current);
      localPreviewUrlRef.current = null;
    }
  }, [isOpen]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) await handleFileUpload(file);
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await handleFileUpload(file);
  };

  const handleFileUpload = async (file: File | null) => {
    if (!file) return;

    // Защита от двойного вызова
    if (uploadStatus === 'uploading') {
      return;
    }

    try {
      // сохраняем в форме (если где-то ещё используется)
      handleInputChange('albumArt', file);

      // сброс
      setUploadProgress(0);
      setUploadStatus('uploading');
      setUploadError(null);
      setCoverDraftKey(null);

      // локальное превью (не течёт)
      setLocalPreview(file);

      const albumData = albumId
        ? albumsFromStore.find((a: IAlbums) => a.albumId === albumId)
        : null;

      // Получаем оригинальный альбом для fallback значений
      const originalAlbum = albumId
        ? albumsFromStore.find((a: IAlbums) => a.albumId === albumId)
        : null;

      // Подготавливаем параметры для uploadCoverDraft (имя — из профиля site_name, не albums.artist)
      const uploadArtist = getProfileArtistName().trim();
      const uploadAlbum = formData.title || albumData?.album || originalAlbum?.album || '';
      const uploadAlbumId = albumId || undefined;

      const result = await uploadCoverDraft(
        file,
        uploadAlbumId,
        uploadArtist || undefined,
        uploadAlbum || undefined,
        (progress) => setUploadProgress(progress)
      );

      if (result.success && result.data) {
        setCoverDraftKey(result.data.draftKey);
        setStep1InvalidFields((prev) => prev.filter((field) => field !== 'cover'));

        // освобождаем objectURL
        if (localPreviewUrlRef.current) {
          URL.revokeObjectURL(localPreviewUrlRef.current);
          localPreviewUrlRef.current = null;
        }

        const url = result.data.url;
        setAlbumArtPreview(`${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`);
        setUploadStatus('uploaded');
      } else if (!result.success) {
        setUploadStatus('error');
        setUploadError(result.error || 'Failed to upload cover');
      }
    } catch (error) {
      console.error('Error uploading cover draft:', error);
      setUploadStatus('error');
      setUploadError(error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes || Number.isNaN(bytes)) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** exponent;
    return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
  };

  // Закрытие dropdown при клике вне него
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (genreDropdownRef.current && !genreDropdownRef.current.contains(event.target as Node)) {
        setGenreDropdownOpen(false);
      }
    };

    if (genreDropdownOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [genreDropdownOpen]);

  const handleGenreToggle = (genreCode: string) => {
    setStep2GenreRequired(false);
    setFormData((prev) => {
      const currentGenreCodes = prev.genreCodes || [];
      if (currentGenreCodes.includes(genreCode)) {
        return { ...prev, genreCodes: currentGenreCodes.filter((c) => c !== genreCode) };
      }
      return { ...prev, genreCodes: [...currentGenreCodes, genreCode] };
    });
  };

  const handleRemoveGenre = (genreCode: string) => {
    setStep2GenreRequired(false);
    setFormData((prev) => ({
      ...prev,
      genreCodes: (prev.genreCodes || []).filter((c) => c !== genreCode),
    }));
  };

  const validateTag = (tag: string): string | null => {
    const trimmedTag = tag.trim();
    if (!trimmedTag) return 'Tag cannot be empty';
    if (trimmedTag.length < MIN_TAG_LENGTH)
      return `Tag must be at least ${MIN_TAG_LENGTH} characters`;
    if (trimmedTag.length > MAX_TAG_LENGTH)
      return `Tag must be no more than ${MAX_TAG_LENGTH} characters`;

    const tagWithoutHash = trimmedTag.startsWith('#') ? trimmedTag.slice(1) : trimmedTag;
    if (tagWithoutHash.length < MIN_TAG_LENGTH) {
      return `Tag must be at least ${MIN_TAG_LENGTH} characters (without #)`;
    }

    const normalizedTag = `#${tagWithoutHash.toLowerCase()}`;
    if (formData.tags.includes(normalizedTag)) return 'This tag already exists';
    if (formData.tags.length >= MAX_TAGS) return `Maximum ${MAX_TAGS} tags allowed`;
    return null;
  };

  const handleAddTag = () => {
    const error = validateTag(tagInput);
    if (error) {
      setTagError(error);
      return;
    }

    const trimmed = tagInput.trim();
    const tagWithoutHash = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
    const normalizedTag = `#${tagWithoutHash.toLowerCase()}`;

    setFormData((prev) => ({ ...prev, tags: [...(prev.tags || []), normalizedTag] }));
    setTagInput('');
    setTagError('');
    tagInputRef.current?.focus();
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData((prev) => ({ ...prev, tags: (prev.tags || []).filter((t) => t !== tag) }));
  };

  /**
   * Переключение редактирования (шаги 3–4: списки строк).
   * У текущего поля проверяем dirty: нет изменений → переключаемся сразу; есть → `blockSwitchDialog`.
   * Кнопки ✎ на строках не отключаем — переход не запрещаем, а согласовываем с потерей данных.
   * Диалог переключения (`blockSwitchDialog`) должен рендериться внутри `<Popup>`/`<dialog>`, иначе оверлей окажется под top layer и не будет виден.
   * Отдельно: «+ Add» в Step3/Step4 может быть `disabled`, пока открыто другое добавление/редактирование.
   */
  const executeEditBandMember = (index: number) => {
    const member = formData.bandMembers[index];
    setBandMemberName(member.name);
    setBandMemberRole(member.role);
    setBandMemberURL(member.url || '');
    setEditingBandMemberIndex(index);
  };

  const handleEditBandMember = (index: number) => {
    if (editingBandMemberIndex === index) return;

    if (formData.showAddBandMemberInputs) {
      const addDirty = bandMemberEditHasChanges(
        EMPTY_BAND_MEMBER,
        addBandMemberName,
        addBandMemberRole,
        addBandMemberURL
      );
      if (addDirty) {
        setBlockSwitchDialog({
          onDiscard: () => {
            setAddBandMemberName('');
            setAddBandMemberRole('');
            setAddBandMemberURL('');
            handleInputChange('showAddBandMemberInputs', false);
            executeEditBandMember(index);
          },
        });
        return;
      }
      setAddBandMemberName('');
      setAddBandMemberRole('');
      setAddBandMemberURL('');
      handleInputChange('showAddBandMemberInputs', false);
      executeEditBandMember(index);
      return;
    }

    if (editingBandMemberIndex !== null && editingBandMemberIndex !== index) {
      const member = formData.bandMembers[editingBandMemberIndex];
      if (bandMemberEditHasChanges(member, bandMemberName, bandMemberRole, bandMemberURL)) {
        setBlockSwitchDialog({
          onDiscard: () => {
            executeEditBandMember(index);
          },
        });
        return;
      }
    }

    executeEditBandMember(index);
  };

  const handleAddBandMember = () => {
    if (editingBandMemberIndex !== null) {
      if (!bandMemberName.trim() || !bandMemberRole.trim()) return;
      const url =
        bandMemberURL?.trim() && bandMemberURL.trim().length > 0 ? bandMemberURL.trim() : undefined;
      setFormData((prev) => {
        const updated = [...(prev.bandMembers || [])];
        updated[editingBandMemberIndex] = updateBandMemberPreservingId(
          prev.bandMembers[editingBandMemberIndex],
          {
            name: bandMemberName.trim(),
            role: bandMemberRole.trim(),
            url,
          }
        );
        if (updated.length > 0) setStep4InvalidFields((p) => p.filter((x) => x !== 'bandMembers'));
        return { ...prev, bandMembers: updated };
      });
      setEditingBandMemberIndex(null);
      setBandMemberName('');
      setBandMemberRole('');
      setBandMemberURL('');
      return;
    }
    if (!addBandMemberName.trim() || !addBandMemberRole.trim()) return;
    const url =
      addBandMemberURL?.trim() && addBandMemberURL.trim().length > 0
        ? addBandMemberURL.trim()
        : undefined;
    setFormData((prev) => ({
      ...prev,
      bandMembers: [
        ...(prev.bandMembers || []),
        createBandMember({ name: addBandMemberName.trim(), role: addBandMemberRole.trim(), url }),
      ],
      showAddBandMemberInputs: false,
    }));
    setStep4InvalidFields((p) => p.filter((x) => x !== 'bandMembers'));
    setAddBandMemberName('');
    setAddBandMemberRole('');
    setAddBandMemberURL('');
  };

  const handleCancelEditBandMember = () => {
    if (editingBandMemberIndex !== null) {
      setBandMemberName('');
      setBandMemberRole('');
      setBandMemberURL('');
      setEditingBandMemberIndex(null);
      return;
    }
    setAddBandMemberName('');
    setAddBandMemberRole('');
    setAddBandMemberURL('');
    handleInputChange('showAddBandMemberInputs', false);
  };

  const handleRemoveBandMember = (index: number) => {
    setFormData((prev) => {
      const bandMembers = (prev.bandMembers || []).filter((_, i) => i !== index);
      if (bandMembers.length > 0)
        setStep4InvalidFields((p) => p.filter((x) => x !== 'bandMembers'));
      return { ...prev, bandMembers };
    });
    if (editingBandMemberIndex === index) handleCancelEditBandMember();
  };

  const executeEditProducer = (index: number) => {
    const member = formData.producer[index];
    setProducerName(member.name);
    setProducerRole(member.role);
    setProducerURL(member.url || '');
    setEditingProducerIndex(index);
  };

  const handleEditProducer = (index: number) => {
    if (editingProducerIndex === index) return;

    if (formData.showAddProducerInputs) {
      const addDirty = bandMemberEditHasChanges(
        EMPTY_BAND_MEMBER,
        addProducerName,
        addProducerRole,
        addProducerURL
      );
      if (addDirty) {
        setBlockSwitchDialog({
          onDiscard: () => {
            setAddProducerName('');
            setAddProducerRole('');
            setAddProducerURL('');
            handleInputChange('showAddProducerInputs', false);
            executeEditProducer(index);
          },
        });
        return;
      }
      setAddProducerName('');
      setAddProducerRole('');
      setAddProducerURL('');
      handleInputChange('showAddProducerInputs', false);
      executeEditProducer(index);
      return;
    }

    if (editingProducerIndex !== null && editingProducerIndex !== index) {
      const member = formData.producer[editingProducerIndex];
      if (bandMemberEditHasChanges(member, producerName, producerRole, producerURL)) {
        setBlockSwitchDialog({
          onDiscard: () => {
            executeEditProducer(index);
          },
        });
        return;
      }
    }

    executeEditProducer(index);
  };

  const handleAddProducer = () => {
    if (editingProducerIndex !== null) {
      if (!producerName.trim() || !producerRole.trim()) return;
      const url =
        producerURL?.trim() && producerURL.trim().length > 0 ? producerURL.trim() : undefined;
      setFormData((prev) => {
        const updated = [...(prev.producer || [])];
        updated[editingProducerIndex] = updateBandMemberPreservingId(
          prev.producer[editingProducerIndex],
          {
            name: producerName.trim(),
            role: producerRole.trim(),
            url,
          }
        );
        if (updated.length > 0) setStep4InvalidFields((p) => p.filter((x) => x !== 'producer'));
        return { ...prev, producer: updated };
      });
      setEditingProducerIndex(null);
      setProducerName('');
      setProducerRole('');
      setProducerURL('');
      return;
    }
    if (!addProducerName.trim() || !addProducerRole.trim()) return;
    const url =
      addProducerURL?.trim() && addProducerURL.trim().length > 0
        ? addProducerURL.trim()
        : undefined;
    setFormData((prev) => ({
      ...prev,
      producer: [
        ...(prev.producer || []),
        createBandMember({ name: addProducerName.trim(), role: addProducerRole.trim(), url }),
      ],
      showAddProducerInputs: false,
    }));
    setStep4InvalidFields((p) => p.filter((x) => x !== 'producer'));
    setAddProducerName('');
    setAddProducerRole('');
    setAddProducerURL('');
  };

  const handleCancelEditProducer = () => {
    if (editingProducerIndex !== null) {
      setProducerName('');
      setProducerRole('');
      setProducerURL('');
      setEditingProducerIndex(null);
      return;
    }
    setAddProducerName('');
    setAddProducerRole('');
    setAddProducerURL('');
    handleInputChange('showAddProducerInputs', false);
  };

  const handleRemoveProducer = (index: number) => {
    setFormData((prev) => {
      const producer = (prev.producer || []).filter((_, i) => i !== index);
      if (producer.length > 0) setStep4InvalidFields((p) => p.filter((x) => x !== 'producer'));
      return { ...prev, producer };
    });
    if (editingProducerIndex === index) handleCancelEditProducer();
  };

  const executeEditSessionMusician = (index: number) => {
    const musician = formData.sessionMusicians[index];
    setSessionMusicianName(musician.name);
    setSessionMusicianRole(musician.role);
    setSessionMusicianURL(musician.url || '');
    setEditingSessionMusicianIndex(index);
  };

  const handleEditSessionMusician = (index: number) => {
    if (editingSessionMusicianIndex === index) return;

    if (formData.showAddSessionMusicianInputs) {
      const addDirty = bandMemberEditHasChanges(
        EMPTY_BAND_MEMBER,
        addSessionMusicianName,
        addSessionMusicianRole,
        addSessionMusicianURL
      );
      if (addDirty) {
        setBlockSwitchDialog({
          onDiscard: () => {
            setAddSessionMusicianName('');
            setAddSessionMusicianRole('');
            setAddSessionMusicianURL('');
            handleInputChange('showAddSessionMusicianInputs', false);
            executeEditSessionMusician(index);
          },
        });
        return;
      }
      setAddSessionMusicianName('');
      setAddSessionMusicianRole('');
      setAddSessionMusicianURL('');
      handleInputChange('showAddSessionMusicianInputs', false);
      executeEditSessionMusician(index);
      return;
    }

    if (editingSessionMusicianIndex !== null && editingSessionMusicianIndex !== index) {
      const member = formData.sessionMusicians[editingSessionMusicianIndex];
      if (
        bandMemberEditHasChanges(
          member,
          sessionMusicianName,
          sessionMusicianRole,
          sessionMusicianURL
        )
      ) {
        setBlockSwitchDialog({
          onDiscard: () => {
            executeEditSessionMusician(index);
          },
        });
        return;
      }
    }

    executeEditSessionMusician(index);
  };

  const handleAddSessionMusician = () => {
    if (editingSessionMusicianIndex !== null) {
      if (!sessionMusicianName.trim() || !sessionMusicianRole.trim()) return;
      const url =
        sessionMusicianURL?.trim() && sessionMusicianURL.trim().length > 0
          ? sessionMusicianURL.trim()
          : undefined;
      setFormData((prev) => {
        const updated = [...(prev.sessionMusicians || [])];
        updated[editingSessionMusicianIndex] = updateBandMemberPreservingId(
          prev.sessionMusicians[editingSessionMusicianIndex],
          {
            name: sessionMusicianName.trim(),
            role: sessionMusicianRole.trim(),
            url,
          }
        );
        return { ...prev, sessionMusicians: updated };
      });
      setEditingSessionMusicianIndex(null);
      setSessionMusicianName('');
      setSessionMusicianRole('');
      setSessionMusicianURL('');
      return;
    }
    if (!addSessionMusicianName.trim() || !addSessionMusicianRole.trim()) return;
    const url =
      addSessionMusicianURL?.trim() && addSessionMusicianURL.trim().length > 0
        ? addSessionMusicianURL.trim()
        : undefined;
    setFormData((prev) => ({
      ...prev,
      sessionMusicians: [
        ...(prev.sessionMusicians || []),
        createBandMember({
          name: addSessionMusicianName.trim(),
          role: addSessionMusicianRole.trim(),
          url,
        }),
      ],
      showAddSessionMusicianInputs: false,
    }));
    setAddSessionMusicianName('');
    setAddSessionMusicianRole('');
    setAddSessionMusicianURL('');
  };

  const handleCancelEditSessionMusician = () => {
    if (editingSessionMusicianIndex !== null) {
      setSessionMusicianName('');
      setSessionMusicianRole('');
      setSessionMusicianURL('');
      setEditingSessionMusicianIndex(null);
      return;
    }
    setAddSessionMusicianName('');
    setAddSessionMusicianRole('');
    setAddSessionMusicianURL('');
    handleInputChange('showAddSessionMusicianInputs', false);
  };

  const handleRemoveSessionMusician = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      sessionMusicians: (prev.sessionMusicians || []).filter((_, i) => i !== index),
    }));
    if (editingSessionMusicianIndex === index) handleCancelEditSessionMusician();
  };

  const executeEditRecordedAt = (index: number) => {
    setFormData((prev) => {
      const entry = prev.recordedAt[index];
      const parsed = entry.dateFrom ? {} : parseRecordingText(entry.text);
      return {
        ...prev,
        editingRecordedAtIndex: index,
        recordedAtDateFrom: entry.dateFrom || parsed.dateFrom || '',
        recordedAtDateTo: entry.dateTo || parsed.dateTo || '',
        recordedAtText: entry.studioText || parsed.studioText || '',
        recordedAtCity: entry.city || '',
        recordedAtURL: entry.url || '',
      };
    });
  };

  const handleRequestEditRecordedAt = (index: number) => {
    if (formData.editingRecordedAtIndex === index) return;

    if (formData.showAddRecordedAtInputs) {
      if (recordingFormDraftIsDirty(addRecordedAtDraft)) {
        setBlockSwitchDialog({
          onDiscard: () => {
            setAddRecordedAtDraft(emptyRecordingFormDraft());
            handleInputChange('showAddRecordedAtInputs', false);
            executeEditRecordedAt(index);
          },
        });
        return;
      }
      setAddRecordedAtDraft(emptyRecordingFormDraft());
      handleInputChange('showAddRecordedAtInputs', false);
      executeEditRecordedAt(index);
      return;
    }

    const curRecorded = formData.editingRecordedAtIndex;
    if (curRecorded != null && curRecorded !== index) {
      const entry = formData.recordedAt[curRecorded];
      const parsed = entry.dateFrom ? {} : parseRecordingText(entry.text);
      if (
        recordingEntryEditHasChanges(
          entry,
          parsed,
          formData.recordedAtDateFrom ?? '',
          formData.recordedAtDateTo ?? '',
          formData.recordedAtText ?? '',
          formData.recordedAtCity ?? '',
          formData.recordedAtURL ?? ''
        )
      ) {
        setBlockSwitchDialog({
          onDiscard: () => {
            executeEditRecordedAt(index);
          },
        });
        return;
      }
    }

    executeEditRecordedAt(index);
  };

  const handleSaveRecordedAtAdd = () => {
    if (!recordingFormDraftCanSave(addRecordedAtDraft)) return;
    const newEntry = buildRecordingEntryFromEditFields(addRecordedAtDraft, lang);
    setFormData((prev) => ({
      ...prev,
      recordedAt: [...prev.recordedAt, newEntry],
      showAddRecordedAtInputs: false,
    }));
    setAddRecordedAtDraft(emptyRecordingFormDraft());
  };

  const handleCancelRecordedAtAdd = () => {
    setAddRecordedAtDraft(emptyRecordingFormDraft());
    handleInputChange('showAddRecordedAtInputs', false);
  };

  const patchAddRecordedAtDraft = (patch: Partial<RecordingFormDraft>) => {
    setAddRecordedAtDraft((prev) => ({ ...prev, ...patch }));
  };

  const executeEditMixedAt = (index: number) => {
    setFormData((prev) => {
      const entry = prev.mixedAt[index];
      const parsed = entry.dateFrom ? {} : parseRecordingText(entry.text);
      return {
        ...prev,
        editingMixedAtIndex: index,
        mixedAtDateFrom: entry.dateFrom || parsed.dateFrom || '',
        mixedAtDateTo: entry.dateTo || parsed.dateTo || '',
        mixedAtText: entry.studioText || parsed.studioText || '',
        mixedAtCity: entry.city || '',
        mixedAtURL: entry.url || '',
      };
    });
  };

  const handleRequestEditMixedAt = (index: number) => {
    if (formData.editingMixedAtIndex === index) return;

    if (formData.showAddMixedAtInputs) {
      if (recordingFormDraftIsDirty(addMixedAtDraft)) {
        setBlockSwitchDialog({
          onDiscard: () => {
            setAddMixedAtDraft(emptyRecordingFormDraft());
            handleInputChange('showAddMixedAtInputs', false);
            executeEditMixedAt(index);
          },
        });
        return;
      }
      setAddMixedAtDraft(emptyRecordingFormDraft());
      handleInputChange('showAddMixedAtInputs', false);
      executeEditMixedAt(index);
      return;
    }

    const curMixed = formData.editingMixedAtIndex;
    if (curMixed != null && curMixed !== index) {
      const entry = formData.mixedAt[curMixed];
      const parsed = entry.dateFrom ? {} : parseRecordingText(entry.text);
      if (
        recordingEntryEditHasChanges(
          entry,
          parsed,
          formData.mixedAtDateFrom ?? '',
          formData.mixedAtDateTo ?? '',
          formData.mixedAtText ?? '',
          formData.mixedAtCity ?? '',
          formData.mixedAtURL ?? ''
        )
      ) {
        setBlockSwitchDialog({
          onDiscard: () => {
            executeEditMixedAt(index);
          },
        });
        return;
      }
    }

    executeEditMixedAt(index);
  };

  const handleSaveMixedAtAdd = () => {
    if (!recordingFormDraftCanSave(addMixedAtDraft)) return;
    const newEntry = buildRecordingEntryFromEditFields(addMixedAtDraft, lang);
    setFormData((prev) => ({
      ...prev,
      mixedAt: [...prev.mixedAt, newEntry],
      showAddMixedAtInputs: false,
    }));
    setAddMixedAtDraft(emptyRecordingFormDraft());
  };

  const handleCancelMixedAtAdd = () => {
    setAddMixedAtDraft(emptyRecordingFormDraft());
    handleInputChange('showAddMixedAtInputs', false);
  };

  const patchAddMixedAtDraft = (patch: Partial<RecordingFormDraft>) => {
    setAddMixedAtDraft((prev) => ({ ...prev, ...patch }));
  };

  const executeEditMastering = (index: number) => {
    setFormData((prev) => {
      const entry = prev.mastering[index];
      const parsed = entry.dateFrom ? {} : parseRecordingText(entry.text);
      return {
        ...prev,
        editingMasteringIndex: index,
        masteringDateFrom: entry.dateFrom || parsed.dateFrom || '',
        masteringDateTo: entry.dateTo || parsed.dateTo || '',
        masteringText: entry.studioText || parsed.studioText || '',
        masteringCity: entry.city || '',
        masteringURL: entry.url || '',
      };
    });
  };

  const handleRequestEditMastering = (index: number) => {
    if (formData.editingMasteringIndex === index) return;

    if (formData.showAddMasteringInputs) {
      if (recordingFormDraftIsDirty(addMasteringDraft)) {
        setBlockSwitchDialog({
          onDiscard: () => {
            setAddMasteringDraft(emptyRecordingFormDraft());
            handleInputChange('showAddMasteringInputs', false);
            executeEditMastering(index);
          },
        });
        return;
      }
      setAddMasteringDraft(emptyRecordingFormDraft());
      handleInputChange('showAddMasteringInputs', false);
      executeEditMastering(index);
      return;
    }

    const curMastering = formData.editingMasteringIndex;
    if (curMastering != null && curMastering !== index) {
      const entry = formData.mastering[curMastering];
      const parsed = entry.dateFrom ? {} : parseRecordingText(entry.text);
      if (
        recordingEntryEditHasChanges(
          entry,
          parsed,
          formData.masteringDateFrom ?? '',
          formData.masteringDateTo ?? '',
          formData.masteringText ?? '',
          formData.masteringCity ?? '',
          formData.masteringURL ?? ''
        )
      ) {
        setBlockSwitchDialog({
          onDiscard: () => {
            executeEditMastering(index);
          },
        });
        return;
      }
    }

    executeEditMastering(index);
  };

  const handleSaveMasteringAdd = () => {
    if (!recordingFormDraftCanSave(addMasteringDraft)) return;
    const newEntry = buildRecordingEntryFromEditFields(addMasteringDraft, lang);
    setFormData((prev) => ({
      ...prev,
      mastering: [...prev.mastering, newEntry],
      showAddMasteringInputs: false,
    }));
    setAddMasteringDraft(emptyRecordingFormDraft());
  };

  const handleCancelMasteringAdd = () => {
    setAddMasteringDraft(emptyRecordingFormDraft());
    handleInputChange('showAddMasteringInputs', false);
  };

  const patchAddMasteringDraft = (patch: Partial<RecordingFormDraft>) => {
    setAddMasteringDraft((prev) => ({ ...prev, ...patch }));
  };

  const handleAddPurchaseLink = () => {
    if (!purchaseLinkService.trim() || !purchaseLinkUrl.trim()) return;

    if (editingPurchaseLink !== null) {
      setFormData((prev) => {
        const links = [...prev.purchaseLinks];
        links[editingPurchaseLink] = {
          service: purchaseLinkService.trim(),
          url: purchaseLinkUrl.trim(),
        };
        return { ...prev, purchaseLinks: links };
      });
      setEditingPurchaseLink(null);
    } else {
      setFormData((prev) => ({
        ...prev,
        purchaseLinks: [
          ...prev.purchaseLinks,
          { service: purchaseLinkService.trim(), url: purchaseLinkUrl.trim() },
        ],
      }));
    }

    setPurchaseLinkService('');
    setPurchaseLinkUrl('');
  };

  const executeEditPurchaseLink = (index: number) => {
    const link = formData.purchaseLinks[index];
    setPurchaseLinkService(link.service);
    setPurchaseLinkUrl(link.url);
    setEditingPurchaseLink(index);
  };

  const handleEditPurchaseLink = (index: number) => {
    if (editingPurchaseLink === index) return;

    if (editingStreamingLink !== null) {
      const saved = formData.streamingLinks[editingStreamingLink];
      if (linkEditHasChanges(saved, streamingLinkService, streamingLinkUrl)) {
        setBlockSwitchDialog({
          onDiscard: () => {
            setStreamingLinkService('');
            setStreamingLinkUrl('');
            setEditingStreamingLink(null);
            executeEditPurchaseLink(index);
          },
        });
        return;
      }
    }

    if (editingStreamingLink === null) {
      if (linkEditHasChanges(EMPTY_LINK, streamingLinkService, streamingLinkUrl)) {
        setBlockSwitchDialog({
          onDiscard: () => {
            setStreamingLinkService('');
            setStreamingLinkUrl('');
            executeEditPurchaseLink(index);
          },
        });
        return;
      }
    }

    if (editingPurchaseLink === null) {
      if (linkEditHasChanges(EMPTY_LINK, purchaseLinkService, purchaseLinkUrl)) {
        setBlockSwitchDialog({
          onDiscard: () => {
            setPurchaseLinkService('');
            setPurchaseLinkUrl('');
            executeEditPurchaseLink(index);
          },
        });
        return;
      }
    }

    if (editingPurchaseLink !== null && editingPurchaseLink !== index) {
      const saved = formData.purchaseLinks[editingPurchaseLink];
      if (linkEditHasChanges(saved, purchaseLinkService, purchaseLinkUrl)) {
        setBlockSwitchDialog({
          onDiscard: () => {
            executeEditPurchaseLink(index);
          },
        });
        return;
      }
    }

    executeEditPurchaseLink(index);
  };

  const handleCancelEditPurchaseLink = () => {
    setPurchaseLinkService('');
    setPurchaseLinkUrl('');
    setEditingPurchaseLink(null);
  };

  const handleRemovePurchaseLink = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      purchaseLinks: prev.purchaseLinks.filter((_, i) => i !== index),
    }));
    if (editingPurchaseLink === index) handleCancelEditPurchaseLink();
  };

  const handleAddStreamingLink = () => {
    if (!streamingLinkService.trim() || !streamingLinkUrl.trim()) return;

    if (editingStreamingLink !== null) {
      setFormData((prev) => {
        const links = [...prev.streamingLinks];
        links[editingStreamingLink] = {
          service: streamingLinkService.trim(),
          url: streamingLinkUrl.trim(),
        };
        return { ...prev, streamingLinks: links };
      });
      setEditingStreamingLink(null);
    } else {
      setFormData((prev) => ({
        ...prev,
        streamingLinks: [
          ...prev.streamingLinks,
          { service: streamingLinkService.trim(), url: streamingLinkUrl.trim() },
        ],
      }));
    }

    setStreamingLinkService('');
    setStreamingLinkUrl('');
  };

  const executeEditStreamingLink = (index: number) => {
    const link = formData.streamingLinks[index];
    setStreamingLinkService(link.service);
    setStreamingLinkUrl(link.url);
    setEditingStreamingLink(index);
  };

  const handleEditStreamingLink = (index: number) => {
    if (editingStreamingLink === index) return;

    if (editingPurchaseLink !== null) {
      const saved = formData.purchaseLinks[editingPurchaseLink];
      if (linkEditHasChanges(saved, purchaseLinkService, purchaseLinkUrl)) {
        setBlockSwitchDialog({
          onDiscard: () => {
            setPurchaseLinkService('');
            setPurchaseLinkUrl('');
            setEditingPurchaseLink(null);
            executeEditStreamingLink(index);
          },
        });
        return;
      }
    }

    if (editingPurchaseLink === null) {
      if (linkEditHasChanges(EMPTY_LINK, purchaseLinkService, purchaseLinkUrl)) {
        setBlockSwitchDialog({
          onDiscard: () => {
            setPurchaseLinkService('');
            setPurchaseLinkUrl('');
            executeEditStreamingLink(index);
          },
        });
        return;
      }
    }

    if (editingStreamingLink === null) {
      if (linkEditHasChanges(EMPTY_LINK, streamingLinkService, streamingLinkUrl)) {
        setBlockSwitchDialog({
          onDiscard: () => {
            setStreamingLinkService('');
            setStreamingLinkUrl('');
            executeEditStreamingLink(index);
          },
        });
        return;
      }
    }

    if (editingStreamingLink !== null && editingStreamingLink !== index) {
      const saved = formData.streamingLinks[editingStreamingLink];
      if (linkEditHasChanges(saved, streamingLinkService, streamingLinkUrl)) {
        setBlockSwitchDialog({
          onDiscard: () => {
            executeEditStreamingLink(index);
          },
        });
        return;
      }
    }

    executeEditStreamingLink(index);
  };

  const handleCancelEditStreamingLink = () => {
    setStreamingLinkService('');
    setStreamingLinkUrl('');
    setEditingStreamingLink(null);
  };

  const handleRemoveStreamingLink = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      streamingLinks: prev.streamingLinks.filter((_, i) => i !== index),
    }));
    if (editingStreamingLink === index) handleCancelEditStreamingLink();
  };

  // Валидация полей для каждого шага

  const handleNext = () => {
    if (isSaving) return;

    if (currentStep === 1) {
      const invalid = getAlbumStep1InvalidFields(formData, {
        effectiveAllowDownloadSale: saleModeForValidation,
        cover: { albumArtPreview, coverDraftKey },
      });
      setStep1InvalidFields(invalid);
      if (invalid.length > 0) {
        scrollToFirstAlbumStep1InvalidField(invalid, editAlbumModalCardRef.current);
        return;
      }
    } else if (currentStep === 2) {
      if (!isAlbumStep2GenreValid(formData)) {
        setStep2GenreRequired(true);
        scrollToAlbumStep2GenreField(editAlbumModalCardRef.current);
        return;
      }
      setStep2GenreRequired(false);
    } else if (currentStep === 4) {
      const invalid = getAlbumStep4InvalidFields(formData);
      setStep4InvalidFields(invalid);
      if (invalid.length > 0) {
        scrollToFirstAlbumStep4InvalidField(invalid, editAlbumModalCardRef.current);
        return;
      }
    }

    if (currentStep < 5) {
      setCurrentStep((s) => s + 1);
    } else if (currentStep === 5) {
      handlePublish();
    }
  };

  const handlePrevious = () => {
    if (isSaving) return;
    if (currentStep > 1) setCurrentStep((s) => s - 1);
  };

  const handlePublish = async () => {
    console.log('🚀 [EditAlbumModal] handlePublish called', {
      albumId,
      hasAlbumId: !!albumId,
      lang,
      albumsFromStoreLength: albumsFromStore.length,
    });

    const profileArtistName = getProfileArtistName();
    const effectiveArtistName = profileArtistName.trim();

    // Новый альбом: генерируем albumId из названия. Существующий: при смене названия — новый slug + previousAlbumId.
    let finalAlbumId: string;
    let previousAlbumIdForApi: string | undefined;
    /** Id для поиска альбома в store (slug до смены в этом запросе). */
    let lookupAlbumId: string;

    if (!albumId) {
      if (!formData.title) {
        setAlertModal({
          isOpen: true,
          title: 'Ошибка',
          message: 'Ошибка: для создания нового альбома необходимо заполнить поле "Album title".',
          variant: 'error',
        });
        setIsSaving(false);
        return;
      }

      finalAlbumId = generateAlbumIdFromTitle(formData.title);
      lookupAlbumId = finalAlbumId;
      console.log('🆕 [EditAlbumModal] Generated albumId for new album:', {
        title: formData.title,
        generatedAlbumId: finalAlbumId,
      });
    } else {
      const idProp = albumId;
      // Текущий slug в БД: store и ref после переименования надёжнее, чем один только проп.
      const slugFromStore =
        albumsFromStore.find((a) => a.albumId === idProp)?.albumId ??
        albumsFromStore.find((a) => a.albumId === canonicalAlbumIdRef.current)?.albumId;
      const slugBeforeRename = (slugFromStore ?? canonicalAlbumIdRef.current) || idProp;
      finalAlbumId = slugBeforeRename;
      lookupAlbumId = slugBeforeRename;

      const titleAtOpen = albumTitleAtOpenRef.current;
      const currentTitle = (formData.title || '').trim();
      if (currentTitle !== titleAtOpen) {
        const candidateId = generateAlbumIdFromTitle(formData.title);
        if (candidateId && candidateId !== finalAlbumId) {
          previousAlbumIdForApi = finalAlbumId;
          finalAlbumId = candidateId;
        }
      }
    }

    // Проверяем, существует ли версия языка для этого альбома (по id в store, до смены slug)
    const originalAlbum = albumsFromStore.find((a: IAlbums) => a.albumId === lookupAlbumId);
    const exists = !!originalAlbum;
    const method = exists ? 'PUT' : 'POST';

    console.log('📋 [EditAlbumModal] Album version check:', {
      originalAlbumId: albumId,
      finalAlbumId,
      lang,
      exists,
      method,
    });

    // Если версии нет, нужен хотя бы минимальный набор данных для создания
    if (!exists && !formData.title) {
      setAlertModal({
        isOpen: true,
        title: 'Ошибка',
        message:
          'Ошибка: для создания новой версии альбома необходимо заполнить поле "Album title".',
        variant: 'error',
      });
      setIsSaving(false);
      return;
    }

    // Если версия существует, проверяем обязательные поля
    if (exists) {
      if (!effectiveArtistName) {
        setAlertModal({
          isOpen: true,
          title: 'Ошибка',
          message: 'Ошибка: не найдено название группы в профиле исполнителя (site_name).',
          variant: 'error',
        });
        setIsSaving(false);
        return;
      }

      if (!formData.title && !originalAlbum.album) {
        setAlertModal({
          isOpen: true,
          title: 'Ошибка',
          message:
            'Ошибка: не найдено название альбома. Заполните поле "Album title" и попробуйте снова.',
          variant: 'error',
        });
        setIsSaving(false);
        return;
      }
    }

    const step1Invalid = getAlbumStep1InvalidFields(formData, {
      effectiveAllowDownloadSale: saleModeForValidation,
      cover: { albumArtPreview, coverDraftKey },
    });
    if (step1Invalid.length > 0) {
      setStep1InvalidFields(step1Invalid);
      setCurrentStep(1);
      scrollToFirstAlbumStep1InvalidField(step1Invalid, editAlbumModalCardRef.current, {
        waitForStepRender: true,
      });
      return;
    }

    setIsSaving(true);

    // Если есть незавершенные изменения band member (редактирование или добавление),
    // применяем их к formData перед сохранением
    let finalFormData = formData;

    if (editingBandMemberIndex !== null && bandMemberName.trim() && bandMemberRole.trim()) {
      const url =
        bandMemberURL?.trim() && bandMemberURL.trim().length > 0 ? bandMemberURL.trim() : undefined;
      const updated = [...(finalFormData.bandMembers || [])];
      updated[editingBandMemberIndex] = updateBandMemberPreservingId(
        finalFormData.bandMembers[editingBandMemberIndex],
        {
          name: bandMemberName.trim(),
          role: bandMemberRole.trim(),
          url,
        }
      );
      finalFormData = { ...finalFormData, bandMembers: updated };
      setFormData(finalFormData);
      setEditingBandMemberIndex(null);
      setBandMemberName('');
      setBandMemberRole('');
      setBandMemberURL('');
    } else if (
      formData.showAddBandMemberInputs &&
      addBandMemberName.trim() &&
      addBandMemberRole.trim()
    ) {
      const url =
        addBandMemberURL?.trim() && addBandMemberURL.trim().length > 0
          ? addBandMemberURL.trim()
          : undefined;
      finalFormData = {
        ...finalFormData,
        bandMembers: [
          ...(finalFormData.bandMembers || []),
          createBandMember({
            name: addBandMemberName.trim(),
            role: addBandMemberRole.trim(),
            url,
          }),
        ],
      };
      setFormData(finalFormData);
      setAddBandMemberName('');
      setAddBandMemberRole('');
      setAddBandMemberURL('');
    }

    if (
      editingSessionMusicianIndex !== null &&
      sessionMusicianName.trim() &&
      sessionMusicianRole.trim()
    ) {
      const url =
        sessionMusicianURL?.trim() && sessionMusicianURL.trim().length > 0
          ? sessionMusicianURL.trim()
          : undefined;
      const updated = [...(finalFormData.sessionMusicians || [])];
      updated[editingSessionMusicianIndex] = updateBandMemberPreservingId(
        finalFormData.sessionMusicians[editingSessionMusicianIndex],
        {
          name: sessionMusicianName.trim(),
          role: sessionMusicianRole.trim(),
          url,
        }
      );
      finalFormData = { ...finalFormData, sessionMusicians: updated };
      setFormData(finalFormData);
      setEditingSessionMusicianIndex(null);
      setSessionMusicianName('');
      setSessionMusicianRole('');
      setSessionMusicianURL('');
    } else if (
      formData.showAddSessionMusicianInputs &&
      addSessionMusicianName.trim() &&
      addSessionMusicianRole.trim()
    ) {
      const url =
        addSessionMusicianURL?.trim() && addSessionMusicianURL.trim().length > 0
          ? addSessionMusicianURL.trim()
          : undefined;
      finalFormData = {
        ...finalFormData,
        sessionMusicians: [
          ...(finalFormData.sessionMusicians || []),
          createBandMember({
            name: addSessionMusicianName.trim(),
            role: addSessionMusicianRole.trim(),
            url,
          }),
        ],
      };
      setFormData(finalFormData);
      setAddSessionMusicianName('');
      setAddSessionMusicianRole('');
      setAddSessionMusicianURL('');
    }

    if (editingProducerIndex !== null && producerName.trim() && producerRole.trim()) {
      const url =
        producerURL?.trim() && producerURL.trim().length > 0 ? producerURL.trim() : undefined;
      const updated = [...(finalFormData.producer || [])];
      updated[editingProducerIndex] = updateBandMemberPreservingId(
        finalFormData.producer[editingProducerIndex],
        {
          name: producerName.trim(),
          role: producerRole.trim(),
          url,
        }
      );
      finalFormData = { ...finalFormData, producer: updated };
      setFormData(finalFormData);
      setEditingProducerIndex(null);
      setProducerName('');
      setProducerRole('');
      setProducerURL('');
    } else if (formData.showAddProducerInputs && addProducerName.trim() && addProducerRole.trim()) {
      const url =
        addProducerURL?.trim() && addProducerURL.trim().length > 0
          ? addProducerURL.trim()
          : undefined;
      finalFormData = {
        ...finalFormData,
        producer: [
          ...(finalFormData.producer || []),
          createBandMember({
            name: addProducerName.trim(),
            role: addProducerRole.trim(),
            url,
          }),
        ],
      };
      setFormData(finalFormData);
      setAddProducerName('');
      setAddProducerRole('');
      setAddProducerURL('');
    }

    // Незавершённые Recorded / Mixed / Mastered (редактирование или новая строка)
    const flushRecordedAtEdit = () => {
      if (finalFormData.editingRecordedAtIndex == null) return finalFormData;
      const canSave = Boolean(
        finalFormData.recordedAtText?.trim() ||
          finalFormData.recordedAtCity?.trim() ||
          finalFormData.recordedAtDateFrom ||
          finalFormData.recordedAtDateTo
      );
      if (!canSave) return finalFormData;
      const recIdx = finalFormData.editingRecordedAtIndex;
      const updated = [...finalFormData.recordedAt];
      updated[recIdx] = updateRecordingEntryPreservingId(finalFormData.recordedAt[recIdx], {
        text: buildRecordingText(
          finalFormData.recordedAtDateFrom,
          finalFormData.recordedAtDateTo,
          finalFormData.recordedAtText?.trim(),
          finalFormData.recordedAtCity?.trim(),
          lang
        ),
        url: finalFormData.recordedAtURL?.trim() || undefined,
        dateFrom: finalFormData.recordedAtDateFrom,
        dateTo: finalFormData.recordedAtDateTo,
        studioText: finalFormData.recordedAtText?.trim(),
        city: finalFormData.recordedAtCity?.trim(),
      });
      return {
        ...finalFormData,
        recordedAt: updated,
        recordedAtDateFrom: '',
        recordedAtDateTo: '',
        recordedAtText: '',
        recordedAtCity: '',
        recordedAtURL: '',
        editingRecordedAtIndex: null,
      };
    };

    const flushRecordedAtAdd = () => {
      if (
        !finalFormData.showAddRecordedAtInputs ||
        !recordingFormDraftCanSave(addRecordedAtDraft)
      ) {
        return finalFormData;
      }
      const newEntry = buildRecordingEntryFromEditFields(addRecordedAtDraft, lang);
      return {
        ...finalFormData,
        recordedAt: [...finalFormData.recordedAt, newEntry],
        showAddRecordedAtInputs: false,
      };
    };

    const flushMixedAtEdit = () => {
      if (finalFormData.editingMixedAtIndex == null) return finalFormData;
      const canSave = Boolean(
        finalFormData.mixedAtText?.trim() ||
          finalFormData.mixedAtCity?.trim() ||
          finalFormData.mixedAtDateFrom ||
          finalFormData.mixedAtDateTo
      );
      if (!canSave) return finalFormData;
      const mixIdx = finalFormData.editingMixedAtIndex;
      const updated = [...finalFormData.mixedAt];
      updated[mixIdx] = updateRecordingEntryPreservingId(finalFormData.mixedAt[mixIdx], {
        text: buildRecordingText(
          finalFormData.mixedAtDateFrom,
          finalFormData.mixedAtDateTo,
          finalFormData.mixedAtText?.trim(),
          finalFormData.mixedAtCity?.trim(),
          lang
        ),
        url: finalFormData.mixedAtURL?.trim() || undefined,
        dateFrom: finalFormData.mixedAtDateFrom,
        dateTo: finalFormData.mixedAtDateTo,
        studioText: finalFormData.mixedAtText?.trim(),
        city: finalFormData.mixedAtCity?.trim(),
      });
      return {
        ...finalFormData,
        mixedAt: updated,
        mixedAtDateFrom: '',
        mixedAtDateTo: '',
        mixedAtText: '',
        mixedAtCity: '',
        mixedAtURL: '',
        editingMixedAtIndex: null,
      };
    };

    const flushMixedAtAdd = () => {
      if (!finalFormData.showAddMixedAtInputs || !recordingFormDraftCanSave(addMixedAtDraft)) {
        return finalFormData;
      }
      const newEntry = buildRecordingEntryFromEditFields(addMixedAtDraft, lang);
      return {
        ...finalFormData,
        mixedAt: [...finalFormData.mixedAt, newEntry],
        showAddMixedAtInputs: false,
      };
    };

    const flushMasteringEdit = () => {
      if (finalFormData.editingMasteringIndex == null) return finalFormData;
      const canSave = Boolean(
        finalFormData.masteringText?.trim() ||
          finalFormData.masteringCity?.trim() ||
          finalFormData.masteringDateFrom ||
          finalFormData.masteringDateTo
      );
      if (!canSave) return finalFormData;
      const mastIdx = finalFormData.editingMasteringIndex;
      const updated = [...finalFormData.mastering];
      updated[mastIdx] = updateRecordingEntryPreservingId(finalFormData.mastering[mastIdx], {
        text: buildRecordingText(
          finalFormData.masteringDateFrom,
          finalFormData.masteringDateTo,
          finalFormData.masteringText?.trim(),
          finalFormData.masteringCity?.trim(),
          lang
        ),
        url: finalFormData.masteringURL?.trim() || undefined,
        dateFrom: finalFormData.masteringDateFrom,
        dateTo: finalFormData.masteringDateTo,
        studioText: finalFormData.masteringText?.trim(),
        city: finalFormData.masteringCity?.trim(),
      });
      return {
        ...finalFormData,
        mastering: updated,
        masteringDateFrom: '',
        masteringDateTo: '',
        masteringText: '',
        masteringCity: '',
        masteringURL: '',
        editingMasteringIndex: null,
      };
    };

    const flushMasteringAdd = () => {
      if (!finalFormData.showAddMasteringInputs || !recordingFormDraftCanSave(addMasteringDraft)) {
        return finalFormData;
      }
      const newEntry = buildRecordingEntryFromEditFields(addMasteringDraft, lang);
      return {
        ...finalFormData,
        mastering: [...finalFormData.mastering, newEntry],
        showAddMasteringInputs: false,
      };
    };

    finalFormData = flushRecordedAtEdit();
    finalFormData = flushRecordedAtAdd();
    finalFormData = flushMixedAtEdit();
    finalFormData = flushMixedAtAdd();
    finalFormData = flushMasteringEdit();
    finalFormData = flushMasteringAdd();
    setFormData(finalFormData);
    setAddRecordedAtDraft(emptyRecordingFormDraft());
    setAddMixedAtDraft(emptyRecordingFormDraft());
    setAddMasteringDraft(emptyRecordingFormDraft());

    // Используем lang для сохранения
    const normalizedLang = lang;

    let newCover: string | undefined;
    const currentCoverDraftKey = coverDraftKey;

    if (currentCoverDraftKey) {
      try {
        const commitResult = await commitCover(currentCoverDraftKey, finalAlbumId, {
          artist: effectiveArtistName,
          album: formData.title || originalAlbum?.album || '',
          lang: normalizedLang,
        });

        if (commitResult.success && commitResult.data) {
          const data = commitResult.data as any;

          const fromFile = (name?: string) =>
            name
              ? name.replace(/\.(webp|jpg)$/i, '').replace(/-(64|128|448|896|1344)$/i, '')
              : undefined;

          const baseName =
            data?.baseName ||
            fromFile(data?.storagePath?.split('/').pop()) ||
            fromFile(data?.url?.split('/').pop());

          if (baseName) {
            newCover = baseName;
            console.log('✅ [EditAlbumModal] Cover committed successfully:', { baseName });
          } else {
            console.warn('⚠️ [EditAlbumModal] Cover commit succeeded but baseName not found');
          }
        } else {
          const errorMessage = !commitResult.success ? commitResult.error : 'Unknown error';
          console.error('❌ [EditAlbumModal] Cover commit failed:', { error: errorMessage });
          setUploadStatus('error');
          setUploadError(errorMessage || 'Failed to commit cover');
          setAlertModal({
            isOpen: true,
            title: 'Ошибка',
            message:
              'Не удалось сохранить обложку альбома. Повторите загрузку обложки и попробуйте снова.',
            variant: 'error',
          });
          setIsSaving(false);
          return;
        }
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        console.error('❌ [EditAlbumModal] Cover commit error:', { error: errorMessage });
        setUploadStatus('error');
        setUploadError(errorMessage);
        setAlertModal({
          isOpen: true,
          title: 'Ошибка',
          message: 'Ошибка при сохранении обложки альбома. Попробуйте еще раз.',
          variant: 'error',
        });
        setIsSaving(false);
        return;
      }
    }

    // База для id в transformFormDataToAlbumFormat — details текущей локали в БД (согласованные id).
    // При новом альбоме originalAlbum нет → [].
    const baselineDetails = originalAlbum?.translations?.[lang]?.details || [];

    const {
      release,
      buttons,
      details: newDetails,
    } = transformFormDataToAlbumFormat(finalFormData, lang, ui ?? undefined, baselineDetails, {
      hasYooKassaPayment: hasYooKassa,
    });

    const cleanedDetails = dedupeSemanticAlbumDetailBlocks(newDetails, lang, ui ?? undefined);

    const semanticForLocales = cleanedDetails as detailsProps[];
    const detailsByLocale: Record<SupportedLang, detailsProps[]> = {
      en: mergeSemanticSourceIntoLocaleDetails(
        originalAlbum?.translations?.en?.details,
        semanticForLocales,
        'en',
        ui ?? undefined,
        { preferSemanticSourceForContent: normalizedLang === 'en' }
      ),
      ru: mergeSemanticSourceIntoLocaleDetails(
        originalAlbum?.translations?.ru?.details,
        semanticForLocales,
        'ru',
        ui ?? undefined,
        { preferSemanticSourceForContent: normalizedLang === 'ru' }
      ),
    };

    const albumTitle = (finalFormData.title || '').trim() || (originalAlbum?.album || '').trim();
    const fullName =
      effectiveArtistName && albumTitle ? `${effectiveArtistName} — ${albumTitle}` : albumTitle;

    console.log('📝 [EditAlbumModal] Form data before save:', {
      method,
      lang,
      formDataTitle: formData.title,
      formDataArtist: effectiveArtistName,
      originalAlbumTitle: originalAlbum?.album,
    });

    // Семантические блоки (участники, продюсеры, …) синхронизируются в en/ru; пользовательские — только в текущей локали.
    const updateData: Record<string, unknown> = {
      albumId: finalAlbumId,
      ...(previousAlbumIdForApi ? { previousAlbumId: previousAlbumIdForApi } : {}),
      album: albumTitle,
      translations: {
        [normalizedLang]: {
          fullName,
          description:
            finalFormData.description !== undefined
              ? finalFormData.description
              : originalAlbum?.description || '',
          details:
            detailsByLocale[normalizedLang].length > 0 ? detailsByLocale[normalizedLang] : [],
          photographer: (finalFormData.albumCoverPhotographer ?? '').trim(),
          photographerURL: (finalFormData.albumCoverPhotographerURL ?? '').trim(),
          designer: (finalFormData.albumCoverDesigner ?? '').trim(),
          designerURL: (finalFormData.albumCoverDesignerURL ?? '').trim(),
        },
      },
      release: release,
      // Полный объект кнопок из формы — иначе merge со старым `buttons` не удаляет снятые ссылки.
      buttons,
      lang: normalizedLang,
      ...(newCover ? { cover: newCover } : {}),
    };

    console.log('📦 [EditAlbumModal] Update data prepared:', {
      albumId: updateData.albumId,
      lang: updateData.lang,
      hasTranslations: !!updateData.translations,
      hasRelease: !!updateData.release,
      hasButtons: !!updateData.buttons,
    });

    try {
      const token = getToken();
      console.log('🔐 [EditAlbumModal] Token check:', {
        hasToken: !!token,
        tokenLength: token?.length || 0,
        tokenPreview: token ? `${token.substring(0, 20)}...` : 'null',
      });

      if (!token) {
        console.error('❌ [EditAlbumModal] No token found! Cannot save album.');
        setAlertModal({
          isOpen: true,
          title: 'Ошибка',
          message: 'Ошибка: вы не авторизованы. Пожалуйста, войдите в систему.',
          variant: 'error',
        });
        setIsSaving(false);
        return;
      }

      console.log('📤 [EditAlbumModal] Sending request:', {
        url: '/api/albums',
        method,
        lang: normalizedLang,
        albumId: updateData.albumId,
        hasCover: !!updateData.cover,
        hasToken: !!token,
        tokenLength: token?.length || 0,
      });

      const response = await fetchWithAuthSession('/api/albums', {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updateData),
      });

      console.log('📥 [EditAlbumModal] Response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        contentType: response.headers.get('content-type'),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ [EditAlbumModal] Response error:', {
          status: response.status,
          statusText: response.statusText,
          errorData,
        });
        throw new Error((errorData as any)?.error || `HTTP error! status: ${response.status}`);
      }

      if (method === 'PUT' && exists) {
        const otherLang: SupportedLang = normalizedLang === 'en' ? 'ru' : 'en';
        const syncPayload: Record<string, unknown> = {
          albumId: finalAlbumId,
          lang: otherLang,
          album: albumTitle,
          translations: {
            [otherLang]: {
              details: detailsByLocale[otherLang],
            },
          },
        };
        const syncRes = await fetchWithAuthSession('/api/albums', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(syncPayload),
        });
        if (!syncRes.ok) {
          const syncErr = await syncRes.json().catch(() => ({}));
          console.warn('[EditAlbumModal] Sync semantic details to other locale failed:', {
            otherLang,
            status: syncRes.status,
            syncErr,
          });
        }
      }

      const result = await response.json();
      console.log('✅ [EditAlbumModal] Success:', {
        success: result.success,
        hasData: !!result.data,
        dataLength: Array.isArray(result.data) ? result.data.length : 'not array',
      });

      // Детально логируем что вернул сервер
      if (result.data && Array.isArray(result.data) && result.data.length > 0) {
        const returnedAlbum = result.data[0];
        console.log('📋 [EditAlbumModal] Album returned from server:', {
          albumId: returnedAlbum.albumId,
          album: returnedAlbum.album, // Должно быть "32"
          artist: returnedAlbum.artist,
          description: returnedAlbum.description?.substring(0, 50) || '',
          cover: returnedAlbum.cover,
        });
      }

      // ВАЖНО: Форсим обновление Redux store для языка контента ПЕРЕД вызовом onNext
      console.log('🔄 [EditAlbumModal] Forcing fetchAlbums for lang:', lang);
      try {
        await dispatch(fetchAlbums({ force: true, ownerDashboard: true })).unwrap();
        try {
          await dispatch(fetchAlbums({ force: true })).unwrap();
        } catch {
          /* публичный каталог ?artist= — best-effort */
        }
        console.log('✅ [EditAlbumModal] Redux store updated for', lang);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('artist:updated'));
        }
      } catch (fetchError) {
        console.error('❌ [EditAlbumModal] Failed to update Redux store:', fetchError);
        // Продолжаем выполнение даже если fetchAlbums не удался
      }

      // Передаём обновленный альбом в onNext для обновления UI
      const updatedAlbum: IAlbums | undefined =
        result.data && Array.isArray(result.data) ? result.data[0] : undefined;

      if (updatedAlbum?.albumId) {
        canonicalAlbumIdRef.current = updatedAlbum.albumId;
        albumTitleAtOpenRef.current = (updatedAlbum.album ?? formData.title ?? '').trim();
      }

      if (isNewAlbumWizard && method === 'POST') {
        queueAlbumCreatedToast();
      }

      if (onNext) {
        await onNext(formData, updatedAlbum, {
          createdNewAlbum: isNewAlbumWizard && method === 'POST',
        });
      }

      // Небольшая задержка перед закрытием модалки для гарантии обновления UI
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Закрываем модалку (isSaving ещё true — нужен force)
      handleClose({ force: true });

      return result;
    } catch (error) {
      console.error('❌ Error updating album:', error);

      // Проверяем, является ли ошибка ошибкой авторизации
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isAuthError = errorMessage.includes('Unauthorized') || errorMessage.includes('401');

      setAlertModal({
        isOpen: true,
        title: 'Ошибка',
        message: isAuthError
          ? 'Ошибка авторизации: ваша сессия истекла. Пожалуйста, обновите страницу и войдите в систему снова.'
          : `Ошибка при сохранении альбома: ${errorMessage}`,
        variant: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const snapshotDiscardAux = (): AlbumDiscardAuxState => ({
    tagInput,
    coverDraftKey,
    uploadStatus,
    bandMemberName,
    bandMemberRole,
    bandMemberURL,
    editingBandMemberIndex,
    addBandMemberName,
    addBandMemberRole,
    addBandMemberURL,
    sessionMusicianName,
    sessionMusicianRole,
    sessionMusicianURL,
    editingSessionMusicianIndex,
    addSessionMusicianName,
    addSessionMusicianRole,
    addSessionMusicianURL,
    producerName,
    producerRole,
    producerURL,
    editingProducerIndex,
    addProducerName,
    addProducerRole,
    addProducerURL,
    addRecordedAtDraft,
    addMixedAtDraft,
    addMasteringDraft,
    editingPurchaseLink,
    purchaseLinkService,
    purchaseLinkUrl,
    editingStreamingLink,
    streamingLinkService,
    streamingLinkUrl,
  });

  const hasPendingDiscardCloseRisk = (): boolean => {
    const baseline = discardCloseFingerprintRef.current;
    if (baseline === null) return false;
    return buildAlbumDiscardFingerprint(formData, currentStep, snapshotDiscardAux()) !== baseline;
  };

  const finalizeModalClose = () => {
    setDiscardCloseDialogOpen(false);
    if (localPreviewUrlRef.current) {
      URL.revokeObjectURL(localPreviewUrlRef.current);
      localPreviewUrlRef.current = null;
    }
    onClose();
  };

  const handleClose = (opts?: { force?: boolean }) => {
    if (isSaving && !opts?.force) return;
    if (!opts?.force && hasPendingDiscardCloseRisk()) {
      setDiscardCloseDialogOpen(true);
      return;
    }
    popupRequestCloseRef.current?.();
  };

  const renderStepContent = () => {
    if (currentStep === 1) {
      const step1ValUi = ui?.dashboard?.editAlbumModal?.step1Validation;
      const step1HasErr = (f: AlbumStep1InvalidField) => step1InvalidFields.includes(f);
      return (
        <>
          <div className="edit-album-modal__divider" />

          <div className="edit-album-modal__field" data-step1-field="title">
            <label htmlFor="album-title" className="edit-album-modal__label">
              {ui?.dashboard?.editAlbumModal?.fieldLabels?.albumTitle ?? 'Album title'}
            </label>
            <input
              id="album-title"
              name="album-title"
              type="text"
              autoComplete="off"
              className={`edit-album-modal__input${step1HasErr('title') ? ' edit-album-modal__input--invalid' : ''}`}
              required
              aria-invalid={step1HasErr('title')}
              aria-describedby={step1HasErr('title') ? 'album-title-error' : undefined}
              value={formData.title ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setFormData((s) => ({ ...s, title: v }));
                if (step1HasErr('title'))
                  setStep1InvalidFields((p) => p.filter((x) => x !== 'title'));
              }}
            />
            {step1HasErr('title') ? (
              <p id="album-title-error" className="edit-album-modal__field-error" role="alert">
                {step1ValUi?.requiredTitle}
              </p>
            ) : null}
          </div>

          <div className="edit-album-modal__field" data-step1-field="releaseDate">
            <label htmlFor="release-date" className="edit-album-modal__label">
              {ui?.dashboard?.editAlbumModal?.fieldLabels?.releaseDate ?? 'Release date'}
            </label>
            <input
              id="release-date"
              name="release-date"
              type="text"
              autoComplete="off"
              className={`edit-album-modal__input${step1HasErr('releaseDate') ? ' edit-album-modal__input--invalid' : ''}`}
              placeholder={ui?.dashboard?.editAlbumModal?.placeholders?.releaseDate ?? 'DD/MM/YYYY'}
              maxLength={10}
              required
              aria-invalid={step1HasErr('releaseDate')}
              aria-describedby={step1HasErr('releaseDate') ? 'release-date-error' : undefined}
              value={formData.releaseDate ?? ''}
              onChange={(e) => {
                const formatted = formatDateInput(e.target.value);
                setFormData((s) => ({ ...s, releaseDate: formatted }));
                if (step1HasErr('releaseDate'))
                  setStep1InvalidFields((p) => p.filter((x) => x !== 'releaseDate'));
              }}
              onBlur={(e) => {
                // При потере фокуса валидируем дату
                const value = e.target.value.trim();
                if (value && value.length === 10) {
                  const parts = value.split('/');
                  if (parts.length === 3) {
                    const [day, month, year] = parts.map((p) => parseInt(p, 10));
                    if (
                      day >= 1 &&
                      day <= 31 &&
                      month >= 1 &&
                      month <= 12 &&
                      year >= 1900 &&
                      year <= 2100
                    ) {
                      const date = new Date(year, month - 1, day);
                      if (
                        date.getDate() === day &&
                        date.getMonth() === month - 1 &&
                        date.getFullYear() === year
                      ) {
                        const formatted = formatDateInput(value);
                        setFormData((s) => ({ ...s, releaseDate: formatted }));
                      }
                    }
                  }
                }
              }}
            />
            {step1HasErr('releaseDate') ? (
              <p id="release-date-error" className="edit-album-modal__field-error" role="alert">
                {step1ValUi?.requiredReleaseDate}
              </p>
            ) : null}
          </div>

          <div className="edit-album-modal__field" data-step1-field="upcEan">
            <label htmlFor="upc-ean" className="edit-album-modal__label">
              {ui?.dashboard?.editAlbumModal?.fieldLabels?.upcEan ?? 'UPC / EAN'}
            </label>
            <input
              id="upc-ean"
              name="upc-ean"
              type="text"
              autoComplete="off"
              className={`edit-album-modal__input${step1HasErr('upcEan') ? ' edit-album-modal__input--invalid' : ''}`}
              placeholder={ui?.dashboard?.editAlbumModal?.placeholders?.upcEan ?? 'UPC / EAN'}
              required
              aria-invalid={step1HasErr('upcEan')}
              aria-describedby={step1HasErr('upcEan') ? 'upc-ean-error' : undefined}
              value={formData.upcEan ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setFormData((s) => ({ ...s, upcEan: v }));
                if (step1HasErr('upcEan'))
                  setStep1InvalidFields((p) => p.filter((x) => x !== 'upcEan'));
              }}
            />
            {step1HasErr('upcEan') ? (
              <p id="upc-ean-error" className="edit-album-modal__field-error" role="alert">
                {step1ValUi?.requiredUpcEan}
              </p>
            ) : null}
          </div>

          <div
            className={`edit-album-modal__field${step1HasErr('cover') ? ' edit-album-modal__field--invalid' : ''}`}
            data-step1-field="cover"
          >
            <label className="edit-album-modal__label">
              {ui?.dashboard?.editAlbumModal?.fieldLabels?.albumArt ?? 'Album art'}
            </label>

            <input
              type="file"
              id="album-art-input"
              accept="image/*"
              className="edit-album-modal__file-input"
              onChange={handleFileInput}
            />

            {albumArtPreview ? (
              <div className="edit-album-modal__art-wrap">
                <div className="edit-album-modal__art-preview">
                  <img
                    src={albumArtPreview}
                    alt="Album art preview"
                    className="edit-album-modal__art-image"
                  />
                </div>

                <div className="edit-album-modal__art-actions">
                  <div className="edit-album-modal__art-buttons">
                    <label htmlFor="album-art-input" className="edit-album-modal__art-button">
                      {ui?.dashboard?.editAlbumModal?.buttons?.replace ?? 'Replace'}
                    </label>
                  </div>

                  {formData.albumArt && formData.albumArt instanceof File && (
                    <div className="edit-album-modal__art-meta">
                      {formData.albumArt.type || 'Image'} • {formatFileSize(formData.albumArt.size)}
                    </div>
                  )}

                  {uploadStatus === 'uploading' && (
                    <div className="edit-album-modal__art-status" aria-busy="true">
                      <DashboardSpinner className="edit-album-modal__art-status-spinner" />
                      <div className="edit-album-modal__art-progress">
                        <div
                          className="edit-album-modal__art-progress-bar"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {uploadStatus === 'uploaded' && (
                    <div className="edit-album-modal__art-status">
                      <span className="edit-album-modal__art-status-text edit-album-modal__art-status-text--success">
                        {ui?.dashboard?.editAlbumModal?.status?.uploaded ?? 'Uploaded (draft)'}
                      </span>
                    </div>
                  )}

                  {uploadStatus === 'error' && uploadError && (
                    <div className="edit-album-modal__art-status">
                      <span className="edit-album-modal__art-status-text edit-album-modal__art-status-text--error">
                        {ui?.dashboard?.editAlbumModal?.status?.error ?? 'Error'}: {uploadError}
                      </span>
                    </div>
                  )}

                  {!coverDraftKey && albumArtPreview && uploadStatus === 'idle' && (
                    <div className="edit-album-modal__art-status">
                      <span className="edit-album-modal__art-status-text">
                        {ui?.dashboard?.editAlbumModal?.status?.publishedCover ?? 'Published cover'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div
                className={`edit-album-modal__dropzone ${dragActive ? 'edit-album-modal__dropzone--active' : ''}${step1HasErr('cover') ? ' edit-album-modal__dropzone--invalid' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <div className="edit-album-modal__dropzone-text">
                  {ui?.dashboard?.editAlbumModal?.placeholders?.dragImageHere ?? 'Drag image here'}
                </div>
                <label htmlFor="album-art-input" className="edit-album-modal__file-label">
                  {ui?.dashboard?.editAlbumModal?.placeholders?.chooseFile ?? 'Choose file'}
                </label>
              </div>
            )}
            {step1HasErr('cover') ? (
              <p className="edit-album-modal__field-error" role="alert">
                {step1ValUi?.requiredCover ?? 'Upload album cover art'}
              </p>
            ) : null}
          </div>

          <div className="edit-album-modal__field" data-step1-field="description">
            <label htmlFor="description" className="edit-album-modal__label">
              {ui?.dashboard?.editAlbumModal?.fieldLabels?.description ?? 'Description'}
            </label>
            <textarea
              id="description"
              name="description"
              autoComplete="off"
              className={`edit-album-modal__textarea${step1HasErr('description') ? ' edit-album-modal__textarea--invalid' : ''}`}
              placeholder={
                ui?.dashboard?.editAlbumModal?.placeholders?.description ??
                'Short story about the album, credits highlights, genres, etc.'
              }
              required
              aria-invalid={step1HasErr('description')}
              aria-describedby={step1HasErr('description') ? 'description-error' : undefined}
              value={formData.description ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setFormData((s) => ({ ...s, description: v }));
                if (step1HasErr('description'))
                  setStep1InvalidFields((p) => p.filter((x) => x !== 'description'));
              }}
            />
            {step1HasErr('description') ? (
              <p id="description-error" className="edit-album-modal__field-error" role="alert">
                {step1ValUi?.requiredDescription}
              </p>
            ) : null}
          </div>

          <div className="edit-album-modal__field edit-album-modal__field--album-sale">
            {yookassaLoading ? (
              <DashboardLoadingState className="edit-album-modal__album-sale-loading" />
            ) : !hasYooKassa ? (
              <div className="edit-album-modal__album-sale-connect">
                <div className="edit-album-modal__album-sale-title">
                  {ui?.dashboard?.editAlbumModal?.albumSale?.sectionTitle ?? 'Album sale'}
                </div>
                <p className="edit-album-modal__album-sale-desc">
                  {ui?.dashboard?.editAlbumModal?.albumSale?.connectPaymentHint ??
                    'To sell this album, connect a payment method.'}
                </p>
                <a
                  href="/dashboard-new/payment-settings"
                  className="edit-album-modal__connect-payment-link"
                  onClick={(e) => {
                    e.preventDefault();
                    onClose();
                    navigate('/dashboard-new/payment-settings', {
                      replace: true,
                      state: location.state,
                    });
                  }}
                >
                  {ui?.dashboard?.editAlbumModal?.albumSale?.connectPaymentButton ??
                    'Connect payment →'}
                </a>
              </div>
            ) : (
              <>
                <div className="edit-album-modal__album-sale-title">
                  {ui?.dashboard?.editAlbumModal?.albumSale?.sectionTitle ?? 'Album sale'}
                </div>
                <p className="edit-album-modal__album-sale-desc">
                  {ui?.dashboard?.editAlbumModal?.albumSale?.saleIntro ??
                    'Choose whether the album is available for purchase or download.'}
                </p>
                <div
                  className="edit-album-modal__radio-group"
                  role="radiogroup"
                  aria-label={
                    ui?.dashboard?.editAlbumModal?.albumSale?.saleRadiogroupAriaLabel ??
                    'Album sale'
                  }
                >
                  <div className="edit-album-modal__radio-wrapper">
                    <input
                      type="radio"
                      id="download-no"
                      name="allow-download-sale"
                      className="edit-album-modal__radio"
                      checked={formData.allowDownloadSale === 'no'}
                      onChange={() => handleInputChange('allowDownloadSale', 'no')}
                    />
                    <label htmlFor="download-no" className="edit-album-modal__radio-label">
                      {ui?.dashboard?.editAlbumModal?.radioOptions?.no ?? 'Не продавать'}
                    </label>
                  </div>

                  <div className="edit-album-modal__radio-wrapper">
                    <input
                      type="radio"
                      id="download-yes"
                      name="allow-download-sale"
                      className="edit-album-modal__radio"
                      checked={formData.allowDownloadSale === 'yes'}
                      onChange={() => handleInputChange('allowDownloadSale', 'yes')}
                    />
                    <label htmlFor="download-yes" className="edit-album-modal__radio-label">
                      {ui?.dashboard?.editAlbumModal?.radioOptions?.yes ?? 'Продавать'}
                    </label>
                  </div>

                  <div className="edit-album-modal__radio-wrapper">
                    <input
                      type="radio"
                      id="download-preorder"
                      name="allow-download-sale"
                      className="edit-album-modal__radio"
                      checked={formData.allowDownloadSale === 'preorder'}
                      onChange={() => handleInputChange('allowDownloadSale', 'preorder')}
                    />
                    <label htmlFor="download-preorder" className="edit-album-modal__radio-label">
                      {ui?.dashboard?.editAlbumModal?.radioOptions?.acceptPreorders ?? 'Предзаказ'}
                    </label>
                  </div>
                </div>

                {formData.allowDownloadSale === 'preorder' && (
                  <div className="edit-album-modal__preorder-help">
                    {ui?.dashboard?.editAlbumModal?.helpText?.fansCanBuyNow ??
                      'Fans can buy now, download after release date'}
                  </div>
                )}
              </>
            )}
          </div>

          {showPriceFields && (
            <div className="edit-album-modal__field" data-step1-field="regularPrice">
              <label className="edit-album-modal__label">
                {ui?.dashboard?.editAlbumModal?.fieldLabels?.regularPrice ?? 'Regular price'}
              </label>
              <div className="edit-album-modal__price-group">
                <select
                  name="currency"
                  autoComplete="off"
                  className="edit-album-modal__select"
                  value={formData.currency}
                  onChange={(e) => handleInputChange('currency', e.target.value)}
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="RUB">RUB</option>
                </select>

                <input
                  id="regular-price"
                  name="regular-price"
                  type="text"
                  autoComplete="off"
                  className={`edit-album-modal__input edit-album-modal__input--price${step1HasErr('regularPrice') ? ' edit-album-modal__input--invalid' : ''}`}
                  aria-invalid={step1HasErr('regularPrice')}
                  aria-describedby={step1HasErr('regularPrice') ? 'regular-price-error' : undefined}
                  value={formData.regularPrice}
                  onChange={(e) => {
                    handleInputChange('regularPrice', e.target.value);
                    if (step1HasErr('regularPrice'))
                      setStep1InvalidFields((p) => p.filter((x) => x !== 'regularPrice'));
                  }}
                />
              </div>
              {step1HasErr('regularPrice') ? (
                <p id="regular-price-error" className="edit-album-modal__field-error" role="alert">
                  {step1ValUi?.requiredRegularPrice}
                </p>
              ) : null}
            </div>
          )}

          {showPreorderDate && (
            <div className="edit-album-modal__field" data-step1-field="preorderReleaseDate">
              <label htmlFor="preorder-date" className="edit-album-modal__label">
                {ui?.dashboard?.editAlbumModal?.fieldLabels?.preorderReleaseDate ??
                  'Pre-order release date'}
              </label>
              <input
                id="preorder-date"
                name="preorder-date"
                type="text"
                autoComplete="off"
                className={`edit-album-modal__input${step1HasErr('preorderReleaseDate') ? ' edit-album-modal__input--invalid' : ''}`}
                placeholder={
                  ui?.dashboard?.editAlbumModal?.placeholders?.preorderDate ?? 'DD/MM/YYYY'
                }
                maxLength={10}
                aria-invalid={step1HasErr('preorderReleaseDate')}
                aria-describedby={
                  step1HasErr('preorderReleaseDate') ? 'preorder-date-error' : undefined
                }
                value={formData.preorderReleaseDate}
                onChange={(e) => {
                  const formatted = formatDateInput(e.target.value);
                  handleInputChange('preorderReleaseDate', formatted);
                  if (step1HasErr('preorderReleaseDate'))
                    setStep1InvalidFields((p) => p.filter((x) => x !== 'preorderReleaseDate'));
                }}
                onBlur={(e) => {
                  // При потере фокуса валидируем дату
                  const value = e.target.value.trim();
                  if (value && value.length === 10) {
                    const parts = value.split('/');
                    if (parts.length === 3) {
                      const [day, month, year] = parts.map((p) => parseInt(p, 10));
                      if (
                        day >= 1 &&
                        day <= 31 &&
                        month >= 1 &&
                        month <= 12 &&
                        year >= 1900 &&
                        year <= 2100
                      ) {
                        const date = new Date(year, month - 1, day);
                        if (
                          date.getDate() === day &&
                          date.getMonth() === month - 1 &&
                          date.getFullYear() === year
                        ) {
                          const formatted = formatDateInput(value);
                          handleInputChange('preorderReleaseDate', formatted);
                        }
                      }
                    }
                  }
                }}
              />
              {step1HasErr('preorderReleaseDate') ? (
                <p id="preorder-date-error" className="edit-album-modal__field-error" role="alert">
                  {step1ValUi?.requiredPreorderReleaseDate}
                </p>
              ) : null}
            </div>
          )}
        </>
      );
    }

    if (currentStep === 2) {
      return (
        <EditAlbumModalStep2
          formData={formData}
          lang={lang}
          genreDropdownOpen={genreDropdownOpen}
          genreRequired={step2GenreRequired}
          tagInput={tagInput}
          tagError={tagError}
          genreDropdownRef={genreDropdownRef}
          tagInputRef={tagInputRef}
          onGenreDropdownToggle={() => setGenreDropdownOpen(!genreDropdownOpen)}
          onGenreToggle={handleGenreToggle}
          onRemoveGenre={handleRemoveGenre}
          onTagInputChange={(value) => {
            setTagInput(value);
            setTagError('');
          }}
          onTagInputKeyDown={handleTagInputKeyDown}
          onAddTag={handleAddTag}
          onRemoveTag={handleRemoveTag}
          ui={ui ?? undefined}
        />
      );
    }

    if (currentStep === 3) {
      return (
        <EditAlbumModalStep3
          formData={formData}
          onFormDataChange={handleInputChange}
          addRecordedAtDraft={addRecordedAtDraft}
          addMixedAtDraft={addMixedAtDraft}
          addMasteringDraft={addMasteringDraft}
          onPatchAddRecordedAtDraft={patchAddRecordedAtDraft}
          onPatchAddMixedAtDraft={patchAddMixedAtDraft}
          onPatchAddMasteringDraft={patchAddMasteringDraft}
          onRequestEditRecordedAt={handleRequestEditRecordedAt}
          onRequestEditMixedAt={handleRequestEditMixedAt}
          onRequestEditMastering={handleRequestEditMastering}
          onSaveRecordedAtAdd={handleSaveRecordedAtAdd}
          onSaveMixedAtAdd={handleSaveMixedAtAdd}
          onSaveMasteringAdd={handleSaveMasteringAdd}
          onCancelRecordedAtAdd={handleCancelRecordedAtAdd}
          onCancelMixedAtAdd={handleCancelMixedAtAdd}
          onCancelMasteringAdd={handleCancelMasteringAdd}
          lang={lang}
          ui={ui ?? undefined}
        />
      );
    }

    if (currentStep === 4) {
      return (
        <EditAlbumModalStep4
          formData={formData}
          addBandMemberName={addBandMemberName}
          addBandMemberRole={addBandMemberRole}
          addBandMemberURL={addBandMemberURL}
          bandMemberName={bandMemberName}
          bandMemberRole={bandMemberRole}
          bandMemberURL={bandMemberURL}
          editingBandMemberIndex={editingBandMemberIndex}
          addSessionMusicianName={addSessionMusicianName}
          addSessionMusicianRole={addSessionMusicianRole}
          addSessionMusicianURL={addSessionMusicianURL}
          sessionMusicianName={sessionMusicianName}
          sessionMusicianRole={sessionMusicianRole}
          sessionMusicianURL={sessionMusicianURL}
          editingSessionMusicianIndex={editingSessionMusicianIndex}
          onFormDataChange={handleInputChange}
          onAddBandMemberNameChange={setAddBandMemberName}
          onAddBandMemberRoleChange={setAddBandMemberRole}
          onAddBandMemberURLChange={setAddBandMemberURL}
          onBandMemberNameChange={setBandMemberName}
          onBandMemberRoleChange={setBandMemberRole}
          onBandMemberURLChange={setBandMemberURL}
          onAddBandMember={handleAddBandMember}
          onEditBandMember={handleEditBandMember}
          onRemoveBandMember={handleRemoveBandMember}
          onCancelEditBandMember={handleCancelEditBandMember}
          onAddSessionMusicianNameChange={setAddSessionMusicianName}
          onAddSessionMusicianRoleChange={setAddSessionMusicianRole}
          onAddSessionMusicianURLChange={setAddSessionMusicianURL}
          onSessionMusicianNameChange={setSessionMusicianName}
          onSessionMusicianRoleChange={setSessionMusicianRole}
          onSessionMusicianURLChange={setSessionMusicianURL}
          onAddSessionMusician={handleAddSessionMusician}
          onEditSessionMusician={handleEditSessionMusician}
          onRemoveSessionMusician={handleRemoveSessionMusician}
          onCancelEditSessionMusician={handleCancelEditSessionMusician}
          addProducerName={addProducerName}
          addProducerRole={addProducerRole}
          addProducerURL={addProducerURL}
          producerName={producerName}
          producerRole={producerRole}
          producerURL={producerURL}
          editingProducerIndex={editingProducerIndex}
          onAddProducerNameChange={setAddProducerName}
          onAddProducerRoleChange={setAddProducerRole}
          onAddProducerURLChange={setAddProducerURL}
          onProducerNameChange={setProducerName}
          onProducerRoleChange={setProducerRole}
          onProducerURLChange={setProducerURL}
          onAddProducer={handleAddProducer}
          onEditProducer={handleEditProducer}
          onRemoveProducer={handleRemoveProducer}
          onCancelEditProducer={handleCancelEditProducer}
          step4InvalidFields={step4InvalidFields}
          ui={ui ?? undefined}
        />
      );
    }

    if (currentStep === 5) {
      return (
        <EditAlbumModalStep5
          formData={formData}
          editingPurchaseLink={editingPurchaseLink}
          purchaseLinkService={purchaseLinkService}
          purchaseLinkUrl={purchaseLinkUrl}
          editingStreamingLink={editingStreamingLink}
          streamingLinkService={streamingLinkService}
          streamingLinkUrl={streamingLinkUrl}
          onPurchaseLinkServiceChange={setPurchaseLinkService}
          onPurchaseLinkUrlChange={setPurchaseLinkUrl}
          onAddPurchaseLink={handleAddPurchaseLink}
          onEditPurchaseLink={handleEditPurchaseLink}
          onRemovePurchaseLink={handleRemovePurchaseLink}
          onCancelEditPurchaseLink={handleCancelEditPurchaseLink}
          onStreamingLinkServiceChange={setStreamingLinkService}
          onStreamingLinkUrlChange={setStreamingLinkUrl}
          onAddStreamingLink={handleAddStreamingLink}
          onEditStreamingLink={handleEditStreamingLink}
          onRemoveStreamingLink={handleRemoveStreamingLink}
          onCancelEditStreamingLink={handleCancelEditStreamingLink}
          ui={ui ?? undefined}
        />
      );
    }

    return null;
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1:
        return ui?.dashboard?.editAlbumModal?.stepTitles?.step1 ?? 'Step 1 of 5: Basic Info';
      case 2:
        return ui?.dashboard?.editAlbumModal?.stepTitles?.step2 ?? 'Step 2 of 5: Music Details';
      case 3:
        return (
          ui?.dashboard?.editAlbumModal?.stepTitles?.step3 ?? 'Step 3 of 5: Recorded/Mixed/Mastered'
        );
      case 4:
        return ui?.dashboard?.editAlbumModal?.stepTitles?.step4 ?? 'Step 4 of 5: Credits';
      case 5:
        return ui?.dashboard?.editAlbumModal?.stepTitles?.step5 ?? 'Step 5 of 5: Links';
      default:
        return `Step ${currentStep} of 5`;
    }
  };

  return (
    <>
      <Popup
        isActive={isOpen}
        onClose={finalizeModalClose}
        onCancelRequest={() => handleClose()}
        requestCloseRef={popupRequestCloseRef}
        closeBlocked={isSaving || discardCloseDialogOpen}
      >
        <div className="edit-album-modal">
          <div
            ref={editAlbumModalCardRef}
            className={`edit-album-modal__card${isSaving ? ' edit-album-modal__card--saving' : ''}`}
            aria-busy={isSaving}
          >
            <div className="edit-album-modal__header">
              <h2 className="edit-album-modal__title">{getStepTitle()}</h2>
              <button
                type="button"
                className="edit-album-modal__close"
                onClick={() => handleClose()}
                disabled={isSaving}
                aria-label={ui?.dashboard?.close ?? 'Close'}
              >
                <EditAlbumCloseIcon />
              </button>
            </div>

            {editLocaleFallbackNotice ? (
              <p className="edit-album-modal__locale-fallback" role="status">
                {editLocaleFallbackNotice}
              </p>
            ) : null}

            <div className="edit-album-modal__form">
              {renderStepContent()}

              <div className="edit-album-modal__actions">
                <div className="edit-album-modal__actions-leading">
                  <button
                    type="button"
                    className="edit-album-modal__button edit-album-modal__button--cancel"
                    onClick={() => handleClose()}
                    disabled={isSaving}
                  >
                    {ui?.dashboard?.cancel ?? 'Cancel'}
                  </button>
                  {currentStep > 1 ? (
                    <button
                      type="button"
                      className="edit-album-modal__button edit-album-modal__button--secondary"
                      onClick={handlePrevious}
                      disabled={isSaving}
                    >
                      {ui?.dashboard?.editAlbumModal?.buttons?.previous ?? 'Previous'}
                    </button>
                  ) : null}
                </div>

                <div className="edit-album-modal__actions-trailing">
                  {currentStep === 5 ? (
                    <button
                      type="button"
                      className={`edit-album-modal__button edit-album-modal__button--primary${
                        isSaving ? ' edit-album-modal__button--primary-loading' : ''
                      }`}
                      onClick={handlePublish}
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <>
                          <span className="edit-album-modal__button-spinner" aria-hidden />
                          {ui?.dashboard?.editAlbumModal?.buttons?.saving ?? 'Saving...'}
                        </>
                      ) : albumId &&
                        albumsFromStore?.some((a: IAlbums) => a.albumId === albumId) ? (
                        (ui?.dashboard?.editAlbumModal?.buttons?.saveChanges ?? 'Save changes')
                      ) : isNewAlbumWizard ? (
                        (ui?.dashboard?.editAlbumModal?.buttons?.createAlbum ?? 'Create album')
                      ) : (
                        (ui?.dashboard?.editAlbumModal?.buttons?.publishAlbum ?? 'Publish album')
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="edit-album-modal__button edit-album-modal__button--primary"
                      onClick={handleNext}
                      disabled={isSaving}
                    >
                      {ui?.dashboard?.editAlbumModal?.buttons?.next ?? 'Next'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Внутри dialog (top layer): иначе оверлей рендерится под showModal и не виден — кажется, что ✎ «заблокирована». */}
          {blockSwitchDialog && (
            <InlineEditDiscardDialog
              open
              labels={getSwitchEditConfirmLabels(ui ?? undefined)}
              onStay={() => setBlockSwitchDialog(null)}
              onDiscard={() => {
                const fn = blockSwitchDialog.onDiscard;
                setBlockSwitchDialog(null);
                fn();
              }}
            />
          )}
          {discardCloseDialogOpen && (
            <InlineEditDiscardDialog
              open
              titleId="edit-album-modal-close-discard-title"
              labels={getCloseDiscardConfirmLabels(ui ?? undefined)}
              onStay={() => setDiscardCloseDialogOpen(false)}
              onDiscard={finalizeModalClose}
            />
          )}
        </div>
      </Popup>

      {/* Alert Modal */}
      {alertModal && (
        <AlertModal
          isOpen={alertModal.isOpen}
          title={alertModal.title}
          message={alertModal.message}
          variant={alertModal.variant}
          onClose={() => setAlertModal(null)}
        />
      )}
    </>
  );
}
