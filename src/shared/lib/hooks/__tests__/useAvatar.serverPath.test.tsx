/** @jest-environment jsdom */

import React from 'react';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { waitFor } from '@testing-library/react';
import { renderWithProviders } from '@shared/lib/test-utils';
import { useStoredProfileAvatarUrl } from '../useAvatar';

const fetchOwnProfileAvatarPathMock = jest.fn<() => Promise<string | null>>();

jest.mock('@shared/lib/profileAvatar/fetchOwnProfileAvatarPath', () => ({
  fetchOwnProfileAvatarPath: () => fetchOwnProfileAvatarPathMock(),
}));

jest.mock('@shared/lib/auth', () => ({
  getUser: () => ({ id: 'user-1', name: 'Test', email: 't@test.com' }),
  AUTH_SESSION_CHANGED_EVENT: 'auth-session-changed',
}));

import {
  invalidateProfileAvatarSession,
  refreshProfileAvatarFromServer,
} from '@shared/lib/profileAvatar';
import { getStoredProfileAvatarUrl } from '../useAvatar';
import { getProfileAvatarLocalStorageKey } from '@shared/lib/avatarUpload';

describe('useAvatar server-side profileAvatarPath', () => {
  beforeEach(() => {
    localStorage.clear();
    invalidateProfileAvatarSession();
    fetchOwnProfileAvatarPathMock.mockReset();
  });

  test('displays avatar from server path without localStorage', async () => {
    fetchOwnProfileAvatarPathMock.mockResolvedValue(
      'users/user-1/profile/profile-abcd1234-128.webp'
    );

    await refreshProfileAvatarFromServer();
    expect(getStoredProfileAvatarUrl()).toContain('proxy-image');
    expect(getStoredProfileAvatarUrl()).toContain('profile-abcd1234-128.webp');
  });

  test('server path overrides stale localStorage', async () => {
    localStorage.setItem(
      getProfileAvatarLocalStorageKey('user-1'),
      'http://localhost:8080/api/proxy-image?path=users%2Fuser-1%2Fprofile%2Fold-128.webp'
    );
    fetchOwnProfileAvatarPathMock.mockResolvedValue(
      'users/user-1/profile/profile-beef0001-128.webp'
    );

    await refreshProfileAvatarFromServer();
    const url = getStoredProfileAvatarUrl();
    expect(url).toContain('profile-beef0001-128.webp');
    expect(url).not.toContain('old-128');
  });

  test('server null clears stale localStorage for display', async () => {
    localStorage.setItem(
      getProfileAvatarLocalStorageKey('user-1'),
      'http://localhost:8080/api/proxy-image?path=users%2Fuser-1%2Fprofile%2Fold-128.webp'
    );
    fetchOwnProfileAvatarPathMock.mockResolvedValue(null);

    await refreshProfileAvatarFromServer();
    expect(getStoredProfileAvatarUrl()).toBe('');
  });

  test('empty localStorage still shows avatar after server fetch', async () => {
    fetchOwnProfileAvatarPathMock.mockResolvedValue(
      'users/user-1/profile/profile-cafe0001-128.webp'
    );

    function Probe() {
      const url = useStoredProfileAvatarUrl();
      return <span data-testid="avatar-url">{url}</span>;
    }

    const view = renderWithProviders(<Probe />);
    await waitFor(() => {
      expect(view.getByTestId('avatar-url').textContent).toContain('profile-cafe0001-128.webp');
    });
  });
});
