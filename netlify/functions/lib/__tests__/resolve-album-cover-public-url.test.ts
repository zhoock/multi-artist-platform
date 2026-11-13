import { buildAlbumCoverEmailUrl, resolveAlbumCoverPublicUrl } from '../storage-public-url';

describe('resolveAlbumCoverPublicUrl', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    process.env.SUPABASE_URL = 'https://project.supabase.co';
  });

  afterAll(() => {
    process.env = env;
  });

  it('returns null for empty / missing inputs', () => {
    expect(resolveAlbumCoverPublicUrl(null)).toBeNull();
    expect(resolveAlbumCoverPublicUrl(undefined)).toBeNull();
    expect(resolveAlbumCoverPublicUrl('')).toBeNull();
    expect(resolveAlbumCoverPublicUrl('   ')).toBeNull();
  });

  it('passes absolute URLs through untouched', () => {
    expect(resolveAlbumCoverPublicUrl('https://cdn.example.com/cover.jpg')).toBe(
      'https://cdn.example.com/cover.jpg'
    );
    expect(resolveAlbumCoverPublicUrl('http://example.com/cover.png')).toBe(
      'http://example.com/cover.png'
    );
    expect(resolveAlbumCoverPublicUrl('data:image/png;base64,AAA')).toBe(
      'data:image/png;base64,AAA'
    );
  });

  it('builds a Supabase public URL for bucket-relative `users/...` paths', () => {
    expect(resolveAlbumCoverPublicUrl('users/uid/albums/cover.jpg')).toBe(
      'https://project.supabase.co/storage/v1/object/public/user-media/users/uid/albums/cover.jpg'
    );
  });

  it('combines a bare filename with the album owner id', () => {
    expect(resolveAlbumCoverPublicUrl('album_cover', 'uid-123')).toBe(
      'https://project.supabase.co/storage/v1/object/public/user-media/users/uid-123/albums/album_cover.jpg'
    );
    expect(resolveAlbumCoverPublicUrl('album_cover.png', 'uid-123')).toBe(
      'https://project.supabase.co/storage/v1/object/public/user-media/users/uid-123/albums/album_cover.png'
    );
  });

  it('returns null for bare filenames when no albumUserId is provided', () => {
    expect(resolveAlbumCoverPublicUrl('album_cover')).toBeNull();
  });

  it('returns null for legacy local-only `/images/...` paths (caller must use placeholder)', () => {
    expect(resolveAlbumCoverPublicUrl('/images/album_cover.jpg', 'uid-123')).toBeNull();
  });

  it('returns null when SUPABASE_URL is not configured', () => {
    delete process.env.SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    expect(resolveAlbumCoverPublicUrl('users/uid/albums/cover.jpg')).toBeNull();
    expect(resolveAlbumCoverPublicUrl('album_cover', 'uid-123')).toBeNull();
  });
});

describe('buildAlbumCoverEmailUrl', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    process.env.SUPABASE_URL = 'https://project.supabase.co';
  });

  afterAll(() => {
    process.env = env;
  });

  it('returns null for empty / missing inputs', () => {
    expect(buildAlbumCoverEmailUrl(null, null)).toBeNull();
    expect(buildAlbumCoverEmailUrl('', 'uid')).toBeNull();
    expect(buildAlbumCoverEmailUrl('   ', 'uid')).toBeNull();
  });

  it('passes absolute URLs through untouched', () => {
    expect(buildAlbumCoverEmailUrl('https://cdn.example.com/cover.jpg', null)).toBe(
      'https://cdn.example.com/cover.jpg'
    );
    expect(buildAlbumCoverEmailUrl('data:image/png;base64,AAA', null)).toBe(
      'data:image/png;base64,AAA'
    );
  });

  it('builds a direct Supabase public URL for bucket-relative `users/...` paths', () => {
    expect(buildAlbumCoverEmailUrl('users/uid/albums/cover-448.webp', null)).toBe(
      'https://project.supabase.co/storage/v1/object/public/user-media/users/uid/albums/cover-448.webp'
    );
  });

  it('combines a bare base name with the album owner id and the -448.webp email variant', () => {
    expect(buildAlbumCoverEmailUrl('Beatles-Rubber-Soul', 'uid-123')).toBe(
      'https://project.supabase.co/storage/v1/object/public/user-media/users/uid-123/albums/Beatles-Rubber-Soul-448.webp'
    );
  });

  it('keeps an explicit extension intact (no email-variant rewriting)', () => {
    expect(buildAlbumCoverEmailUrl('album_cover.png', 'uid-123')).toBe(
      'https://project.supabase.co/storage/v1/object/public/user-media/users/uid-123/albums/album_cover.png'
    );
  });

  it('appends only the extension if the base already includes a size suffix', () => {
    expect(buildAlbumCoverEmailUrl('Beatles-Rubber-Soul-1344', 'uid-123')).toBe(
      'https://project.supabase.co/storage/v1/object/public/user-media/users/uid-123/albums/Beatles-Rubber-Soul-1344.webp'
    );
  });

  it('returns null for bare filenames when no albumUserId is provided', () => {
    expect(buildAlbumCoverEmailUrl('album_cover', null)).toBeNull();
  });

  it('returns null for legacy `/images/...` local paths (caller must use placeholder)', () => {
    expect(buildAlbumCoverEmailUrl('/images/album_cover.jpg', 'uid')).toBeNull();
  });

  it('returns null when SUPABASE_URL is not configured', () => {
    delete process.env.SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    expect(buildAlbumCoverEmailUrl('users/uid/albums/cover.jpg', null)).toBeNull();
    expect(buildAlbumCoverEmailUrl('album_cover', 'uid-123')).toBeNull();
  });

  it('URL-encodes special characters in user-supplied base names', () => {
    expect(buildAlbumCoverEmailUrl('Cover With Spaces', 'uid')).toBe(
      'https://project.supabase.co/storage/v1/object/public/user-media/users/uid/albums/Cover%20With%20Spaces-448.webp'
    );
  });

  it('normalizes JSONB cover object instead of producing [object Object]', () => {
    expect(
      buildAlbumCoverEmailUrl(
        {
          img: 'Beatles-Rubber-Soul',
          backImg: 'Beatles-Rubber-Soul-Back',
        },
        'uid-123'
      )
    ).toBe(
      'https://project.supabase.co/storage/v1/object/public/user-media/users/uid-123/albums/Beatles-Rubber-Soul-448.webp'
    );
  });

  it('returns null for JSONB cover with empty img', () => {
    expect(buildAlbumCoverEmailUrl({ img: '', backImg: 'x' }, 'uid-123')).toBeNull();
  });
});
