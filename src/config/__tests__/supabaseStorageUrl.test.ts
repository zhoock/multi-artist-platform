import {
  buildStoragePublicObjectUrl,
  getSupabaseUrl,
  STORAGE_BUCKET_NAME,
} from '@config/supabaseStorageUrl';

describe('supabaseStorageUrl', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, VITE_SUPABASE_URL: 'https://example.supabase.co/' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('buildStoragePublicObjectUrl matches public object path format', () => {
    const url = buildStoragePublicObjectUrl('users/u1/hero/cover-1920.avif');
    expect(url).toBe(
      `https://example.supabase.co/storage/v1/object/public/${STORAGE_BUCKET_NAME}/users/u1/hero/cover-1920.avif`
    );
  });

  test('buildStoragePublicObjectUrl strips leading slashes from path', () => {
    const url = buildStoragePublicObjectUrl('/users/u1/albums/a.jpg');
    expect(url).toBe(
      `https://example.supabase.co/storage/v1/object/public/${STORAGE_BUCKET_NAME}/users/u1/albums/a.jpg`
    );
  });

  test('buildStoragePublicObjectUrl returns null without Supabase URL', () => {
    process.env.VITE_SUPABASE_URL = '';
    delete process.env.SUPABASE_URL;
    expect(getSupabaseUrl()).toBe('');
    expect(buildStoragePublicObjectUrl('users/u1/hero/x.jpg')).toBeNull();
  });
});
