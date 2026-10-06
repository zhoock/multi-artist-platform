import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { HandlerEvent } from '@netlify/functions';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('../jwt', () => ({
  classifyAuthorizationHeader: jest.fn(() => ({ kind: 'none' })),
  getUserIdFromToken: jest.fn(),
}));

jest.mock('../profile-avatar-path', () => ({
  reconcileProfileAvatarPathForUser: jest.fn(),
}));

import { query } from '../db';
import { getUserIdFromEvent } from '../api-helpers';
import { reconcileProfileAvatarPathForUser } from '../profile-avatar-path';
import { handler } from '../../user-profile';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockReconcile = reconcileProfileAvatarPathForUser as jest.MockedFunction<
  typeof reconcileProfileAvatarPathForUser
>;

jest.mock('../api-helpers', () => {
  const actual = jest.requireActual('../api-helpers') as object;
  return {
    ...actual,
    getUserIdFromEvent: jest.fn(),
  };
});

const mockGetUserId = getUserIdFromEvent as jest.MockedFunction<typeof getUserIdFromEvent>;

function makeOwnProfileGetEvent(): HandlerEvent {
  return {
    httpMethod: 'GET',
    path: '/api/user-profile',
    queryStringParameters: { lang: 'en' },
    headers: { authorization: 'Bearer token' },
    body: null,
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    rawUrl: '/api/user-profile?lang=en',
    rawQuery: 'lang=en',
  } as HandlerEvent;
}

function makeArtistProfileGetEvent(artist: string): HandlerEvent {
  return {
    httpMethod: 'GET',
    path: '/api/user-profile',
    queryStringParameters: { lang: 'en', artist },
    headers: { authorization: 'Bearer token' },
    body: null,
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    rawUrl: `/api/user-profile?lang=en&artist=${artist}`,
    rawQuery: `lang=en&artist=${artist}`,
  } as HandlerEvent;
}

describe('user-profile GET profileAvatarPath', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockReconcile.mockReset();
    mockGetUserId.mockReset();
  });

  test('returns profileAvatarPath for authenticated own profile', async () => {
    const ownerId = '22222222-2222-4222-8222-222222222222';
    mockGetUserId.mockReturnValue(ownerId);
    mockQuery.mockResolvedValue({
      rows: [
        {
          name: 'Beatles',
          public_slug: 'beatles',
          the_band: { en: [], ru: [] },
          header_images: [],
          social_links: {},
          site_name: 'Beatles',
          genre_code: 'rock',
          profile_avatar_path: `users/${ownerId}/profile/profile-deadbeef-128.webp`,
        },
      ],
    } as never);

    const response = await handler(makeOwnProfileGetEvent(), {} as never);
    expect(response?.statusCode).toBe(200);
    const body = JSON.parse(String(response?.body));
    expect(body.data.profileAvatarPath).toBe(`users/${ownerId}/profile/profile-deadbeef-128.webp`);
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  test('reconciles when profile_avatar_path is null for own profile', async () => {
    const ownerId = '33333333-3333-4333-8333-333333333333';
    mockGetUserId.mockReturnValue(ownerId);
    mockQuery.mockResolvedValue({
      rows: [
        {
          id: ownerId,
          name: 'Artist',
          public_slug: 'artist',
          the_band: { en: [], ru: [] },
          header_images: [],
          social_links: {},
          site_name: 'Artist',
          genre_code: 'other',
          profile_avatar_path: null,
        },
      ],
    } as never);
    mockReconcile.mockResolvedValue(`users/${ownerId}/profile/profile-legacy-128.webp`);

    const response = await handler(makeOwnProfileGetEvent(), {} as never);
    const body = JSON.parse(String(response?.body));
    expect(mockReconcile).toHaveBeenCalledWith(ownerId);
    expect(body.data.profileAvatarPath).toBe(`users/${ownerId}/profile/profile-legacy-128.webp`);
  });

  test('does not expose profileAvatarPath when viewing another artist via ?artist=', async () => {
    const ownerId = '22222222-2222-4222-8222-222222222222';
    const viewerId = '99999999-9999-4999-8999-999999999999';
    mockGetUserId.mockReturnValue(viewerId);

    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('WHERE public_slug = $1')) {
        return {
          rows: [
            {
              id: ownerId,
              name: 'Beatles',
              public_slug: 'beatles',
              the_band: { en: ['Bio'], ru: [] },
              header_images: ['users/x/hero/cover-1920.jpg'],
              social_links: {},
              site_name: 'Beatles',
              genre_code: 'rock',
            },
          ],
        } as never;
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    const response = await handler(makeArtistProfileGetEvent('beatles'), {} as never);
    expect(response?.statusCode).toBe(200);
    const body = JSON.parse(String(response?.body));
    expect(body.data.profileAvatarPath).toBeUndefined();
    expect(mockReconcile).not.toHaveBeenCalled();
  });
});
