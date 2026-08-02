import type { AuthUser } from '@shared/lib/auth';
import {
  isDefaultHomePath,
  isOnOwnArtistOnboardingPage,
  resolveArtistOnboardingDestination,
  shouldTryArtistOnboardingRedirect,
} from '../ownArtistPage';

const artistUser: AuthUser = {
  id: 'user-1',
  email: 'artist@example.com',
  name: 'Artist',
  accountType: 'artist',
  isEmailVerified: false,
  role: 'user',
};

describe('ownArtistPage helpers', () => {
  test('isDefaultHomePath detects universe home', () => {
    expect(isDefaultHomePath('/', '')).toBe(true);
    expect(isDefaultHomePath('/ru', '')).toBe(true);
    expect(isDefaultHomePath('/en', '')).toBe(true);
    expect(isDefaultHomePath('/', '?artist=slug')).toBe(false);
    expect(isDefaultHomePath('/ru', '?artist=slug')).toBe(false);
    expect(isDefaultHomePath('/dashboard/albums', '')).toBe(false);
  });

  test('isOnOwnArtistOnboardingPage matches owner slug case-insensitively', () => {
    expect(isOnOwnArtistOnboardingPage('/', '?artist=My-Artist', 'my-artist')).toBe(true);
    expect(isOnOwnArtistOnboardingPage('/ru', '?artist=My-Artist', 'my-artist')).toBe(true);
    expect(isOnOwnArtistOnboardingPage('/', '?artist=other', 'my-artist')).toBe(false);
  });

  test('shouldTryArtistOnboardingRedirect for pending registration', () => {
    expect(
      shouldTryArtistOnboardingRedirect(artistUser, {
        pendingRegistration: true,
        onDefaultHome: false,
      })
    ).toBe(true);
  });

  test('shouldTryArtistOnboardingRedirect for unverified artist on home', () => {
    expect(
      shouldTryArtistOnboardingRedirect(artistUser, {
        pendingRegistration: false,
        onDefaultHome: true,
      })
    ).toBe(true);
  });

  test('shouldTryArtistOnboardingRedirect skips verified artist without pending flag', () => {
    expect(
      shouldTryArtistOnboardingRedirect(
        { ...artistUser, isEmailVerified: true },
        { pendingRegistration: false, onDefaultHome: true }
      )
    ).toBe(false);
  });

  test('shouldTryArtistOnboardingRedirect skips listeners', () => {
    expect(
      shouldTryArtistOnboardingRedirect(
        { ...artistUser, accountType: 'listener' },
        { pendingRegistration: false, onDefaultHome: true }
      )
    ).toBe(false);
  });

  test('resolveArtistOnboardingDestination never sends listeners to artist home', async () => {
    await expect(
      resolveArtistOnboardingDestination('en', {
        user: { ...artistUser, accountType: 'listener' },
        defaultDestination: '/?artist=ghost',
        pendingRegistration: true,
      })
    ).resolves.toBe('/');
  });
});
