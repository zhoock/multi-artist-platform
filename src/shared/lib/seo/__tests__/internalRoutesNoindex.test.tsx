/** @jest-environment jsdom */

import { beforeEach, describe, expect, test } from '@jest/globals';
import type { ReactElement } from 'react';
import { Helmet } from 'react-helmet-async';
import { Route, Routes } from 'react-router-dom';

import { renderWithProviders } from '@shared/lib/test-utils';
import {
  expectNoindexRobotsMeta,
  expectNoRobotsMeta,
} from '@shared/lib/seo/__tests__/helmetRobotsTestUtils';
import { ArtistPageSeoHelmet } from '@pages/Home/ui/ArtistPageSeoHelmet';
import { ArtistNotFound } from '@shared/ui/artistNotFound/ArtistNotFound';
import { ServiceContent } from '@shared/ui/serviceScreen/ServiceContent';
import { AuthPage } from '@features/auth/ui/AuthPage';
import PaymentSuccess from '@pages/PaymentSuccess/PaymentSuccess';
import SubscriptionPaymentSuccess from '@pages/SubscriptionPaymentSuccess/SubscriptionPaymentSuccess';
import ResetPassword from '@pages/ResetPassword/ResetPassword';
import { NotFoundPage } from '@widgets/notFound/NotFoundPage';
import EmailVerified from '@pages/EmailVerified/EmailVerified';
import EmailVerificationExpired from '@pages/EmailVerificationExpired/EmailVerificationExpired';
import Album from '@pages/Album/Album';
import { createAlbumsTestState } from '@entities/album/model/__tests__/albumsTestState';

jest.mock('@shared/ui/serviceScreen/ServiceScene', () => ({
  ServiceScene: () => null,
}));

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'en' }),
}));

jest.mock('@shared/lib/auth', () => ({
  isAuthenticated: () => false,
  isEmailVerified: () => false,
  getUser: () => null,
  resetPassword: jest.fn(),
  refreshAuthSession: jest.fn(),
  AUTH_SESSION_CHANGED_EVENT: 'auth:session-changed',
  subscribeAuthSession: () => () => {},
}));

jest.mock('@shared/lib/hooks/useAuthSessionUser', () => ({
  useAuthSessionUser: () => null,
}));

jest.mock('@shared/lib/sessionExpired', () => ({
  consumeSessionExpiredBannerReason: () => null,
  abandonSessionExpiredReauth: jest.fn(),
  SESSION_EXPIRED_REQUEST_EVENT: 'session-expired',
}));

jest.mock('@shared/lib/albumPurchaseSuccessToast', () => ({
  redirectToAlbumReturnPath: jest.fn(),
}));

jest.mock('@shared/api/purchases', () => ({
  invalidateMyPurchasesCache: jest.fn(),
}));

jest.mock('@shared/api/subscription', () => ({
  getSubscriptionPaymentStatus: jest.fn(async () => ({ status: 'success' })),
}));

jest.mock('@shared/lib/hooks/useArtistPageAccess', () => ({
  useArtistPageAccess: () => ({
    isLoading: false,
    isOwner: false,
    ownerResolved: true,
    ownerContentLoaded: true,
    ownerStillNeedsOnboarding: false,
    hasPublicReleases: true,
    ownerHasPublicPageContent: true,
    showOnboarding: false,
    showOnboardingSkeleton: false,
    showVisitorUnderConstruction: false,
    showNotFound: false,
    showPublished: true,
    pageReady: true,
    showArtistPageSkeleton: false,
    showArtistPageSurfacePending: false,
    showArtistPageHeroPending: false,
    showArtistPageLayoutPending: false,
    headerImages: [],
    isHeaderImagesReady: true,
    albumDetailsReleaseGatePending: false,
    catalogReleaseGatePending: false,
    suppressPublishedArtistChrome: false,
    monetizationEnabled: false,
    paymentSurfaceReady: true,
  }),
}));

jest.mock('@shared/lib/hooks/useRedirectHomeAfterOwnAccountDeleted', () => ({
  useRedirectHomeAfterOwnAccountDeleted: () => false,
}));

jest.mock('@shared/lib/hooks/useRedirectAfterDeletedAlbum', () => ({
  useRedirectAfterDeletedAlbum: () => false,
}));

jest.mock('@shared/lib/emailVerification', () => ({
  useEmailVerificationCopy: () => ({
    verifiedTitle: 'Email verified',
    verifiedDescription: 'Your email is verified.',
    verifiedHome: 'Continue',
    verifiedDashboard: 'Open dashboard',
    expiredTitle: 'Link expired',
    expiredDescription: 'Request a new verification email.',
    expiredHome: 'Back to home',
  }),
  useResendCooldown: () => ({ cooldownSeconds: 0, startCooldown: jest.fn() }),
}));

