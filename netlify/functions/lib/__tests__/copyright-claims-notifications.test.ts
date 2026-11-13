/**
 * Unit tests: copyright claim POST creates admin notification; failures are non-fatal.
 */

import type { HandlerEvent } from '@netlify/functions';
import { handler } from '../../copyright-claims';
import { query } from '../db';
import { insertCopyrightAuditEntry } from '../copyright-claims-admin';
import { insertCopyrightClaimAdminNotification } from '../admin-notifications-db';
import * as copyrightLib from '../copyright-claims';
import { enforceIpRateLimit } from '../ip-rate-limit';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('../copyright-claims-admin', () => ({
  insertCopyrightAuditEntry: jest.fn(),
}));

jest.mock('../admin-notifications-db', () => ({
  insertCopyrightClaimAdminNotification: jest.fn(),
}));

jest.mock('../ip-rate-limit', () => ({
  enforceIpRateLimit: jest.fn(),
  COPYRIGHT_CLAIM_SUBMIT_IP_LIMIT: 10,
}));

jest.mock('../copyright-claims', () => {
  const actual = jest.requireActual('../copyright-claims') as typeof import('../copyright-claims');
  return {
    ...actual,
    resolveAlbumForCopyrightReport: jest.fn(),
    resolveTrackForCopyrightReport: jest.fn(),
  };
});

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockAudit = insertCopyrightAuditEntry as jest.MockedFunction<
  typeof insertCopyrightAuditEntry
>;
const mockNotify = insertCopyrightClaimAdminNotification as jest.MockedFunction<
  typeof insertCopyrightClaimAdminNotification
>;
const mockResolveAlbum = copyrightLib.resolveAlbumForCopyrightReport as jest.MockedFunction<
  typeof copyrightLib.resolveAlbumForCopyrightReport
>;
const mockEnforceIpRateLimit = enforceIpRateLimit as jest.MockedFunction<typeof enforceIpRateLimit>;

function postEvent(body: Record<string, unknown>): HandlerEvent {
  return {
    httpMethod: 'POST',
    path: '/.netlify/functions/copyright-claims',
    headers: {},
    body: JSON.stringify(body),
    queryStringParameters: {},
    isBase64Encoded: false,
  } as HandlerEvent;
}

const validBody = {
  contentType: 'album',
  contentId: 'album-slug',
  artistSlug: 'artist',
  claimantName: 'Name',
  claimantEmail: 'a@b.co',
  claimantType: 'other',
  description: 'x'.repeat(25),
};

describe('copyright-claims admin notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnforceIpRateLimit.mockResolvedValue(null);
    mockResolveAlbum.mockResolvedValue({
      album_id: 'album-slug',
      album_title: '23 (Remastered)',
      artist_slug: 'artist',
      artist_display: 'Artist',
    });
  });

  it('creates notification with correct target_id after claim insert', async () => {
    const claimId = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';
    mockQuery.mockResolvedValueOnce({ rows: [{ id: claimId }] });
    mockAudit.mockResolvedValue(undefined);
    mockNotify.mockResolvedValue(undefined);

    const res = await handler(postEvent(validBody), {} as never);
    expect(res.statusCode).toBe(200);

    expect(mockNotify).toHaveBeenCalledWith({
      claimId,
      payload: { contentTitle: '23 (Remastered)' },
    });
  });

  it('POST returns 429 when IP rate limit exceeded', async () => {
    mockEnforceIpRateLimit.mockResolvedValueOnce({
      statusCode: 429,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        code: 'RATE_LIMIT_EXCEEDED',
        error: 'Too many requests. Please try again later.',
        retryAfterSeconds: 60,
      }),
    });

    const res = await handler(postEvent(validBody), {} as never);
    expect(res.statusCode).toBe(429);
    expect(JSON.parse(res.body as string).code).toBe('RATE_LIMIT_EXCEEDED');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('notification failure still returns success for claim', async () => {
    const claimId = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a45';
    mockQuery.mockResolvedValueOnce({ rows: [{ id: claimId }] });
    mockAudit.mockResolvedValue(undefined);
    mockNotify.mockRejectedValue(new Error('db down'));

    const res = await handler(postEvent(validBody), {} as never);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string).success).toBe(true);
  });
});
