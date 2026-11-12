import { resolveAlbumCommentNotificationPath } from '../resolveAlbumCommentNotificationPath';

describe('resolveAlbumCommentNotificationPath', () => {
  test('builds album deep-link with comment query', () => {
    expect(
      resolveAlbumCommentNotificationPath('en', {
        kind: 'album',
        albumId: '23',
        artistSlug: 'beatles',
        commentId: 'c-uuid',
      })
    ).toBe('/en/albums/23?artist=beatles&comment=c-uuid');
  });
});
