import { lazy } from 'react';

type LyricsModalsModule = typeof import('../components/modals/lyrics/dashboardLyricsModalsEntry');

let editAlbumModalPromise: Promise<
  typeof import('../components/modals/album/EditAlbumModal')
> | null = null;
let editArticleModalPromise: Promise<
  typeof import('../components/modals/article/EditArticleModalV2')
> | null = null;
let syncLyricsModalPromise: Promise<
  typeof import('../components/modals/lyrics/SyncLyricsModal')
> | null = null;
let lyricsModalsPromise: Promise<LyricsModalsModule> | null = null;

function loadEditAlbumModalModule() {
  editAlbumModalPromise ??= import('../components/modals/album/EditAlbumModal');
  return editAlbumModalPromise;
}

function loadEditArticleModalModule() {
  editArticleModalPromise ??= import('../components/modals/article/EditArticleModalV2');
  return editArticleModalPromise;
}

function loadSyncLyricsModalModule() {
  syncLyricsModalPromise ??= import('../components/modals/lyrics/SyncLyricsModal');
  return syncLyricsModalPromise;
}

function loadLyricsModalsModule() {
  lyricsModalsPromise ??= import('../components/modals/lyrics/dashboardLyricsModalsEntry');
  return lyricsModalsPromise;
}

/** Warm the album editor chunk before opening the modal. */
export function preloadEditAlbumModal(): void {
  void loadEditAlbumModalModule();
}

/** Warm the article editor chunk before opening the modal. */
export function preloadEditArticleModal(): void {
  void loadEditArticleModalModule();
}

/** Warm add/edit/preview lyrics modals (single shared chunk). */
export function preloadLyricsModals(): void {
  void loadLyricsModalsModule();
}

/** Warm the sync lyrics editor chunk. */
export function preloadSyncLyricsModal(): void {
  void loadSyncLyricsModalModule();
}

export const EditAlbumModalLazy = lazy(async () => {
  const module = await loadEditAlbumModalModule();
  return { default: module.EditAlbumModal };
});

export const EditArticleModalV2Lazy = lazy(async () => {
  const module = await loadEditArticleModalModule();
  return { default: module.EditArticleModalV2 };
});

export const SyncLyricsModalLazy = lazy(async () => {
  const module = await loadSyncLyricsModalModule();
  return { default: module.SyncLyricsModal };
});

export const AddLyricsModalLazy = lazy(async () => {
  const module = await loadLyricsModalsModule();
  return { default: module.AddLyricsModal };
});

export const EditLyricsModalLazy = lazy(async () => {
  const module = await loadLyricsModalsModule();
  return { default: module.EditLyricsModal };
});

export const PreviewLyricsModalLazy = lazy(async () => {
  const module = await loadLyricsModalsModule();
  return { default: module.PreviewLyricsModal };
});
