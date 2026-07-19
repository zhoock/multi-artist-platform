import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Pencil as PencilIcon, Trash2 as Trash2Icon } from 'lucide-react';
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
import type { AlbumData } from '@entities/album/lib/transformEditableAlbumData';
import type { AlbumEditable, IInterface } from '@models';
import type { SupportedLang } from '@shared/model/lang';
import type { TrackVisibility } from '@shared/lib/tracks/trackVisibility';
import { EmailVerificationOnboarding } from '@shared/lib/emailVerification';
import { SubscriberContentLockIcon } from '@shared/ui/icons/SubscriberContentLockIcon';
import {
  DashboardButton,
  DashboardCard,
  DashboardExpandableRowTrigger,
  DashboardLoadingState,
} from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import {
  getDashboardRowFlashProps,
  type DashboardRowFlash,
} from '../../lib/dashboardRowStateFlash';
import { DashboardExpandChevron } from '../../lib/dashboardExpandChevron';
import { useDashboardAccordionOnboarding } from '../../lib/dashboardAccordionOnboarding';
import { AlbumAccessControl } from './AlbumAccessControl';
import { AlbumLifecycleBadge } from './AlbumLifecycleBadge';
import { AlbumsEmptyState } from './AlbumsEmptyState';
import { getAlbumVisibilityFromIsPublic } from './albumVisibilityOptions';
import { SortableTrackItem } from './SortableTrackItem';
import type { LyricsAction } from './trackLyricsHelpers';
import './AlbumsTab.scss';

type AlbumsTabContentProps = {
  emailVerified: boolean;
  initialLoading: boolean;
  tabActive: boolean;
  albumsData: AlbumData[];
  albumsFromStore: AlbumEditable[];
  expandedAlbumId: string | null;
  onSetExpandedAlbumId: (albumId: string | null) => void;
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
  onLyricsAction: (
    action: LyricsAction,
    albumId: string,
    trackId: string,
    trackTitle: string
  ) => void;
};

const albumTrackKey = (albumId: string, trackId: string) => `${albumId}:${trackId}`;