function renderWithPlatformHelmet(
  ui: ReactElement,
  options?: Parameters<typeof renderWithProviders>[1]
) {
  return renderWithProviders(
    <>
      <Helmet>
        <title>Platform default</title>
        <meta name="description" content="Platform description" />
        <link rel="canonical" href="https://example.com/en" />
      </Helmet>
      {ui}
    </>,
    options
  );
}

describe('SEO-002 internal routes noindex', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  test('ServiceContent sets noindex robots meta', async () => {
    renderWithPlatformHelmet(
      <ServiceContent
        titleId="test-title"
        pageTitle="Service page"
        title="Service"
        description="Description"
      />
    );

    await expectNoindexRobotsMeta();
  });

  test('NotFoundPage sets noindex robots meta', async () => {
    renderWithPlatformHelmet(<NotFoundPage />);
    await expectNoindexRobotsMeta();
  });

  test('EmailVerified sets noindex robots meta', async () => {
    renderWithPlatformHelmet(<EmailVerified />);
    await expectNoindexRobotsMeta();
  });

  test('EmailVerificationExpired sets noindex robots meta', async () => {
    renderWithPlatformHelmet(<EmailVerificationExpired />);
    await expectNoindexRobotsMeta();
  });

  test('ArtistNotFound sets noindex robots meta', async () => {
    renderWithPlatformHelmet(<ArtistNotFound />);
    await expectNoindexRobotsMeta();
  });

  test('AuthPage sets noindex robots meta', async () => {
    renderWithPlatformHelmet(
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
      </Routes>,
      { initialEntries: ['/auth?mode=login'] }
    );

    await expectNoindexRobotsMeta();
  });

  test('ResetPassword sets noindex robots meta', async () => {
    renderWithPlatformHelmet(
      <Routes>
        <Route path="/auth/reset-password" element={<ResetPassword />} />
      </Routes>,
      { initialEntries: ['/auth/reset-password'] }
    );

    await expectNoindexRobotsMeta();
  });

  test('PaymentSuccess sets noindex robots meta', async () => {
    renderWithPlatformHelmet(
      <Routes>
        <Route path="/pay/success" element={<PaymentSuccess />} />
      </Routes>,
      {
        initialEntries: ['/pay/success?preview=success'],
      }
    );

    await expectNoindexRobotsMeta();
  });

  test('SubscriptionPaymentSuccess sets noindex robots meta', async () => {
    renderWithPlatformHelmet(
      <Routes>
        <Route path="/pay/subscription-success" element={<SubscriptionPaymentSuccess />} />
      </Routes>,
      {
        initialEntries: ['/pay/subscription-success?paymentId=test-payment'],
      }
    );

    await expectNoindexRobotsMeta();
  });

  test('Album not-found surface sets noindex robots meta', async () => {
    renderWithPlatformHelmet(<Album />, {
      initialEntries: ['/albums/missing-album?artist=test-artist'],
      preloadedState: {
        lang: { current: 'en' },
        albums: createAlbumsTestState(),
        albumDetails: {
          status: 'succeeded',
          error: null,
          errorCode: 'ALBUM_NOT_FOUND',
          data: null,
          fetchContextKey: 'albumDetails:test-artist:missing-album',
          artistSlug: 'test-artist',
          albumId: 'missing-album',
          lastUpdated: Date.now(),
        },
        uiDictionary: {
          en: { status: 'idle', error: null, data: [], lastUpdated: null },
          ru: { status: 'idle', error: null, data: [], lastUpdated: null },
        },
      },
    });

    await expectNoindexRobotsMeta();
  });
});

describe('SEO-002 public pages remain indexable', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  test('ArtistPageSeoHelmet does not set noindex robots meta', async () => {
    renderWithPlatformHelmet(
      <ArtistPageSeoHelmet
        seo={{
          title: 'Artist page',
          description: 'Artist description',
          canonical: 'https://example.com/en?artist=demo',
          isArtistSpecific: true,
        }}
        hreflang={{
          ru: 'https://example.com/ru?artist=demo',
          en: 'https://example.com/en?artist=demo',
          xDefault: 'https://example.com/en?artist=demo',
        }}
      />
    );

    await expectNoRobotsMeta();
  });

  test('platform default Helmet alone does not set noindex robots meta', async () => {
    renderWithProviders(
      <Helmet>
        <title>Platform default</title>
        <meta name="description" content="Platform description" />
      </Helmet>
    );

    await expectNoRobotsMeta();
  });
});
