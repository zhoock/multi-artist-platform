/**
 * Dev-only preview fixtures for PaymentSuccess layout work.
 * Stripped from production bundles when NODE_ENV === 'production'.
 */

export const PAYMENT_SUCCESS_PREVIEW_VALUE = 'success';

/** Same asset as AlbumCoverImage / dashboard album list. */
export const PAYMENT_SUCCESS_PREVIEW_PLACEHOLDER_COVER = '/images/album-placeholder.png';

/** Canonical cover key for album "23" (see apply-migrations.ts). */
export const PAYMENT_SUCCESS_PREVIEW_ALBUM_COVER_KEY = 'smolyanoe-chuchelko-Cover-23';

export interface PaymentSuccessPreviewPayment {
  id: string;
  status: 'succeeded';
  paid: boolean;
  amount: {
    value: string;
    currency: string;
  };
  metadata: {
    orderId: string;
    customerEmail: string;
    albumId: string;
  };
}

export interface PaymentSuccessPreviewAlbum {
  title: string;
  artistDisplayName: string;
  cover: string | null;
  userId: string | null;
}

export interface PaymentSuccessPreviewState {
  payment: PaymentSuccessPreviewPayment;
  purchasedAlbum: PaymentSuccessPreviewAlbum;
  returnTo: string;
  /** When true, render bundled placeholder instead of AlbumCover (no Storage userId). */
  usePlaceholderCover: boolean;
}

export const PAYMENT_SUCCESS_PREVIEW_PAYMENT: PaymentSuccessPreviewPayment = {
  id: '00000000-0000-4000-8000-000000000099',
  status: 'succeeded',
  paid: true,
  amount: {
    value: '300.00',
    currency: 'RUB',
  },
  metadata: {
    orderId: '00000000-0000-4000-8000-000000000001',
    customerEmail: 'fan@example.com',
    albumId: '23',
  },
};

function readPreviewArtistUserId(): string {
  const fromPreview = process.env.PAYMENT_SUCCESS_PREVIEW_USER_ID?.trim();
  if (fromPreview) {
    return fromPreview;
  }

  const fromMigration = process.env.MIGRATION_TARGET_USER_ID?.trim();
  return fromMigration ?? '';
}

export function resolvePreviewPurchasedAlbum(): {
  purchasedAlbum: PaymentSuccessPreviewAlbum;
  usePlaceholderCover: boolean;
} {
  const userId = readPreviewArtistUserId();

  if (userId) {
    return {
      purchasedAlbum: {
        title: '23',
        artistDisplayName: 'Смоляное Чучелко',
        cover: PAYMENT_SUCCESS_PREVIEW_ALBUM_COVER_KEY,
        userId,
      },
      usePlaceholderCover: false,
    };
  }

  return {
    purchasedAlbum: {
      title: '23',
      artistDisplayName: 'Смоляное Чучелко',
      cover: null,
      userId: null,
    },
    usePlaceholderCover: true,
  };
}

export function isPaymentSuccessPreviewAllowed(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export function isPaymentSuccessPreviewActive(previewParam: string | null): boolean {
  return isPaymentSuccessPreviewAllowed() && previewParam === PAYMENT_SUCCESS_PREVIEW_VALUE;
}

export function buildPaymentSuccessPreviewState(
  returnToFromUrl: string | null
): PaymentSuccessPreviewState {
  const returnTo = returnToFromUrl?.trim() || '/albums/demo';
  const album = resolvePreviewPurchasedAlbum();

  return {
    payment: PAYMENT_SUCCESS_PREVIEW_PAYMENT,
    purchasedAlbum: album.purchasedAlbum,
    usePlaceholderCover: album.usePlaceholderCover,
    returnTo,
  };
}
