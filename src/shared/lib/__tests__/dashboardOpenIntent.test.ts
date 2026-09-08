import { beforeEach, describe, expect, it } from '@jest/globals';

import {
  UPLOAD_ALBUM_PENDING_INTENT_STORAGE_KEY,
  clearPendingUploadAlbumIntent,
  hasPendingUploadAlbumIntent,
  readPendingUploadAlbumIntent,
  savePendingUploadAlbumIntent,
} from '../dashboardOpenIntent';

describe('dashboardOpenIntent upload persistence', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('persists pending upload intent for unverified resume', () => {
    savePendingUploadAlbumIntent();

    const pending = readPendingUploadAlbumIntent();
    expect(pending?.type).toBe('upload_album');
    expect(hasPendingUploadAlbumIntent()).toBe(true);
  });

  it('persists optional albumId for edit resume', () => {
    savePendingUploadAlbumIntent('album-42');

    expect(readPendingUploadAlbumIntent()?.albumId).toBe('album-42');
  });

  it('does not consume pending intent until explicitly cleared', () => {
    savePendingUploadAlbumIntent();
    expect(readPendingUploadAlbumIntent()).not.toBeNull();

    clearPendingUploadAlbumIntent();
    expect(readPendingUploadAlbumIntent()).toBeNull();
    expect(sessionStorage.getItem(UPLOAD_ALBUM_PENDING_INTENT_STORAGE_KEY)).toBeNull();
  });

  it('rejects stale pending intent after TTL', () => {
    sessionStorage.setItem(
      UPLOAD_ALBUM_PENDING_INTENT_STORAGE_KEY,
      JSON.stringify({
        type: 'upload_album',
        createdAt: Date.now() - 60 * 60 * 1000,
      })
    );

    expect(readPendingUploadAlbumIntent()).toBeNull();
    expect(sessionStorage.getItem(UPLOAD_ALBUM_PENDING_INTENT_STORAGE_KEY)).toBeNull();
  });
});
