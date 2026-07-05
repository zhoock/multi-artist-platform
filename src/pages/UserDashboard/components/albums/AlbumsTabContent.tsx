import React, { useMemo } from 'react';
import clsx from 'clsx';
import {
  Eye as EyeIcon,
  Pencil as PencilIcon,
  Plus as PlusIcon,
  RefreshCw as RefreshCwIcon,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

import { getAlbumPublishHintKey } from '@entities/album/lib/isAlbumReadyToPublish';
import { isAlbumPublished } from '@entities/album/lib/albumPublication';
import { getAlbumListDraftBadge } from '@entities/album/lib/albumLifecycleStatus';
import { AlbumCoverImage } from '@entities/album';
import type { AlbumData, TrackData } from '@entities/album/lib/transformAlbumData';
import type { IAlbums, IInterface } from '@models';
import type { SupportedLang } from '@shared/model/lang';
import type { TrackVisibility } from '@shared/lib/tracks/trackVisibility';
import { EmailVerificationOnboarding } from '@shared/lib/emailVerification';
import { SubscriberContentLockIcon } from '@shared/ui/icons/SubscriberContentLockIcon';
import {
  DashboardCard,
  DashboardAction,
  DashboardCta,
  DashboardExpandableRowTrigger,
  DashboardIconButton,
} from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import {
  getDashboardRowFlashProps,
  type DashboardRowFlash,
} from '../../lib/dashboardRowStateFlash';
import { DashboardExpandChevron } from '../../lib/dashboardExpandChevron';
import { ArticlesListSkeleton } from '../articles/ArticlesListSkeleton';
import { AlbumAccessControl } from './AlbumAccessControl';
import { AlbumLifecycleBadge } from './AlbumLifecycleBadge';
import { AlbumsEmptyState } from './AlbumsEmptyState';
import { getAlbumVisibilityFromIsPublic } from './albumVisibilityOptions';
import { SortableTrackItem } from './SortableTrackItem';

type AlbumsTabContentProps = {
  emailVerified: boolean;
  initialLoading: boolean;
  albumsData: AlbumData[];
  albumsFromStore: IAlbums[];
  expandedAlbumId: string | null;
  albumAccessMenuAlbumId: string | null;
  publishingAlbumId: string | null;
  isUploadingTracks: Record<string, boolean>;
  uploadProgress: Record<string, number>;
  dashboardRowFlashes: Record<string, DashboardRowFlash>;
  ui: IInterface | null;
  lang: SupportedLang;
  userId: string | null;
  trackUploadSectionRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  fileInputRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  onCreateAlbum: () => void;
  onEditAlbum: (albumId: string) => void;
  onToggleAlbum: (albumId: string) => void;
  onAlbumAccessMenuChange: (albumId: string | null) => void;
  onAlbumVisibilityChange: (
    albumId: string,
    visibility: Extract<TrackVisibility, 'public' | 'hidden'>
  ) => void;
  onTrackUpload: (albumId: string, files: FileList) => void;
  onDragEnd: (event: DragEndEvent, albumId: string) => void;
  onDeleteTrack: (albumId: string, trackId: string, trackTitle: string) => void;
  onTrackTitleChange: (albumId: string, trackId: string, newTitle: string) => Promise<void>;
  onTrackVisibilityChange: (
    albumId: string,
    trackId: string,
    visibility: TrackVisibility
  ) => Promise<void>;
  onDeleteAlbum: (albumId: string) => void;
  onPublishAlbum: (albumId: string) => void;
  onLyricsAction: (action: string, albumId: string, trackId: string, trackTitle: string) => void;
};

function getLyricsStatusText(status: TrackData['lyricsStatus'], ui: IInterface | null) {
  switch (status) {
    case 'synced':
      return ui?.dashboard?.addedSynced ?? 'Added, synced';
    case 'text-only':
      return ui?.dashboard?.addedNoSync ?? 'Added, no sync';
    case 'empty':
      return ui?.dashboard?.noLyrics ?? 'No lyrics';
    default:
      return '';
  }
}

type LyricsAction = 'edit' | 'prev' | 'sync' | 'add';

function getLyricsActionLabel(action: LyricsAction, ui: IInterface | null): string {
  switch (action) {
    case 'edit':
      return ui?.dashboard?.editLyrics ?? 'Edit lyrics';
    case 'prev':
      return ui?.dashboard?.previewLyrics ?? 'Preview lyrics';
    case 'sync':
      return ui?.dashboard?.syncLyricsTitle ?? 'Sync lyrics';
    case 'add':
      return ui?.dashboard?.addLyrics ?? 'Add lyrics';
    default:
      return '';
  }
}

function renderLyricsActionIcon(action: LyricsAction) {
  const iconProps = dashboardActionIconProps();

  switch (action) {
    case 'edit':
      return <PencilIcon {...iconProps} />;
    case 'prev':
      return <EyeIcon {...iconProps} />;
    case 'sync':
      return <RefreshCwIcon {...iconProps} />;
    case 'add':
      return <PlusIcon {...iconProps} />;
    default:
      return null;
  }
}

function getLyricsActions(
  status: TrackData['lyricsStatus'],
  hasSyncedLyrics: boolean = false
): LyricsAction[] {
  switch (status) {
    case 'synced': {
      const actions: LyricsAction[] = ['edit'];
      if (hasSyncedLyrics) {
        actions.push('prev');
      }
      actions.push('sync');
      return actions;
    }
    case 'text-only':
      return ['edit', 'sync'];
    case 'empty':
      return ['add'];
    default:
      return [];
  }
}

export function AlbumsTabContent({
  emailVerified,
  initialLoading,
  albumsData,
  albumsFromStore,
  expandedAlbumId,
  albumAccessMenuAlbumId,
  publishingAlbumId,
  isUploadingTracks,
  uploadProgress,
  dashboardRowFlashes,
  ui,
  lang,
  userId,
  trackUploadSectionRefs,
  fileInputRefs,
  onCreateAlbum,
  onEditAlbum,
  onToggleAlbum,
  onAlbumAccessMenuChange,
  onAlbumVisibilityChange,
  onTrackUpload,
  onDragEnd,
  onDeleteTrack,
  onTrackTitleChange,
  onTrackVisibilityChange,
  onDeleteAlbum,
  onPublishAlbum,
  onLyricsAction,
}: AlbumsTabContentProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const publishHintCopy = useMemo(
    () => ({
      ready:
        ui?.dashboard?.albumPublishHintReady ??
        (lang !== 'ru' ? 'This album is ready for publication.' : 'Альбом готов к публикации.'),
      cover:
        ui?.dashboard?.albumPublishHintNeedsCover ??
        (lang !== 'ru'
          ? 'Upload album cover art to publish this album.'
          : 'Загрузите обложку альбома для публикации.'),
      tracks:
        ui?.dashboard?.albumPublishHintNeedsTracks ??
        (lang !== 'ru'
          ? 'Upload at least one track to publish this album.'
          : 'Загрузите хотя бы один трек для публикации альбома.'),
      fields:
        ui?.dashboard?.albumPublishHintNeedsFields ??
        (lang !== 'ru'
          ? 'Complete all required album fields to publish.'
          : 'Заполните все обязательные поля альбома для публикации.'),
    }),
    [lang, ui?.dashboard]
  );

  if (!emailVerified) {
    return <EmailVerificationOnboarding context="albums" />;
  }

  if (initialLoading) {
    return (
      <div className="user-dashboard__section">
        <ArticlesListSkeleton count={4} />
      </div>
    );
  }

  if (albumsData.length === 0) {
    return <AlbumsEmptyState ui={ui} onCreateAlbum={onCreateAlbum} />;
  }

  return (
    <div className="user-dashboard__section">
      <div className="user-dashboard__albums-list">
        {albumsData.map((album) => {
          const isExpanded = expandedAlbumId === album.id;
          const albumFromStore = albumsFromStore.find(
            (a) => a.albumId === album.id || a.albumId === album.albumId
          );
          const albumDraftBadge = albumFromStore
            ? getAlbumListDraftBadge({
                ...albumFromStore,
                tracks:
                  album.tracks.length === 0
                    ? []
                    : (albumFromStore.tracks ?? []).slice(0, album.tracks.length),
              })
            : isAlbumPublished({
                  isPublished: album.isPublished,
                  isPublic: album.isPublic,
                })
              ? null
              : 'draft';
          const albumIsPublished = albumFromStore
            ? isAlbumPublished(albumFromStore)
            : isAlbumPublished({
                isPublished: album.isPublished,
                isPublic: album.isPublic,
              });
          const albumVisibility = getAlbumVisibilityFromIsPublic(
            albumFromStore?.isPublic ?? album.isPublic
          );
          const publishHintKey = albumFromStore ? getAlbumPublishHintKey(albumFromStore) : 'fields';
          const canPublishAlbum = publishHintKey === 'ready' && Boolean(albumFromStore);
          const isPublishingAlbum = publishingAlbumId === album.id;
          const showPublishControls = albumFromStore
            ? !isAlbumPublished(albumFromStore)
            : !isAlbumPublished({
                isPublished: album.isPublished,
                isPublic: album.isPublic,
              });
          const albumRowFlash = getDashboardRowFlashProps(
            `dashboard-album-row-${album.id}`,
            dashboardRowFlashes
          );

          return (
            <React.Fragment key={album.id}>
              <DashboardExpandableRowTrigger
                id={`dashboard-album-row-${album.id}`}
                expanded={isExpanded}
                onToggle={() => onToggleAlbum(album.id)}
                aria-label={isExpanded ? 'Collapse album' : 'Expand album'}
              >
                <DashboardCard
                  interactive
                  selected={isExpanded}
                  className={clsx(
                    'user-dashboard__album-item',
                    'dashboard-album-row',
                    albumRowFlash.className,
                    {
                      'user-dashboard__album-item--expanded': isExpanded,
                      'user-dashboard__album-item--access-menu-open':
                        albumAccessMenuAlbumId === album.id,
                    }
                  )}
                  style={albumRowFlash.style}
                  data-visibility-flash={albumRowFlash['data-visibility-flash']}
                >
                  <div className="user-dashboard__album-thumbnail">
                    {album.cover ? (
                      <AlbumCoverImage
                        cover={album.cover}
                        userId={album.userId ?? userId ?? undefined}
                        alt={album.title}
                        contextAlbumId={album.id}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <img src="/images/album-placeholder.png" alt={album.title} />
                    )}
                  </div>
                  <div className="user-dashboard__album-info">
                    <div className="user-dashboard__album-title-row">
                      <div className="user-dashboard__album-title">{album.title}</div>
                      <AlbumLifecycleBadge
                        status={albumDraftBadge}
                        ui={ui ?? undefined}
                        lang={lang}
                      />
                    </div>
                    {album.releaseDate ? (
                      <div className="user-dashboard__album-date">{album.releaseDate}</div>
                    ) : (
                      <div className="user-dashboard__album-year">{album.year}</div>
                    )}
                  </div>
                  <div
                    className="user-dashboard__album-item-actions"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {albumIsPublished ? (
                      <AlbumAccessControl
                        albumId={album.id}
                        visibility={albumVisibility}
                        ui={ui ?? undefined}
                        lang={lang}
                        menuOpen={albumAccessMenuAlbumId === album.id}
                        onMenuOpenChange={(open) => onAlbumAccessMenuChange(open ? album.id : null)}
                        onPickVisibility={(v) => void onAlbumVisibilityChange(album.id, v)}
                        getRowElement={() =>
                          document.getElementById(`dashboard-album-row-${album.id}`)
                        }
                      />
                    ) : null}
                    <div className="user-dashboard__album-arrow">
                      <DashboardExpandChevron expanded={isExpanded} />
                    </div>
                  </div>
                </DashboardCard>
              </DashboardExpandableRowTrigger>

              {isExpanded ? (
                <DashboardCard className="user-dashboard__album-expanded user-dashboard__album-expanded--kit">
                  <button
                    type="button"
                    className="user-dashboard__edit-album-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const fromStore = albumsFromStore.find(
                        (a) => a.albumId === album.id || a.albumId === album.albumId
                      );
                      onEditAlbum(fromStore?.albumId ?? album.albumId ?? album.id);
                    }}
                  >
                    {ui?.dashboard?.editAlbum ?? 'Edit Album'}
                  </button>

                  <div
                    ref={(el) => {
                      trackUploadSectionRefs.current[album.id] = el;
                    }}
                    className="user-dashboard__track-upload"
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const files = e.dataTransfer.files;
                      if (files.length > 0) {
                        onTrackUpload(album.id, files);
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    {isUploadingTracks[album.id] ? (
                      <div className="user-dashboard__track-upload-progress">
                        <div className="user-dashboard__track-upload-text">
                          {ui?.dashboard?.uploadingTracks ?? 'Uploading tracks…'}{' '}
                          {Math.round(uploadProgress[album.id] || 0)}%
                        </div>
                        <div className="user-dashboard__track-upload-progress-bar">
                          <div
                            className="user-dashboard__track-upload-progress-fill"
                            style={{
                              width: `${uploadProgress[album.id] || 0}%`,
                              transition: 'width 0.3s ease',
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="user-dashboard__track-upload-text">
                          {ui?.dashboard?.dropTracksHere ?? 'Drop tracks here or'}
                        </div>
                        <input
                          ref={(el) => {
                            fileInputRefs.current[album.id] = el;
                          }}
                          type="file"
                          multiple
                          accept="audio/*"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const files = e.target.files;
                            if (files && files.length > 0) {
                              onTrackUpload(album.id, files);
                            }
                            if (e.target) {
                              e.target.value = '';
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="user-dashboard__choose-files-button"
                          disabled={isUploadingTracks[album.id]}
                          onClick={() => {
                            const input = fileInputRefs.current[album.id];
                            if (input) {
                              input.click();
                            }
                          }}
                        >
                          {ui?.dashboard?.chooseFiles ?? 'Choose files'}
                        </button>
                      </>
                    )}
                  </div>

                  {album.tracks.length > 0 ? (
                    <>
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(event) => onDragEnd(event, album.id)}
                      >
                        <SortableContext
                          items={album.tracks.map((track) => track.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="user-dashboard__tracks-table">
                            <div className="user-dashboard__tracks-header" aria-hidden>
                              <div className="user-dashboard__tracks-header-cell user-dashboard__tracks-header-cell--track">
                                {ui?.dashboard?.track ?? 'Track'}
                              </div>
                              <div className="user-dashboard__tracks-header-cell user-dashboard__tracks-header-cell--duration">
                                {ui?.dashboard?.duration ?? 'Duration'}
                              </div>
                              <div className="user-dashboard__tracks-header-cell user-dashboard__tracks-header-cell--actions">
                                {ui?.dashboard?.actions ?? 'Actions'}
                              </div>
                            </div>
                            <div className="user-dashboard__tracks-list">
                              {album.tracks.map((track, trackIndex) => (
                                <SortableTrackItem
                                  key={track.id}
                                  track={track}
                                  displayIndex={trackIndex + 1}
                                  albumId={album.albumId}
                                  onDelete={onDeleteTrack}
                                  onTitleChange={onTrackTitleChange}
                                  onVisibilityChange={onTrackVisibilityChange}
                                  rowFlash={dashboardRowFlashes[`dashboard-track-row-${track.id}`]}
                                  ui={ui ?? undefined}
                                />
                              ))}
                            </div>
                          </div>
                        </SortableContext>
                      </DndContext>

                      <div className="user-dashboard__lyrics-section">
                        <h3 className="user-dashboard__lyrics-title">
                          {ui?.dashboard?.lyrics ?? 'Lyrics'}
                        </h3>
                        <div className="user-dashboard__lyrics-table">
                          <div className="user-dashboard__lyrics-header">
                            <div className="user-dashboard__lyrics-header-cell user-dashboard__lyrics-header-cell--track">
                              {ui?.dashboard?.track ?? 'Track'}
                            </div>
                            <div className="user-dashboard__lyrics-header-cell user-dashboard__lyrics-header-cell--status">
                              {ui?.dashboard?.status ?? 'Status'}
                            </div>
                            <div className="user-dashboard__lyrics-header-cell user-dashboard__lyrics-header-cell--actions">
                              {ui?.dashboard?.actions ?? 'Actions'}
                            </div>
                          </div>
                          {album.tracks.map((track) => (
                            <div key={track.id} className="user-dashboard__lyrics-row">
                              <div
                                className="user-dashboard__lyrics-cell"
                                data-label={ui?.dashboard?.track ?? 'Track'}
                              >
                                {track.title}
                              </div>
                              <div
                                className="user-dashboard__lyrics-cell"
                                data-label={ui?.dashboard?.status ?? 'Status'}
                              >
                                {getLyricsStatusText(track.lyricsStatus, ui)}
                              </div>
                              <div
                                className="user-dashboard__lyrics-cell user-dashboard__lyrics-cell--actions"
                                data-label={ui?.dashboard?.actions ?? 'Actions'}
                              >
                                <div className="user-dashboard__lyrics-actions-row">
                                  {(() => {
                                    const hasSyncedLyrics =
                                      Array.isArray(track.syncedLyrics) &&
                                      track.syncedLyrics.length > 0 &&
                                      track.syncedLyrics.some((line) => line.startTime > 0);
                                    return getLyricsActions(track.lyricsStatus, hasSyncedLyrics);
                                  })().map((action) => {
                                    const actionLabel = getLyricsActionLabel(action, ui);

                                    return (
                                      <DashboardIconButton
                                        key={action}
                                        onClick={() =>
                                          onLyricsAction(action, album.id, track.id, track.title)
                                        }
                                        aria-label={actionLabel}
                                        title={actionLabel}
                                      >
                                        {renderLyricsActionIcon(action)}
                                      </DashboardIconButton>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : null}

                  <div className="user-dashboard__album-footer-actions">
                    <DashboardAction
                      destructive
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteAlbum(album.id);
                      }}
                      aria-label={ui?.dashboard?.deleteAlbum ?? 'Delete album'}
                    >
                      {ui?.dashboard?.deleteAlbum ?? 'Delete album'}
                    </DashboardAction>
                    <div className="user-dashboard__album-footer-actions-right">
                      {showPublishControls ? (
                        <div className="user-dashboard__publish-album-wrap">
                          <button
                            type="button"
                            className="user-dashboard__publish-album-button"
                            disabled={!canPublishAlbum || isPublishingAlbum}
                            title={
                              isPublishingAlbum
                                ? (ui?.dashboard?.editAlbumModal?.buttons?.saving ?? 'Saving...')
                                : (ui?.dashboard?.editAlbumModal?.buttons?.publishAlbum ??
                                  'Publish album')
                            }
                            aria-label={
                              isPublishingAlbum
                                ? (ui?.dashboard?.editAlbumModal?.buttons?.saving ?? 'Saving...')
                                : (ui?.dashboard?.editAlbumModal?.buttons?.publishAlbum ??
                                  'Publish album')
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!canPublishAlbum || isPublishingAlbum) {
                                return;
                              }
                              void onPublishAlbum(album.id);
                            }}
                          >
                            {isPublishingAlbum ? (
                              (ui?.dashboard?.editAlbumModal?.buttons?.saving ?? 'Saving...')
                            ) : (
                              <>
                                {!canPublishAlbum ? <SubscriberContentLockIcon size={18} /> : null}
                                {ui?.dashboard?.editAlbumModal?.buttons?.publishAlbum ??
                                  'Publish album'}
                              </>
                            )}
                          </button>
                          <p className="user-dashboard__publish-album-hint">
                            {publishHintKey === 'ready'
                              ? publishHintCopy.ready
                              : publishHintKey === 'cover'
                                ? publishHintCopy.cover
                                : publishHintKey === 'tracks'
                                  ? publishHintCopy.tracks
                                  : publishHintCopy.fields}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </DashboardCard>
              ) : null}
            </React.Fragment>
          );
        })}
      </div>

      <div className="user-dashboard__albums-upload-divider" aria-hidden />

      <div className="user-dashboard__upload-action">
        <DashboardCta onClick={onCreateAlbum}>
          {ui?.dashboard?.uploadNewAlbum ?? 'Upload New Album'}
        </DashboardCta>
      </div>
    </div>
  );
}
