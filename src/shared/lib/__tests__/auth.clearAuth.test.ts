/** @jest-environment jsdom */

import { beforeEach, describe, expect, it } from '@jest/globals';

jest.mock('@shared/model/appStore', () => ({
  getStore: () => ({ dispatch: jest.fn() }),
}));

jest.mock('@shared/lib/resetCatalogAfterAuthEnd', () => ({
  resetCatalogAfterAuthEnd: jest.fn(),
}));

import { clearAuth } from '../auth';
import { readPendingUploadAlbumIntent, savePendingUploadAlbumIntent } from '../dashboardOpenIntent';

describe('clearAuth', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('clears pending upload album intent on logout so the next user cannot resume it', () => {
    savePendingUploadAlbumIntent('album-user-a');
    expect(readPendingUploadAlbumIntent()?.albumId).toBe('album-user-a');

    clearAuth();

    expect(readPendingUploadAlbumIntent()).toBeNull();
  });

  it('does not clear pending upload intent when session is refreshed without logout', async () => {
    savePendingUploadAlbumIntent();

    const { refreshAuthSession } = await import('../auth');
    await refreshAuthSession();

    expect(readPendingUploadAlbumIntent()).not.toBeNull();
  });
});
