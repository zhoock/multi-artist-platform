// src/pages/UserDashboard/components/mixer/MixerAdmin.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { AudioLines as AudioLinesIcon, Plus as PlusIcon } from 'lucide-react';
import type { IInterface } from '@models';
import type { AlbumData, TrackData } from '@entities/album/lib/transformEditableAlbumData';
import { AlbumCoverImage } from '@entities/album';
import { getUserUserId } from '@config/user';
import { useLang } from '@app/providers/lang';
import { uniqueUploadFileSuffix } from '@shared/lib/uniqueUploadFileSuffix';
import {
  DashboardButton,
  DashboardCard,
  DashboardEmptyState,
  DashboardExpandableRowTrigger,
  DashboardLoadingState,
} from '@shared/ui/dashboard';
import './MixerAdmin.scss';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { ConfirmationModal } from '@shared/ui/confirmationModal';
import { toast } from '@shared/lib/toast';
import {
  STEM_ADDED_TOAST_DURATION_MS,
  STEM_DELETED_TOAST_DURATION_MS,
} from '@shared/lib/toast/toastDurations';
import { notifyPublicSurfaceChanged } from '@shared/lib/publicSurfaceSync';
import {
  type StemMeta,
  type StemCategory,
  loadStems,
  saveStemsManifest,
  uploadStemAudio,
  deleteStemFile,
  getStemStoragePath,
  getStemAudioUrl,
  updateStemsVisibility,
} from '@entities/stem';
import { normalizeStemsVisibility, type StemsVisibility } from '@shared/lib/stems/stemsVisibility';
import { shouldApplyRemoteStemsLoad } from './mixerTrackStemsLoadGuard';
import { createStemsPersistQueue } from './mixerTrackStemsPersistQueue';
import { createTrackStemsMutationQueue } from './mixerTrackStemsMutationQueue';
import {
  useEffectiveLocation,
  useEffectiveSearchParams,
} from '@shared/lib/hooks/useEffectiveLocation';
import { getDashboardRowFlashProps, useDashboardRowFlash } from '../../lib/dashboardRowStateFlash';
import { DashboardExpandChevron } from '../../lib/dashboardExpandChevron';
import { useDashboardAccordionOnboarding } from '../../lib/dashboardAccordionOnboarding';
import { AddStemModal, type AddStemModalLabels } from './AddStemModal';
import { MixerNoTracksEmptyState } from './MixerNoTracksEmptyState';
import { SortableStemRow, type StemRowLabels } from './SortableStemRow';
import { StemAccessControl } from './StemAccessControl';

interface MixerAdminProps {
  ui?: IInterface;
  userId?: string;
  albums?: AlbumData[];
  tabActive?: boolean;
  onMountPinChange?: (pinned: boolean) => void;
}

interface DeleteTarget {
  albumId: string;
  trackId: string;
  stem: StemMeta;
}

/**
 * Составной ключ для любого клиентского кэша/стейта, привязанного к треку в микшере.
 *
 * Откуда берётся track.id в UI (TrackData.id / AlbumEditable.tracks[].id):
 * - В БД: колонка `tracks.track_id` (VARCHAR), уникальность только в паре с альбомом —
 *   `UNIQUE(album_id, track_id)` (см. database/migrations/003_create_users_albums_tracks.sql).
 * - Это НЕ глобальный PK строки `tracks.id` (UUID) и не slug названия трека.
 * - API: `netlify/functions/albums.ts` → `mapAlbumToApiFormat` кладёт `track.track_id` в поле `id`.
 * - UI: `transformEditableAlbumToAlbumData` → `id: String(track.id)`.
 * - Legacy-альбомы из JSON: позиционные id `"1"`, `"2"`, … (одинаковые между разными альбомами).
 * - Новые загрузки: стабильный UUID (`UserDashboard` → `newStableTrackId()`), но по-прежнему
 *   scoped к альбому в БД и в Storage, не глобально уникален без albumId.
 *
 * Пути стемов в Storage уже корректны: `users/{userId}/audio/{albumId}/{trackId}/…`.
 * Ошибка была только в React-стейте: индексация по голому trackId без albumId.
 *
 * Не используйте track.id как единственный ключ в Record/Map/setState — всегда stemKey(albumId, trackId),
 * где albumId — storage-ключ альбома (`album.albumId || album.id`, как getStorageAlbumId).
 */
