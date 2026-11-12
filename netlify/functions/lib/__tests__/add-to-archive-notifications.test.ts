/**
 * Unit tests: add-to-archive creates artist collection_add notification after new membership.
 */

import type { HandlerEvent } from '@netlify/functions';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('../archive', () => ({
  addArtistToArchive: jest.fn(),
  getArchiveStatusForArtist: jest.fn(),
  isArtistActiveInUserArchive: jest.fn(),
  ArchiveSlotsLimitError: class ArchiveSlotsLimitError extends Error {},
  ArchiveSubscriptionRequiredError: class ArchiveSubscriptionRequiredError extends Error {},
}));

jest.mock('../artist-monetization', () => ({
  artistHasMonetizationEnabled: jest.fn(),
}));

jest.mock('../user-notifications-db', () => ({
  insertCollectionAddUserNotification: jest.fn(),
}));

jest.mock('../api-helpers', () => {
  const actual = jest.requireActual('../api-helpers');
  return {
    ...actual,
    getUserIdFromEvent: jest.fn(),
  };
});

import { handler } from '../../add-to-archive';
import {
  addArtistToArchive,
  getArchiveStatusForArtist,
  isArtistActiveInUserArchive,
} from '../archive';
import { artistHasMonetizationEnabled } from '../artist-monetization';
import { insertCollectionAddUserNotification } from '../user-notifications-db';
import { getUserIdFromEvent } from '../api-helpers';

const mockAdd = addArtistToArchive as jest.Mock;
const mockStatus = getArchiveStatusForArtist as jest.Mock;
const mockWasActive = isArtistActiveInUserArchive as jest.Mock;
const mockMonetization = artistHasMonetizationEnabled as jest.Mock;
const mockInsertNotif = insertCollectionAddUserNotification as jest.Mock;
const mockGetUser = getUserIdFromEvent as jest.Mock;

const LISTENER = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a12';
const ARTIST = 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a13';

function postEvent(body: Record<string, unknown>): HandlerEvent {
  return {
    httpMethod: 'POST',
    path: '/.netlify/functions/add-to-archive',
    headers: { authorization: 'Bearer test' },
    body: JSON.stringify(body),
    isBase64Encoded: false,
  } as HandlerEvent;
}

describe('add-to-archive notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockReturnValue(LISTENER);
    mockMonetization.mockResolvedValue(true);
    mockAdd.mockResolvedValue({
      id: 'row-1',
      artistUserId: ARTIST,
      createdAt: new Date(),
      lockedUntil: new Date(),
    });
    mockStatus.mockResolvedValue({
      isPremium: true,
      artistInArchive: true,
      artistActiveInArchive: true,
      slotsUsed: 1,
      slotsLimit: 3,
    });
    mockInsertNotif.mockResolvedValue(undefined);
  });

  it('notifies artist after a new collection add', async () => {
    mockWasActive.mockResolvedValue(false);

    const res = await handler(postEvent({ artistUserId: ARTIST }), {} as never);
    expect(res.statusCode).toBe(200);
    expect(mockInsertNotif).toHaveBeenCalledWith({
      artistUserId: ARTIST,
      actorUserId: LISTENER,
    });
  });

  it('does not notify when artist was already active in collection', async () => {
    mockWasActive.mockResolvedValue(true);

    const res = await handler(postEvent({ artistUserId: ARTIST }), {} as never);
    expect(res.statusCode).toBe(200);
    expect(mockInsertNotif).not.toHaveBeenCalled();
  });

  it('still succeeds when notification insert fails', async () => {
    mockWasActive.mockResolvedValue(false);
    mockInsertNotif.mockRejectedValue(new Error('db down'));

    const res = await handler(postEvent({ artistUserId: ARTIST }), {} as never);
    expect(res.statusCode).toBe(200);
  });
});
