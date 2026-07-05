// src/pages/UserDashboard/components/mixer/MixerAdmin.tsx
import React, { useCallback, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
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
import type { AlbumData, TrackData } from '@entities/album/lib/transformAlbumData';
import { AlbumCoverImage } from '@entities/album';
import { getUserUserId } from '@config/user';
import { useLang } from '@app/providers/lang';
import { uniqueUploadFileSuffix } from '@shared/lib/uniqueUploadFileSuffix';
import {
  DashboardAction,
  DashboardCard,
  DashboardCta,
  DashboardEmptyState,
  DashboardExpandableRowTrigger,
  DashboardSection,
} from '@shared/ui/dashboard';
import './MixerAdmin.scss';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { ConfirmationModal } from '@shared/ui/confirmationModal';
import { StemAddedToast } from '@shared/ui/stemAddedToast/StemAddedToast';
import { StemDeletedToast } from '@shared/ui/stemDeletedToast/StemDeletedToast';
import { queueStemAddedToast } from '@shared/lib/stemAddedToast';
import { queueStemDeletedToast } from '@shared/lib/stemDeletedToast';
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
import { getDashboardRowFlashProps, useDashboardRowFlash } from '../../lib/dashboardRowStateFlash';
import { DashboardExpandChevron } from '../../lib/dashboardExpandChevron';
import { AddStemModal, type AddStemModalLabels } from './AddStemModal';
import { SortableStemRow, type StemRowLabels } from './SortableStemRow';
import { StemAccessControl } from './StemAccessControl';

interface MixerAdminProps {
  ui?: IInterface;
  userId?: string;
  albums?: AlbumData[];
}

interface DeleteTarget {
  albumId: string;
  trackId: string;
  stem: StemMeta;
}

/**
 * Составной ключ для любого клиентского кэша/стейта, привязанного к треку в микшере.
 *
 * Откуда берётся track.id в UI (TrackData.id / IAlbums.tracks[].id):
 * - В БД: колонка `tracks.track_id` (VARCHAR), уникальность только в паре с альбомом —
 *   `UNIQUE(album_id, track_id)` (см. database/migrations/003_create_users_albums_tracks.sql).
 * - Это НЕ глобальный PK строки `tracks.id` (UUID) и не slug названия трека.
 * - API: `netlify/functions/albums.ts` → `mapAlbumToApiFormat` кладёт `track.track_id` в поле `id`.
 * - UI: `transformAlbumToAlbumData` → `id: String(track.id)`.
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

export function MixerAdmin({ ui, userId, albums = [] }: MixerAdminProps) {
  // ui.dashboard.mixer пока не полностью описан в типах IInterface, берём через any.
  const t = useMemo(() => (ui as any)?.dashboard?.mixer ?? {}, [ui]);
  const { lang } = useLang();

  const [expandedAlbumId, setExpandedAlbumId] = useState<string | null>(null);
  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null);
  const [trackStems, setTrackStems] = useState<Record<string, StemMeta[]>>({});
  const [stemAccessByTrack, setStemAccessByTrack] = useState<
    Record<string, { accessToken: string; accessTokenExpiresAt: number }>
  >({});
  const [loadingTracks, setLoadingTracks] = useState<Record<string, boolean>>({});
  const [busyStems, setBusyStems] = useState<Record<string, boolean>>({});
  const [addModal, setAddModal] = useState<{ albumId: string; trackId: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [stemAddedToastTrigger, setStemAddedToastTrigger] = useState(0);
  const [stemDeletedToastTrigger, setStemDeletedToastTrigger] = useState(0);
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
      stems: t.stems ?? 'Стемы',
      stemsDescription:
        t.stemsHint ?? 'Загружайте стемы трека. Вы можете добавлять любые инструменты.',
      emptyTitle: t.stemsEmptyTitle ?? 'Стемы не добавлены',
      emptyDescription: t.stemsEmptyDescription ?? 'Добавьте первый стем для этого трека.',
      noTracks: t.noTracks ?? 'Нет треков в альбоме',
      loading: t.loading ?? 'Загрузка…',
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
        window.dispatchEvent(new CustomEvent('stems-visibility-updated'));
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
      if (trackStems[key]) return;
      setLoadingTracks((prev) => ({ ...prev, [key]: true }));
      try {
        const { stems, accessToken, accessTokenExpiresAt } = await loadStems(
          storageUserId,
          storageAlbumId,
          trackId
        );
        setTrackStems((prev) => ({ ...prev, [key]: stems }));
        if (accessToken && accessTokenExpiresAt != null) {
          setStemAccessByTrack((prev) => ({
            ...prev,
            [key]: { accessToken, accessTokenExpiresAt },
          }));
        }
      } catch (error) {
        console.error('[MixerAdmin] Failed to load stems:', error);
        setTrackStems((prev) => ({ ...prev, [key]: prev[key] ?? [] }));
      } finally {
        setLoadingTracks((prev) => ({ ...prev, [key]: false }));
      }
    },
    [storageUserId, trackStems]
  );

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setPlayingStemId(null);
  }, []);

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
      const next = [...(trackStems[key] ?? []), newStem];
      await saveStemsManifest(storageAlbumId, trackId, next);
      setTrackStems((prev) => ({ ...prev, [key]: next }));
      setAddModal(null);
      queueStemAddedToast(formatStemToastMessage(name, t.addStemSuccessToast, lang, 'added'));
      setStemAddedToastTrigger((n) => n + 1);
    },
    [trackStems, t, lang]
  );

  const handleReplaceFile = useCallback(
    async (storageAlbumId: string, trackId: string, stem: StemMeta, file: File) => {
      const key = stemKey(storageAlbumId, trackId);
      setBusy(storageAlbumId, trackId, stem.id, true);
      try {
        const { fileName } = await uploadStemAudio(storageAlbumId, trackId, file);
        const next = (trackStems[key] ?? []).map((s) =>
          s.id === stem.id
            ? { ...s, file: fileName, size: file.size, originalFileName: file.name }
            : s
        );
        await saveStemsManifest(storageAlbumId, trackId, next);
        setTrackStems((prev) => ({ ...prev, [key]: next }));
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
    [trackStems, playingStemId, stopPlayback, storageUserId]
  );

  const handleRename = useCallback(
    async (storageAlbumId: string, trackId: string, stem: StemMeta, name: string) => {
      // Переименование НЕ меняет категорию автоматически.
      const key = stemKey(storageAlbumId, trackId);
      const next = (trackStems[key] ?? []).map((s) => (s.id === stem.id ? { ...s, name } : s));
      setTrackStems((prev) => ({ ...prev, [key]: next }));
      try {
        await saveStemsManifest(storageAlbumId, trackId, next);
      } catch (error) {
        console.error('[MixerAdmin] Failed to rename stem:', error);
      }
    },
    [trackStems]
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
      const next = (trackStems[key] ?? []).filter((s) => s.id !== stem.id);
      await saveStemsManifest(storageAlbumId, trackId, next);
      setTrackStems((prev) => ({ ...prev, [key]: next }));
      queueStemDeletedToast(
        formatStemToastMessage(deletedStemName, t.deleteStemSuccessToast, lang, 'deleted')
      );
      setStemDeletedToastTrigger((n) => n + 1);
    } catch (error) {
      console.error('[MixerAdmin] Failed to delete stem:', error);
    } finally {
      setBusy(storageAlbumId, trackId, stem.id, false);
    }
  }, [deleteTarget, trackStems, playingStemId, stopPlayback, storageUserId, t, lang]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent, storageAlbumId: string, trackId: string) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const key = stemKey(storageAlbumId, trackId);
      const stems = trackStems[key] ?? [];
      const oldIndex = stems.findIndex((s) => s.id === active.id);
      const newIndex = stems.findIndex((s) => s.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const next = arrayMove(stems, oldIndex, newIndex);
      setTrackStems((prev) => ({ ...prev, [key]: next }));
      try {
        await saveStemsManifest(storageAlbumId, trackId, next);
      } catch (error) {
        console.error('[MixerAdmin] Failed to reorder stems:', error);
      }
    },
    [trackStems]
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
    const nextOpen = isAlbumOpen ? null : albumId;
    setExpandedAlbumId(nextOpen);
    if (!isAlbumOpen) {
      tracks.forEach((track) => {
        void ensureTrackStems(storageAlbumId, track.id);
      });
    }
  };

  return (
    <>
      <DashboardSection title={t?.title ?? 'Mixer'}>
        <div className="user-dashboard__albums-list mixer-admin__albums">
          {albums.map((album) => {
            const tracks = getAlbumTracks(album.id);
            const isAlbumOpen = expandedAlbumId === album.id;
            const storageAlbumId = getStorageAlbumId(album);
            return (
              <React.Fragment key={album.id}>
                <DashboardExpandableRowTrigger
                  expanded={isAlbumOpen}
                  onToggle={() => toggleAlbum(album.id, isAlbumOpen, tracks, storageAlbumId)}
                  aria-label={isAlbumOpen ? 'Collapse album' : 'Expand album'}
                >
                  <DashboardCard
                    interactive
                    selected={isAlbumOpen}
                    className={clsx(
                      'user-dashboard__album-item',
                      isAlbumOpen && 'user-dashboard__album-item--expanded'
                    )}
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
                  </DashboardCard>
                </DashboardExpandableRowTrigger>

                {isAlbumOpen && (
                  <DashboardCard className="user-dashboard__album-expanded user-dashboard__album-expanded--kit">
                    <div className="user-dashboard__tracks-list mixer-admin__tracks">
                      {tracks.length === 0 ? (
                        <div className="mixer-admin__placeholder">{labels.noTracks}</div>
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
                                'mixer-admin__track-row',
                                stemTrackRowFlash.className
                              )}
                              style={stemTrackRowFlash.style}
                              data-visibility-flash={stemTrackRowFlash['data-visibility-flash']}
                            >
                              <DashboardCard
                                as="article"
                                interactive
                                className={clsx(
                                  'mixer-admin__track-card',
                                  isTrackOpen && 'mixer-admin__track-card--expanded'
                                )}
                              >
                                <div
                                  className="mixer-admin__track-header"
                                  role="button"
                                  tabIndex={0}
                                  aria-expanded={isTrackOpen}
                                  onClick={() => {
                                    if (isTrackOpen) {
                                      setExpandedTrackId(null);
                                    } else {
                                      setExpandedTrackId(trackKey);
                                      ensureTrackStems(storageAlbumId, track.id);
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      if (isTrackOpen) {
                                        setExpandedTrackId(null);
                                      } else {
                                        setExpandedTrackId(trackKey);
                                        ensureTrackStems(storageAlbumId, track.id);
                                      }
                                    }
                                  }}
                                >
                                  <span className="mixer-admin__track-chevron" aria-hidden>
                                    <DashboardExpandChevron expanded={isTrackOpen} />
                                  </span>
                                  <span className="mixer-admin__track-number">
                                    {String(trackIndex + 1).padStart(2, '0')}
                                  </span>
                                  <span className="mixer-admin__track-title">
                                    {track.title ||
                                      (track as any).trackTitle ||
                                      (track as any).trackId}
                                  </span>
                                  {hasStems && (
                                    <StemAccessControl
                                      albumId={storageAlbumId}
                                      trackId={track.id}
                                      visibility={resolveStemsVisibility(storageAlbumId, track)}
                                      onVisibilityChange={handleStemsVisibilityChange}
                                      ui={ui}
                                    />
                                  )}
                                  <span className="mixer-admin__track-duration">
                                    {track.duration}
                                  </span>
                                </div>

                                {isTrackOpen && (
                                  <div className="mixer-admin__track-body">
                                    <div className="mixer-admin__stems-header">
                                      <div>
                                        <h4 className="mixer-admin__subsection-title">
                                          {labels.stems}
                                        </h4>
                                        <p className="mixer-admin__stems-description">
                                          {labels.stemsDescription}
                                        </p>
                                      </div>
                                      {!isLoading && stems.length > 0 && (
                                        <DashboardAction
                                          className="mixer-admin__add-stem"
                                          onClick={() =>
                                            setAddModal({
                                              albumId: storageAlbumId,
                                              trackId: track.id,
                                            })
                                          }
                                        >
                                          <PlusIcon {...dashboardActionIconProps({ size: 18 })} />
                                          {labels.addStem}
                                        </DashboardAction>
                                      )}
                                    </div>

                                    {isLoading ? (
                                      <div className="mixer-admin__placeholder">
                                        {labels.loading}
                                      </div>
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
                                          <DashboardCta
                                            className="mixer-admin__add-stem"
                                            onClick={() =>
                                              setAddModal({
                                                albumId: storageAlbumId,
                                                trackId: track.id,
                                              })
                                            }
                                          >
                                            <PlusIcon {...dashboardActionIconProps({ size: 18 })} />
                                            {labels.addStem}
                                          </DashboardCta>
                                        }
                                      />
                                    ) : (
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
                                                  handleRename(storageAlbumId, track.id, stem, name)
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
                                    )}
                                  </div>
                                )}
                              </DashboardCard>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </DashboardCard>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </DashboardSection>

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

      <StemDeletedToast triggerKey={stemDeletedToastTrigger} />
      <StemAddedToast triggerKey={stemAddedToastTrigger} />
    </>
  );
}