const stemKey = (albumId: string, trackId: string) => `${albumId}:${trackId}`;

const mixerStemTrackRowId = (storageAlbumId: string, trackId: string) =>
  `mixer-stem-track-row-${stemKey(storageAlbumId, trackId)}`;

function formatStemToastMessage(
  stemName: string,
  template: string | undefined,
  lang: 'ru' | 'en',
  kind: 'added' | 'deleted'
): string {
  const fallbacks = {
    added: {
      en: `Stem "${stemName}" added`,
      ru: `Стем «${stemName}» добавлен`,
    },
    deleted: {
      en: `Stem "${stemName}" deleted`,
      ru: `Стем «${stemName}» удалён`,
    },
  } as const;
  return (template ?? fallbacks[kind][lang]).replace('{name}', stemName);
}

export function MixerAdmin({
  ui,
  userId,
  albums = [],
  tabActive = true,
  onMountPinChange,
}: MixerAdminProps) {
  // ui.dashboard.mixer пока не полностью описан в типах IInterface, берём через any.
  const t = useMemo(() => (ui as any)?.dashboard?.mixer ?? {}, [ui]);
  const { lang } = useLang();
  const navigate = useNavigate();
  const location = useEffectiveLocation();
  const [searchParams] = useEffectiveSearchParams();

  const [expandedAlbumId, setExpandedAlbumId] = useState<string | null>(null);
  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null);
  const [trackStems, setTrackStems] = useState<Record<string, StemMeta[]>>({});
  /** Authoritative during async work; never mirror React state back onto this ref on render. */
  const trackStemsRef = useRef<Record<string, StemMeta[]>>({});

  /** Tracks that finished a remote load (including empty manifests). */
  const loadedTrackKeysRef = useRef<Set<string>>(new Set());
  /** Coalesces concurrent loadStems calls per track. */
  const inFlightTrackLoadsRef = useRef<Record<string, Promise<void>>>({});
  /** Bumps when a new load starts; stale responses are ignored. */
  const loadGenerationByKeyRef = useRef<Record<string, number>>({});
  /** Bumps on local stem mutations; blocks stale remote loads from overwriting. */
  const localRevisionByKeyRef = useRef<Record<string, number>>({});

  const schedulePersistStemsRef = useRef(createStemsPersistQueue(saveStemsManifest));
  const runTrackMutationRef = useRef(createTrackStemsMutationQueue());

  const bumpLocalTrackRevision = useCallback((key: string) => {
    localRevisionByKeyRef.current[key] = (localRevisionByKeyRef.current[key] ?? 0) + 1;
    loadedTrackKeysRef.current.add(key);
  }, []);

  const commitTrackStems = useCallback((key: string, stems: StemMeta[]) => {
    trackStemsRef.current = { ...trackStemsRef.current, [key]: stems };
    setTrackStems((prev) => ({ ...prev, [key]: stems }));
  }, []);

  const readTrackStemsSnapshot = useCallback((key: string) => {
    return trackStemsRef.current[key] ?? [];
  }, []);

  const persistTrackStems = useCallback(
    (storageAlbumId: string, trackId: string) => {
      const key = stemKey(storageAlbumId, trackId);
      return schedulePersistStemsRef.current(storageAlbumId, trackId, () =>
        readTrackStemsSnapshot(key)
      );
    },
    [readTrackStemsSnapshot]
  );

  const stageTrackStemsForPersist = useCallback(
    (key: string, stems: StemMeta[]) => {
      bumpLocalTrackRevision(key);
      trackStemsRef.current = { ...trackStemsRef.current, [key]: stems };
    },
    [bumpLocalTrackRevision]
  );

  const revertTrackStemsStage = useCallback((key: string, previous: StemMeta[]) => {
    trackStemsRef.current = { ...trackStemsRef.current, [key]: previous };
    if (previous.length === 0) {
      loadedTrackKeysRef.current.delete(key);
    }
  }, []);
  const [stemAccessByTrack, setStemAccessByTrack] = useState<
    Record<string, { accessToken: string; accessTokenExpiresAt: number }>
  >({});
  const [loadingTracks, setLoadingTracks] = useState<Record<string, boolean>>({});
  const [busyStems, setBusyStems] = useState<Record<string, boolean>>({});
  const [addModal, setAddModal] = useState<{ albumId: string; trackId: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [playingStemId, setPlayingStemId] = useState<string | null>(null);
  const [stemsVisibilityByTrack, setStemsVisibilityByTrack] = useState<
    Record<string, StemsVisibility>
  >({});

  const { flashes: stemTrackRowFlashes, flashRow: flashStemTrackRow } = useDashboardRowFlash();

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const storageUserId = userId || getUserUserId() || '';

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const labels = useMemo(
    () => ({
      addStem: t.addStem ?? 'Добавить стем',
      emptyTitle: t.stemsEmptyTitle ?? 'Стемы не добавлены',
      emptyDescription: t.stemsEmptyDescription ?? 'Добавьте первый стем для этого трека.',
      tracks: t.tracks ?? 'Tracks',
    }),
    [t]
  );

  const modalLabels: AddStemModalLabels = useMemo(
    () => ({
      title: t.stems ?? 'Стемы',
      fileLabel: t.modalFileLabel ?? 'Файл',
      chooseFile: t.modalChooseFile ?? 'Выбрать файл',
      fileHint: t.modalFileHint ?? 'Поддерживаются: WAV, FLAC, AIFF',
      nameLabel: t.modalNameLabel ?? 'Название стема',
      namePlaceholder: t.modalNamePlaceholder ?? 'Введите название стема',
      categoryLabel: t.modalCategoryLabel ?? 'Тип инструмента',
      submit: t.modalSubmit ?? 'Добавить',
      submitting: t.modalSubmitting ?? 'Сохранение…',
      cancel: t.cancel ?? 'Отмена',
      closeLabel: t.close ?? 'Закрыть',
      nameRequired: t.modalNameRequired ?? 'Введите название стема',
      fileRequired: t.modalFileRequired ?? 'Выберите аудиофайл',
    }),
    [t]
  );

  const rowLabels: StemRowLabels = useMemo(
    () => ({
      play: t.rowPlay ?? 'Прослушать',
      pause: t.rowPause ?? 'Пауза',
      replace: t.rowReplace ?? 'Заменить файл',
      rename: t.rowRename ?? 'Переименовать',
      delete: t.rowDelete ?? 'Удалить',
      dragHint: t.rowDrag ?? 'Перетащите, чтобы изменить порядок',
    }),
    [t]
  );

  const getAlbumTracks = (albumId: string): TrackData[] =>
    albums.find((a) => a.id === albumId)?.tracks || [];

  const getStorageAlbumId = (album: AlbumData): string => album.albumId || album.id;

  const resolveStemsVisibility = (storageAlbumId: string, track: TrackData): StemsVisibility => {
    const key = stemKey(storageAlbumId, track.id);
    return stemsVisibilityByTrack[key] ?? normalizeStemsVisibility(track.stemsVisibility);
  };

  const handleStemsVisibilityChange = useCallback(
    async (storageAlbumId: string, trackId: string, visibility: StemsVisibility) => {
      const key = stemKey(storageAlbumId, trackId);
      try {
        await updateStemsVisibility(storageAlbumId, trackId, visibility);
        setStemsVisibilityByTrack((prev) => ({ ...prev, [key]: visibility }));
        flashStemTrackRow(mixerStemTrackRowId(storageAlbumId, trackId), visibility);
        notifyPublicSurfaceChanged({ type: 'stemsChanged', albumId: storageAlbumId });
      } catch (error) {
        console.error('[MixerAdmin] Failed to update stems visibility:', error);
      }
    },
    [flashStemTrackRow]
  );

  const setBusy = (albumId: string, trackId: string, stemId: string, value: boolean) => {
    const key = `${stemKey(albumId, trackId)}:${stemId}`;
    setBusyStems((prev) => ({ ...prev, [key]: value }));
  };
  const isBusy = (albumId: string, trackId: string, stemId: string) =>
    !!busyStems[`${stemKey(albumId, trackId)}:${stemId}`];

  const ensureTrackStems = useCallback(
    async (storageAlbumId: string, trackId: string) => {
      if (!storageUserId) return;

      const key = stemKey(storageAlbumId, trackId);
      const inFlight = inFlightTrackLoadsRef.current[key];
      if (inFlight) {
        return inFlight;
      }
      if (loadedTrackKeysRef.current.has(key)) {
        return;
      }

      const loadGeneration = (loadGenerationByKeyRef.current[key] ?? 0) + 1;
      loadGenerationByKeyRef.current[key] = loadGeneration;
      const localRevisionAtStart = localRevisionByKeyRef.current[key] ?? 0;

      const promise = (async () => {
        setLoadingTracks((prev) => ({ ...prev, [key]: true }));
        try {
          const { stems, accessToken, accessTokenExpiresAt } = await loadStems(
            storageUserId,
            storageAlbumId,
            trackId
          );

          if (
            !shouldApplyRemoteStemsLoad({
              currentLoadGeneration: loadGenerationByKeyRef.current[key] ?? 0,
              expectedLoadGeneration: loadGeneration,
              localRevisionAtLoadStart: localRevisionAtStart,
              currentLocalRevision: localRevisionByKeyRef.current[key] ?? 0,
            })
          ) {
            return;
          }

          loadedTrackKeysRef.current.add(key);
          commitTrackStems(key, stems);
          if (accessToken && accessTokenExpiresAt != null) {
            setStemAccessByTrack((prev) => ({
              ...prev,
              [key]: { accessToken, accessTokenExpiresAt },
            }));
          }
        } catch (error) {
          console.error('[MixerAdmin] Failed to load stems:', error);
          if (
            shouldApplyRemoteStemsLoad({
              currentLoadGeneration: loadGenerationByKeyRef.current[key] ?? 0,
              expectedLoadGeneration: loadGeneration,
              localRevisionAtLoadStart: localRevisionAtStart,
              currentLocalRevision: localRevisionByKeyRef.current[key] ?? 0,
            })
          ) {
            loadedTrackKeysRef.current.add(key);
            commitTrackStems(key, trackStemsRef.current[key] ?? []);
          }
        } finally {
          delete inFlightTrackLoadsRef.current[key];
          setLoadingTracks((prev) => ({ ...prev, [key]: false }));
        }
      })();

      inFlightTrackLoadsRef.current[key] = promise;
      return promise;
    },
    [storageUserId, commitTrackStems]
  );

  const preloadAlbumTrackStems = useCallback(
    (album: AlbumData) => {
      const storageAlbumId = getStorageAlbumId(album);
      album.tracks.forEach((track) => {
        void ensureTrackStems(storageAlbumId, track.id);
      });
    },
    [ensureTrackStems]
  );

  const { markUserInteracted } = useDashboardAccordionOnboarding({
    scope: 'mixer',
    enabled: tabActive,
    dataReady: albums.length > 0,
    albums,
    expandedAlbumId,
    expandedTrackId,
    onExpandAlbum: setExpandedAlbumId,
    onExpandTrack: setExpandedTrackId,
    buildTrackKey: (albumId, trackId) => {
      const album = albums.find((item) => item.id === albumId);
      return stemKey(album ? getStorageAlbumId(album) : albumId, trackId);
    },
    onAlbumAutoExpand: preloadAlbumTrackStems,
    onTrackAutoExpand: (album, trackId) => {
      void ensureTrackStems(getStorageAlbumId(album), trackId);
    },
  });

  useEffect(() => {
    if (!tabActive || albums.length === 0) {
      return;
    }

    const focusAlbumParam = searchParams.get('focusAlbum')?.trim();
    if (!focusAlbumParam) {
      return;
    }

    const album = albums.find(
      (entry) => entry.id === focusAlbumParam || entry.albumId === focusAlbumParam
    );
    if (!album) {
      return;
    }

    const storageAlbumId = getStorageAlbumId(album);
    markUserInteracted();
    setExpandedAlbumId(album.id);
    preloadAlbumTrackStems(album);

    const focusTrackParam = searchParams.get('focusTrack')?.trim();
    if (focusTrackParam) {
      const track = album.tracks.find((entry) => entry.id === focusTrackParam);
      if (track) {
        setExpandedTrackId(stemKey(storageAlbumId, track.id));
        void ensureTrackStems(storageAlbumId, track.id);
      }
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete('focusAlbum');
    nextParams.delete('focusTrack');
    const nextQuery = nextParams.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextQuery ? `?${nextQuery}` : '',
      },
      { replace: true, state: location.state }
    );
  }, [
    albums,
    ensureTrackStems,
    location.pathname,
    location.state,
    markUserInteracted,
    navigate,
    preloadAlbumTrackStems,
    searchParams,
    tabActive,
  ]);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setPlayingStemId(null);
  }, []);

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  useEffect(() => {
    if (!onMountPinChange) return;
    const pinned =
      playingStemId !== null ||
      addModal !== null ||
      deleteTarget !== null ||
      Object.values(busyStems).some(Boolean);
    onMountPinChange(pinned);
  }, [addModal, busyStems, deleteTarget, onMountPinChange, playingStemId]);

  const handleTogglePlay = useCallback(
    (storageAlbumId: string, trackId: string, stem: StemMeta) => {
      if (playingStemId === stem.id) {
        stopPlayback();
        return;
      }
      const access = stemAccessByTrack[stemKey(storageAlbumId, trackId)];
      const url = getStemAudioUrl(
        storageUserId,
        storageAlbumId,
        trackId,
        stem,
        access?.accessToken ?? null,
        access?.accessTokenExpiresAt ?? null
      );
      if (!url) return;
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.addEventListener('ended', () => setPlayingStemId(null));
      }
      audioRef.current.src = url;
      void audioRef.current.play().catch(() => setPlayingStemId(null));
      setPlayingStemId(stem.id);
    },
    [playingStemId, stopPlayback, stemAccessByTrack, storageUserId]
  );

  const handleAddStem = useCallback(
    async (
      storageAlbumId: string,
      trackId: string,
      name: string,
      category: StemCategory,
      file: File
    ) => {
      const { fileName } = await uploadStemAudio(storageAlbumId, trackId, file);
      const newStem: StemMeta = {
        id: uniqueUploadFileSuffix(),
        name,
        category,
        file: fileName,
        size: file.size,
        originalFileName: file.name,
      };
      const key = stemKey(storageAlbumId, trackId);

      await runTrackMutationRef.current(key, async () => {
        const previous = readTrackStemsSnapshot(key);
        const next = [...previous, newStem];
        stageTrackStemsForPersist(key, next);
        try {
          await persistTrackStems(storageAlbumId, trackId);
          commitTrackStems(key, next);
          setAddModal(null);
          toast.show({
            variant: 'success',
            title: formatStemToastMessage(name, t.addStemSuccessToast, lang, 'added'),
            duration: STEM_ADDED_TOAST_DURATION_MS,
          });
        } catch (error) {
          revertTrackStemsStage(key, previous);
          throw error;
        }
      });
    },
    [
      readTrackStemsSnapshot,
      stageTrackStemsForPersist,
      revertTrackStemsStage,
      commitTrackStems,
      persistTrackStems,
      t,
      lang,
    ]
  );

  const handleReplaceFile = useCallback(
    async (storageAlbumId: string, trackId: string, stem: StemMeta, file: File) => {
      const key = stemKey(storageAlbumId, trackId);
      setBusy(storageAlbumId, trackId, stem.id, true);
      try {
        const { fileName } = await uploadStemAudio(storageAlbumId, trackId, file);
        await runTrackMutationRef.current(key, async () => {
          const previous = readTrackStemsSnapshot(key);
          const next = previous.map((s) =>
            s.id === stem.id
              ? { ...s, file: fileName, size: file.size, originalFileName: file.name }
              : s
          );
          stageTrackStemsForPersist(key, next);
          try {
            await persistTrackStems(storageAlbumId, trackId);
            commitTrackStems(key, next);
          } catch (error) {
            revertTrackStemsStage(key, previous);
            throw error;
          }
        });
        if (playingStemId === stem.id) stopPlayback();
        // Старый файл удаляем по возможности (не критично при ошибке).
        if (stem.file && stem.file !== fileName) {
          deleteStemFile(
            getStemStoragePath(storageUserId, storageAlbumId, trackId, stem.file)
          ).catch(() => undefined);
        }
      } catch (error) {
        console.error('[MixerAdmin] Failed to replace stem file:', error);
      } finally {
        setBusy(storageAlbumId, trackId, stem.id, false);
      }
    },
    [
      playingStemId,
      stopPlayback,
      storageUserId,
      readTrackStemsSnapshot,
      stageTrackStemsForPersist,
      revertTrackStemsStage,
      commitTrackStems,
      persistTrackStems,
    ]
  );

  const handleRename = useCallback(
    async (storageAlbumId: string, trackId: string, stem: StemMeta, name: string) => {
      // Переименование НЕ меняет категорию автоматически.
      const key = stemKey(storageAlbumId, trackId);
      await runTrackMutationRef.current(key, async () => {
        const previous = readTrackStemsSnapshot(key);
        const next = previous.map((s) => (s.id === stem.id ? { ...s, name } : s));
        stageTrackStemsForPersist(key, next);
        commitTrackStems(key, next);
        try {
          await persistTrackStems(storageAlbumId, trackId);
        } catch (error) {
          revertTrackStemsStage(key, previous);
          commitTrackStems(key, previous);
          console.error('[MixerAdmin] Failed to rename stem:', error);
        }
      });
    },
    [
      readTrackStemsSnapshot,
      stageTrackStemsForPersist,
      revertTrackStemsStage,
      commitTrackStems,
      persistTrackStems,
    ]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const { albumId: storageAlbumId, trackId, stem } = deleteTarget;
    const deletedStemName = stem.name;
    const key = stemKey(storageAlbumId, trackId);
    setDeleteTarget(null);
    setBusy(storageAlbumId, trackId, stem.id, true);
    if (playingStemId === stem.id) stopPlayback();
    try {
      if (stem.file) {
        await deleteStemFile(
          getStemStoragePath(storageUserId, storageAlbumId, trackId, stem.file)
        ).catch(() => undefined);
      }
      await runTrackMutationRef.current(key, async () => {
        const previous = readTrackStemsSnapshot(key);
        const next = previous.filter((s) => s.id !== stem.id);
        stageTrackStemsForPersist(key, next);
        try {
          await persistTrackStems(storageAlbumId, trackId);
          commitTrackStems(key, next);
          toast.show({
            variant: 'success',
            title: formatStemToastMessage(
              deletedStemName,
              t.deleteStemSuccessToast,
              lang,
              'deleted'
            ),
            duration: STEM_DELETED_TOAST_DURATION_MS,
          });
        } catch (error) {
          revertTrackStemsStage(key, previous);
          console.error('[MixerAdmin] Failed to delete stem:', error);
        }
      });
    } finally {
      setBusy(storageAlbumId, trackId, stem.id, false);
    }
  }, [
    deleteTarget,
    playingStemId,
    stopPlayback,
    storageUserId,
    t,
    lang,
    readTrackStemsSnapshot,
    stageTrackStemsForPersist,
    revertTrackStemsStage,
    commitTrackStems,
    persistTrackStems,
  ]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent, storageAlbumId: string, trackId: string) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const key = stemKey(storageAlbumId, trackId);
      await runTrackMutationRef.current(key, async () => {
        const previous = readTrackStemsSnapshot(key);
        const oldIndex = previous.findIndex((s) => s.id === active.id);
        const newIndex = previous.findIndex((s) => s.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;
        const next = arrayMove(previous, oldIndex, newIndex);
        stageTrackStemsForPersist(key, next);
        commitTrackStems(key, next);
        try {
          await persistTrackStems(storageAlbumId, trackId);
        } catch (error) {
          revertTrackStemsStage(key, previous);
          commitTrackStems(key, previous);
          console.error('[MixerAdmin] Failed to reorder stems:', error);
        }
      });
    },
    [
      readTrackStemsSnapshot,
      stageTrackStemsForPersist,
      revertTrackStemsStage,
      commitTrackStems,
      persistTrackStems,
    ]
  );

  if (albums.length === 0) {
    return null;
  }

  const toggleAlbum = (
    albumId: string,
    isAlbumOpen: boolean,
    tracks: TrackData[],
    storageAlbumId: string
  ) => {
    markUserInteracted();
    const nextOpen = isAlbumOpen ? null : albumId;
    setExpandedAlbumId(nextOpen);
    if (!isAlbumOpen) {
      tracks.forEach((track) => {
        void ensureTrackStems(storageAlbumId, track.id);
      });
    }
  };

  const toggleTrack = (
    trackKey: string,
    isTrackOpen: boolean,
    storageAlbumId: string,
    trackId: string
  ) => {
    markUserInteracted();
    if (isTrackOpen) {
      setExpandedTrackId(null);
    } else {
      setExpandedTrackId(trackKey);
      void ensureTrackStems(storageAlbumId, trackId);
    }
  };

  return (
    <>
      <div className="user-dashboard__section">
        <div className="user-dashboard__albums-list">
          {albums.map((album) => {
            const tracks = getAlbumTracks(album.id);
            const isAlbumOpen = expandedAlbumId === album.id;
            const storageAlbumId = getStorageAlbumId(album);
            return (
              <DashboardCard
                key={album.id}
                interactive
                className={clsx('user-dashboard__album-card', {
                  'user-dashboard__album-card--expanded': isAlbumOpen,
                })}
              >
                <DashboardExpandableRowTrigger
                  expanded={isAlbumOpen}
                  onToggle={() => toggleAlbum(album.id, isAlbumOpen, tracks, storageAlbumId)}
                  aria-label={isAlbumOpen ? 'Collapse album' : 'Expand album'}
                  className={clsx('user-dashboard__album-header', 'user-dashboard__album-item')}
                >
                  <div className="user-dashboard__album-thumbnail">
                    {album.cover ? (
                      <AlbumCoverImage
                        cover={album.cover}
                        userId={album.userId ?? userId}
                        alt={album.title}
                        contextAlbumId={album.id}
                        logContext="mixer"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <img src="/images/album-placeholder.png" alt={album.title} />
                    )}
                  </div>
                  <div className="user-dashboard__album-info">
                    <div className="user-dashboard__album-title">{album.title}</div>
                    {album.releaseDate ? (
                      <div className="user-dashboard__album-date">{album.releaseDate}</div>
                    ) : (
                      <div className="user-dashboard__album-year">{album.year}</div>
                    )}
                  </div>
                  <div className="user-dashboard__album-arrow">
                    <DashboardExpandChevron expanded={isAlbumOpen} />
                  </div>
                </DashboardExpandableRowTrigger>

                {isAlbumOpen ? (
                  <div className="user-dashboard__album-body user-dashboard__album-expanded user-dashboard__album-expanded--kit">
                    <div className="user-dashboard__expanded-tracks">
                      <h3 className="visually-hidden">{labels.tracks}</h3>
                      {tracks.length === 0 ? (
                        <MixerNoTracksEmptyState
                          ui={ui}
                          className="mixer-admin__no-tracks-empty"
                          onGoToAlbum={() =>
                            navigate(`/dashboard/albums?focusAlbum=${encodeURIComponent(album.id)}`)
                          }
                        />
                      ) : (
                        tracks.map((track, trackIndex) => {
                          const trackKey = stemKey(storageAlbumId, track.id);
                          const isTrackOpen = expandedTrackId === trackKey;
                          const stems = trackStems[trackKey] ?? [];
                          const isLoading = loadingTracks[trackKey];
                          const hasStems = !isLoading && stems.length > 0;
                          const stemTrackRowFlash = getDashboardRowFlashProps(
                            mixerStemTrackRowId(storageAlbumId, track.id),
                            stemTrackRowFlashes
                          );
                          return (
                            <div
                              key={track.id}
                              id={mixerStemTrackRowId(storageAlbumId, track.id)}
                              className={clsx(
                                'user-dashboard__expanded-track-row',
                                stemTrackRowFlash.className
                              )}
                              style={stemTrackRowFlash.style}
                              data-visibility-flash={stemTrackRowFlash['data-visibility-flash']}
                            >
                              <DashboardCard
                                as="article"
                                interactive
                                className={clsx(
                                  'user-dashboard__expanded-track-card',
                                  isTrackOpen && 'user-dashboard__expanded-track-card--expanded'
                                )}
                              >
                                <div
                                  className="user-dashboard__expanded-track-header"
                                  role="button"
                                  tabIndex={0}
                                  aria-expanded={isTrackOpen}
                                  onClick={() =>
                                    toggleTrack(trackKey, isTrackOpen, storageAlbumId, track.id)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      toggleTrack(trackKey, isTrackOpen, storageAlbumId, track.id);
                                    }
                                  }}
                                >
                                  <span
                                    className="user-dashboard__expanded-track-chevron"
                                    aria-hidden
                                  >
                                    <DashboardExpandChevron expanded={isTrackOpen} />
                                  </span>
                                  <span className="user-dashboard__expanded-track-number">
                                    {String(trackIndex + 1).padStart(2, '0')}
                                  </span>
                                  <span className="user-dashboard__expanded-track-title">
                                    {track.title ||
                                      (track as any).trackTitle ||
                                      (track as any).trackId}
                                  </span>
                                  <span className="user-dashboard__expanded-track-duration">
                                    {track.duration}
                                  </span>
                                  {hasStems ? (
                                    <span className="user-dashboard__expanded-track-access-slot">
                                      <StemAccessControl
                                        albumId={storageAlbumId}
                                        trackId={track.id}
                                        visibility={resolveStemsVisibility(storageAlbumId, track)}
                                        onVisibilityChange={handleStemsVisibilityChange}
                                        ui={ui}
                                      />
                                    </span>
                                  ) : null}
                                </div>

                                {isTrackOpen && (
                                  <div className="user-dashboard__expanded-track-body">
                                    {isLoading ? (
                                      <DashboardLoadingState className="mixer-admin__track-loading" />
                                    ) : stems.length === 0 ? (
                                      <DashboardEmptyState
                                        variant="card"
                                        icon={
                                          <AudioLinesIcon
                                            {...dashboardActionIconProps({
                                              size: 48,
                                              strokeWidth: 1.5,
                                            })}
                                          />
                                        }
                                        title={labels.emptyTitle}
                                        description={labels.emptyDescription}
                                        action={
                                          <DashboardButton
                                            variant="primary"
                                            onClick={() =>
                                              setAddModal({
                                                albumId: storageAlbumId,
                                                trackId: track.id,
                                              })
                                            }
                                          >
                                            <PlusIcon {...dashboardActionIconProps({ size: 18 })} />
                                            {labels.addStem}
                                          </DashboardButton>
                                        }
                                      />
                                    ) : (
                                      <>
                                        <div className="mixer-admin__stems-toolbar">
                                          <DashboardButton
                                            variant="outline"
                                            onClick={() =>
                                              setAddModal({
                                                albumId: storageAlbumId,
                                                trackId: track.id,
                                              })
                                            }
                                          >
                                            <PlusIcon {...dashboardActionIconProps({ size: 18 })} />
                                            {labels.addStem}
                                          </DashboardButton>
                                        </div>
                                        <DndContext
                                          sensors={sensors}
                                          collisionDetection={closestCenter}
                                          onDragEnd={(event) =>
                                            handleDragEnd(event, storageAlbumId, track.id)
                                          }
                                        >
                                          <SortableContext
                                            items={stems.map((s) => s.id)}
                                            strategy={verticalListSortingStrategy}
                                          >
                                            <div className="mixer-admin__stems-list">
                                              {stems.map((stem) => (
                                                <SortableStemRow
                                                  key={stem.id}
                                                  stem={stem}
                                                  labels={rowLabels}
                                                  busy={isBusy(storageAlbumId, track.id, stem.id)}
                                                  isPlaying={playingStemId === stem.id}
                                                  onTogglePlay={() =>
                                                    handleTogglePlay(storageAlbumId, track.id, stem)
                                                  }
                                                  onReplaceFile={(file) =>
                                                    handleReplaceFile(
                                                      storageAlbumId,
                                                      track.id,
                                                      stem,
                                                      file
                                                    )
                                                  }
                                                  onRename={(name) =>
                                                    handleRename(
                                                      storageAlbumId,
                                                      track.id,
                                                      stem,
                                                      name
                                                    )
                                                  }
                                                  onDelete={() =>
                                                    setDeleteTarget({
                                                      albumId: storageAlbumId,
                                                      trackId: track.id,
                                                      stem,
                                                    })
                                                  }
                                                />
                                              ))}
                                            </div>
                                          </SortableContext>
                                        </DndContext>
                                      </>
                                    )}
                                  </div>
                                )}
                              </DashboardCard>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : null}
              </DashboardCard>
            );
          })}
        </div>
      </div>

      <AddStemModal
        isOpen={!!addModal}
        lang={lang === 'en' ? 'en' : 'ru'}
        labels={modalLabels}
        onClose={() => setAddModal(null)}
        onSubmit={(name, category, file) =>
          addModal
            ? handleAddStem(addModal.albumId, addModal.trackId, name, category, file)
            : undefined
        }
      />

      <ConfirmationModal
        isOpen={!!deleteTarget}
        title={t.deleteStemTitle ?? 'Удалить стем?'}
        message={
          deleteTarget
            ? (t.deleteStemMessage ?? 'Стем «{name}» будет удалён.').replace(
                '{name}',
                deleteTarget.stem.name
              )
            : ''
        }
        irreversibleHint={t.deleteStemHint ?? 'Это действие нельзя отменить.'}
        confirmText={t.rowDelete ?? 'Удалить'}
        cancelText={t.cancel ?? 'Отмена'}
        closeLabel={t.close ?? 'Закрыть'}
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
