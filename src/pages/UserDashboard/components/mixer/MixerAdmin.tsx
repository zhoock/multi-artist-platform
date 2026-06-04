// src/pages/UserDashboard/components/mixer/MixerAdmin.tsx
import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { ConfirmationModal } from '@shared/ui/confirmationModal';
import {
  type StemMeta,
  type StemCategory,
  loadStems,
  saveStemsManifest,
  uploadStemAudio,
  deleteStemFile,
  getStemStoragePath,
  resolveStoragePublicUrl,
} from '@entities/stem';
import { DashboardExpandChevron } from '../../lib/dashboardExpandChevron';
import { AddStemModal, type AddStemModalLabels } from './AddStemModal';
import { SortableStemRow, type StemRowLabels } from './SortableStemRow';

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

export function MixerAdmin({ ui, userId, albums = [] }: MixerAdminProps) {
  // ui.dashboard.mixer пока не полностью описан в типах IInterface, берём через any.
  const t = useMemo(() => (ui as any)?.dashboard?.mixer ?? {}, [ui]);
  const { lang } = useLang();

  const [expandedAlbumId, setExpandedAlbumId] = useState<string | null>(null);
  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null);
  const [trackStems, setTrackStems] = useState<Record<string, StemMeta[]>>({});
  const [loadingTracks, setLoadingTracks] = useState<Record<string, boolean>>({});
  const [busyStems, setBusyStems] = useState<Record<string, boolean>>({});
  const [addModal, setAddModal] = useState<{ albumId: string; trackId: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [playingStemId, setPlayingStemId] = useState<string | null>(null);

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

  const setBusy = (trackId: string, stemId: string, value: boolean) => {
    const key = `${trackId}:${stemId}`;
    setBusyStems((prev) => ({ ...prev, [key]: value }));
  };
  const isBusy = (trackId: string, stemId: string) => !!busyStems[`${trackId}:${stemId}`];

  const ensureTrackStems = useCallback(
    async (storageAlbumId: string, trackId: string) => {
      if (!storageUserId) return;
      if (trackStems[trackId]) return;
      setLoadingTracks((prev) => ({ ...prev, [trackId]: true }));
      try {
        const stems = await loadStems(storageUserId, storageAlbumId, trackId);
        setTrackStems((prev) => ({ ...prev, [trackId]: stems }));
      } catch (error) {
        console.error('[MixerAdmin] Failed to load stems:', error);
        setTrackStems((prev) => ({ ...prev, [trackId]: prev[trackId] ?? [] }));
      } finally {
        setLoadingTracks((prev) => ({ ...prev, [trackId]: false }));
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
      const path = getStemStoragePath(storageUserId, storageAlbumId, trackId, stem.file);
      const url = resolveStoragePublicUrl(path);
      if (!url) return;
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.addEventListener('ended', () => setPlayingStemId(null));
      }
      audioRef.current.src = url;
      void audioRef.current.play().catch(() => setPlayingStemId(null));
      setPlayingStemId(stem.id);
    },
    [playingStemId, stopPlayback, storageUserId]
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
      const next = [...(trackStems[trackId] ?? []), newStem];
      await saveStemsManifest(storageAlbumId, trackId, next);
      setTrackStems((prev) => ({ ...prev, [trackId]: next }));
      setAddModal(null);
    },
    [trackStems]
  );

  const handleReplaceFile = useCallback(
    async (storageAlbumId: string, trackId: string, stem: StemMeta, file: File) => {
      setBusy(trackId, stem.id, true);
      try {
        const { fileName } = await uploadStemAudio(storageAlbumId, trackId, file);
        const next = (trackStems[trackId] ?? []).map((s) =>
          s.id === stem.id
            ? { ...s, file: fileName, size: file.size, originalFileName: file.name }
            : s
        );
        await saveStemsManifest(storageAlbumId, trackId, next);
        setTrackStems((prev) => ({ ...prev, [trackId]: next }));
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
        setBusy(trackId, stem.id, false);
      }
    },
    [trackStems, playingStemId, stopPlayback, storageUserId]
  );

  const handleRename = useCallback(
    async (storageAlbumId: string, trackId: string, stem: StemMeta, name: string) => {
      // Переименование НЕ меняет категорию автоматически.
      const next = (trackStems[trackId] ?? []).map((s) => (s.id === stem.id ? { ...s, name } : s));
      setTrackStems((prev) => ({ ...prev, [trackId]: next }));
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
    setDeleteTarget(null);
    setBusy(trackId, stem.id, true);
    if (playingStemId === stem.id) stopPlayback();
    try {
      if (stem.file) {
        await deleteStemFile(
          getStemStoragePath(storageUserId, storageAlbumId, trackId, stem.file)
        ).catch(() => undefined);
      }
      const next = (trackStems[trackId] ?? []).filter((s) => s.id !== stem.id);
      await saveStemsManifest(storageAlbumId, trackId, next);
      setTrackStems((prev) => ({ ...prev, [trackId]: next }));
    } catch (error) {
      console.error('[MixerAdmin] Failed to delete stem:', error);
    } finally {
      setBusy(trackId, stem.id, false);
    }
  }, [deleteTarget, trackStems, playingStemId, stopPlayback, storageUserId]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent, storageAlbumId: string, trackId: string) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const stems = trackStems[trackId] ?? [];
      const oldIndex = stems.findIndex((s) => s.id === active.id);
      const newIndex = stems.findIndex((s) => s.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const next = arrayMove(stems, oldIndex, newIndex);
      setTrackStems((prev) => ({ ...prev, [trackId]: next }));
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

  return (
    <>
      <div className="user-dashboard__albums-list">
        {albums.map((album, index) => {
          const tracks = getAlbumTracks(album.id);
          const isAlbumOpen = expandedAlbumId === album.id;
          const storageAlbumId = getStorageAlbumId(album);
          return (
            <React.Fragment key={album.id}>
              <div
                className={`user-dashboard__album-item ${isAlbumOpen ? 'user-dashboard__album-item--expanded' : ''}`}
                onClick={() => setExpandedAlbumId(isAlbumOpen ? null : album.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setExpandedAlbumId(isAlbumOpen ? null : album.id);
                  }
                }}
                aria-label={isAlbumOpen ? 'Collapse album' : 'Expand album'}
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
              </div>

              {isAlbumOpen && (
                <div className="user-dashboard__album-expanded">
                  <div className="user-dashboard__tracks-list">
                    {tracks.length === 0 ? (
                      <div className="mixer-admin__placeholder">{labels.noTracks}</div>
                    ) : (
                      tracks.map((track, trackIndex) => {
                        const isTrackOpen = expandedTrackId === track.id;
                        const stems = trackStems[track.id] ?? [];
                        const isLoading = loadingTracks[track.id];
                        return (
                          <div key={track.id} className="user-dashboard__track-item-wrapper">
                            <div className="user-dashboard__track-item-content">
                              <div
                                className={`user-dashboard__track-item${isTrackOpen ? ' user-dashboard__track-item--expanded' : ''}`}
                                role="button"
                                tabIndex={0}
                                aria-expanded={isTrackOpen}
                                onClick={() => {
                                  if (isTrackOpen) {
                                    setExpandedTrackId(null);
                                  } else {
                                    setExpandedTrackId(track.id);
                                    ensureTrackStems(storageAlbumId, track.id);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    if (isTrackOpen) {
                                      setExpandedTrackId(null);
                                    } else {
                                      setExpandedTrackId(track.id);
                                      ensureTrackStems(storageAlbumId, track.id);
                                    }
                                  }
                                }}
                              >
                                <div className="user-dashboard__track-number">
                                  {String(trackIndex + 1).padStart(2, '0')}
                                </div>
                                <div className="user-dashboard__track-title">
                                  {track.title ||
                                    (track as any).trackTitle ||
                                    (track as any).trackId}
                                </div>
                                <div className="user-dashboard__track-duration-container">
                                  <div className="user-dashboard__track-duration">
                                    {track.duration}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {isTrackOpen && (
                              <div className="mixer-admin__stems">
                                <div className="mixer-admin__stems-header">
                                  <div>
                                    <h4 className="mixer-admin__subsection-title">
                                      {labels.stems}
                                    </h4>
                                    <p className="mixer-admin__stems-description">
                                      {labels.stemsDescription}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    className="user-dashboard__choose-files-button mixer-admin__add-stem"
                                    onClick={() =>
                                      setAddModal({ albumId: storageAlbumId, trackId: track.id })
                                    }
                                  >
                                    <PlusIcon {...dashboardActionIconProps({ size: 18 })} />
                                    {labels.addStem}
                                  </button>
                                </div>

                                {isLoading ? (
                                  <div className="mixer-admin__placeholder">{labels.loading}</div>
                                ) : stems.length === 0 ? (
                                  <div className="mixer-admin__empty">
                                    <AudioLinesIcon
                                      className="mixer-admin__empty-icon"
                                      {...dashboardActionIconProps({ size: 48, strokeWidth: 1.5 })}
                                    />
                                    <h5 className="mixer-admin__empty-title">
                                      {labels.emptyTitle}
                                    </h5>
                                    <p className="mixer-admin__empty-description">
                                      {labels.emptyDescription}
                                    </p>
                                    <button
                                      type="button"
                                      className="user-dashboard__tab-empty-cta mixer-admin__add-stem"
                                      onClick={() =>
                                        setAddModal({ albumId: storageAlbumId, trackId: track.id })
                                      }
                                    >
                                      <PlusIcon {...dashboardActionIconProps({ size: 18 })} />
                                      {labels.addStem}
                                    </button>
                                  </div>
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
                                            busy={isBusy(track.id, stem.id)}
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
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {index < albums.length - 1 && <div className="user-dashboard__album-divider"></div>}
            </React.Fragment>
          );
        })}
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