export function AlbumsTabContent({
  emailVerified,
  initialLoading,
  tabActive,
  albumsData,
  albumsFromStore,
  expandedAlbumId,
  onSetExpandedAlbumId,
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
  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null);

  const { markUserInteracted } = useDashboardAccordionOnboarding({
    scope: 'albums',
    enabled: emailVerified && tabActive,
    dataReady: !initialLoading && albumsData.length > 0,
    albums: albumsData,
    expandedAlbumId,
    expandedTrackId,
    onExpandAlbum: onSetExpandedAlbumId,
    onExpandTrack: setExpandedTrackId,
    buildTrackKey: albumTrackKey,
  });

  const handleAlbumToggle = useCallback(
    (albumId: string) => {
      markUserInteracted();
      onToggleAlbum(albumId);
    },
    [markUserInteracted, onToggleAlbum]
  );

  const handleTrackToggle = useCallback(
    (trackKey: string, isTrackOpen: boolean) => {
      markUserInteracted();
      setExpandedTrackId(isTrackOpen ? null : trackKey);
    },
    [markUserInteracted]
  );

  const prevExpandedAlbumIdRef = useRef<string | null>(expandedAlbumId);

  useEffect(() => {
    const previousAlbumId = prevExpandedAlbumIdRef.current;
    prevExpandedAlbumIdRef.current = expandedAlbumId;

    if (previousAlbumId === null && expandedAlbumId !== null) {
      return;
    }

    if (previousAlbumId !== expandedAlbumId) {
      setExpandedTrackId(null);
    }
  }, [expandedAlbumId]);

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
        <DashboardLoadingState className="user-dashboard__tab-loading" />
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
            <DashboardCard
              key={album.id}
              interactive
              className={clsx(
                'user-dashboard__album-card',
                'dashboard-album-row',
                albumRowFlash.className,
                {
                  'user-dashboard__album-card--expanded': isExpanded,
                }
              )}
              style={albumRowFlash.style}
              data-visibility-flash={albumRowFlash['data-visibility-flash']}
            >
              <DashboardExpandableRowTrigger
                id={`dashboard-album-row-${album.id}`}
                expanded={isExpanded}
                onToggle={() => handleAlbumToggle(album.id)}
                aria-label={isExpanded ? 'Collapse album' : 'Expand album'}
                className={clsx('user-dashboard__album-header', 'user-dashboard__album-item', {
                  'user-dashboard__album-item--access-menu-open':
                    albumAccessMenuAlbumId === album.id,
                })}
              >
                <span className="user-dashboard__expanded-track-chevron" aria-hidden>
                  <DashboardExpandChevron expanded={isExpanded} />
                </span>
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
                  <div className="user-dashboard__expanded-track-actions">
                    <DashboardButton
                      variant="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        const fromStore = albumsFromStore.find(
                          (a) => a.albumId === album.id || a.albumId === album.albumId
                        );
                        onEditAlbum(fromStore?.albumId ?? album.albumId ?? album.id);
                      }}
                      aria-label={ui?.dashboard?.editAlbum ?? 'Edit Album'}
                    >
                      <PencilIcon {...dashboardActionIconProps()} />
                    </DashboardButton>
                    <DashboardButton
                      variant="icon"
                      destructive
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteAlbum(album.id);
                      }}
                      aria-label={ui?.dashboard?.deleteAlbum ?? 'Delete album'}
                    >
                      <Trash2Icon {...dashboardActionIconProps()} />
                    </DashboardButton>
                  </div>
                </div>
              </DashboardExpandableRowTrigger>

              {isExpanded ? (
                <div className="user-dashboard__album-body user-dashboard__album-expanded user-dashboard__album-expanded--kit">
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
                        <DashboardButton
                          variant="outline"
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
                        </DashboardButton>
                      </>
                    )}
                  </div>

                  {album.tracks.length > 0 ? (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(event) => onDragEnd(event, album.id)}
                    >
                      <SortableContext
                        items={album.tracks.map((track) => track.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="user-dashboard__expanded-tracks">
                          {album.tracks.map((track, trackIndex) => {
                            const trackKey = albumTrackKey(album.id, track.id);
                            const isTrackOpen = expandedTrackId === trackKey;

                            return (
                              <SortableTrackItem
                                key={track.id}
                                track={track}
                                displayIndex={trackIndex + 1}
                                albumId={album.albumId}
                                lyricsAlbumId={album.id}
                                isOpen={isTrackOpen}
                                onToggle={() => handleTrackToggle(trackKey, isTrackOpen)}
                                onDelete={onDeleteTrack}
                                onTitleChange={onTrackTitleChange}
                                onVisibilityChange={onTrackVisibilityChange}
                                onLyricsAction={onLyricsAction}
                                rowFlash={dashboardRowFlashes[`dashboard-track-row-${track.id}`]}
                                ui={ui ?? undefined}
                              />
                            );
                          })}
                        </div>
                      </SortableContext>
                    </DndContext>
                  ) : null}

                  {showPublishControls ? (
                    <div className="user-dashboard__album-footer-actions">
                      <div className="user-dashboard__album-footer-actions-right">
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
                          {!canPublishAlbum ? (
                            <p className="user-dashboard__publish-album-hint">
                              {publishHintKey === 'cover'
                                ? publishHintCopy.cover
                                : publishHintKey === 'tracks'
                                  ? publishHintCopy.tracks
                                  : publishHintCopy.fields}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </DashboardCard>
          );
        })}
      </div>

      <div className="user-dashboard__albums-upload-divider" aria-hidden />

      <div className="user-dashboard__upload-action">
        <DashboardButton variant="primary" onClick={onCreateAlbum}>
          {ui?.dashboard?.uploadNewAlbum ?? 'Upload New Album'}
        </DashboardButton>
      </div>
    </div>
  );
}
