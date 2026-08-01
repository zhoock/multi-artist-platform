import { describe, expect, it } from '@jest/globals';

describe('dashboardLazyModals', () => {
  it('exports lazy modal components and preload helpers', async () => {
    const mod = await import('../dashboardLazyModals');

    expect(typeof mod.preloadEditAlbumModal).toBe('function');
    expect(typeof mod.preloadEditArticleModal).toBe('function');
    expect(typeof mod.preloadLyricsModals).toBe('function');
    expect(typeof mod.preloadSyncLyricsModal).toBe('function');
    expect(mod.EditAlbumModalLazy).toBeTruthy();
    expect(mod.EditArticleModalV2Lazy).toBeTruthy();
    expect(mod.SyncLyricsModalLazy).toBeTruthy();
    expect(mod.AddLyricsModalLazy).toBeTruthy();
  });
});
