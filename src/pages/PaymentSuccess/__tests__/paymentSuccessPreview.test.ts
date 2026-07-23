import {
  buildPaymentSuccessPreviewState,
  isPaymentSuccessPreviewActive,
  isPaymentSuccessPreviewAllowed,
  PAYMENT_SUCCESS_PREVIEW_ALBUM_COVER_KEY,
  PAYMENT_SUCCESS_PREVIEW_PAYMENT,
  resolvePreviewPurchasedAlbum,
} from '../paymentSuccessPreview';

describe('paymentSuccessPreview', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalPreviewUserId = process.env.PAYMENT_SUCCESS_PREVIEW_USER_ID;
  const originalMigrationUserId = process.env.MIGRATION_TARGET_USER_ID;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.PAYMENT_SUCCESS_PREVIEW_USER_ID = originalPreviewUserId;
    process.env.MIGRATION_TARGET_USER_ID = originalMigrationUserId;
  });

  test('is disabled in production', () => {
    process.env.NODE_ENV = 'production';
    expect(isPaymentSuccessPreviewAllowed()).toBe(false);
    expect(isPaymentSuccessPreviewActive('success')).toBe(false);
  });

  test('is enabled in development with preview=success', () => {
    process.env.NODE_ENV = 'development';
    expect(isPaymentSuccessPreviewAllowed()).toBe(true);
    expect(isPaymentSuccessPreviewActive('success')).toBe(true);
    expect(isPaymentSuccessPreviewActive('fail')).toBe(false);
  });

  test('buildPaymentSuccessPreviewState uses returnTo from URL or demo fallback', () => {
    process.env.NODE_ENV = 'development';

    expect(buildPaymentSuccessPreviewState('/albums/23?artist=beatles').returnTo).toBe(
      '/albums/23?artist=beatles'
    );
    expect(buildPaymentSuccessPreviewState(null).returnTo).toBe('/albums/demo');
    expect(buildPaymentSuccessPreviewState('  ').returnTo).toBe('/albums/demo');
  });

  test('mock includes album, email and succeeded payment', () => {
    expect(PAYMENT_SUCCESS_PREVIEW_PAYMENT.status).toBe('succeeded');
    expect(PAYMENT_SUCCESS_PREVIEW_PAYMENT.metadata.customerEmail).toBeTruthy();

    const album = resolvePreviewPurchasedAlbum().purchasedAlbum;
    expect(album.title).toBeTruthy();
    expect(album.artistDisplayName).toBeTruthy();
  });

  test('uses placeholder cover when preview artist userId is not configured', () => {
    delete process.env.PAYMENT_SUCCESS_PREVIEW_USER_ID;
    delete process.env.MIGRATION_TARGET_USER_ID;

    const resolved = resolvePreviewPurchasedAlbum();
    expect(resolved.usePlaceholderCover).toBe(true);
    expect(resolved.purchasedAlbum.userId).toBeNull();
    expect(resolved.purchasedAlbum.cover).toBeNull();
  });

  test('uses Supabase cover when preview artist userId is configured', () => {
    process.env.PAYMENT_SUCCESS_PREVIEW_USER_ID = '11111111-1111-4111-8111-111111111111';

    const resolved = resolvePreviewPurchasedAlbum();
    expect(resolved.usePlaceholderCover).toBe(false);
    expect(resolved.purchasedAlbum.userId).toBe('11111111-1111-4111-8111-111111111111');
    expect(resolved.purchasedAlbum.cover).toBe(PAYMENT_SUCCESS_PREVIEW_ALBUM_COVER_KEY);
  });

  test('prefers PAYMENT_SUCCESS_PREVIEW_USER_ID over MIGRATION_TARGET_USER_ID', () => {
    process.env.PAYMENT_SUCCESS_PREVIEW_USER_ID = '22222222-2222-4222-8222-222222222222';
    process.env.MIGRATION_TARGET_USER_ID = '11111111-1111-4111-8111-111111111111';

    const resolved = resolvePreviewPurchasedAlbum();
    expect(resolved.purchasedAlbum.userId).toBe('22222222-2222-4222-8222-222222222222');
  });
});
