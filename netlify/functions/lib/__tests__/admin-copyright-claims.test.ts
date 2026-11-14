/**
 * Unit tests: admin copyright claims API (PATCH transitions, audit, auth).
 */

import type { HandlerEvent } from '@netlify/functions';
import { handler } from '../../admin-copyright-claims';
import { query } from '../db';
import { getUserIdFromEvent, requireAdmin } from '../api-helpers';
import {
  createCopyrightClaimAttachmentSignedDownloadUrl,
  fetchCopyrightClaimAttachmentRow,
  listCopyrightClaimAttachments,
} from '../copyright-claim-attachments';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('../copyright-claim-attachments', () => {
  const actual = jest.requireActual('../copyright-claim-attachments') as object;
  return {
    ...actual,
    listCopyrightClaimAttachments: jest.fn(async () => []),
    fetchCopyrightClaimAttachmentRow: jest.fn(async () => null),
    createCopyrightClaimAttachmentSignedDownloadUrl: jest.fn(),
  };
});

jest.mock('../api-helpers', () => {
  const actual = jest.requireActual('../api-helpers') as typeof import('../api-helpers');
  return {
    ...actual,
    requireAdmin: jest.fn(),
    getUserIdFromEvent: jest.fn(),
  };
});

const CLAIM_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const ADMIN_ID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockGetUserId = getUserIdFromEvent as jest.MockedFunction<typeof getUserIdFromEvent>;
const mockListAttachments = listCopyrightClaimAttachments as jest.MockedFunction<
  typeof listCopyrightClaimAttachments
>;
const mockFetchAttachmentRow = fetchCopyrightClaimAttachmentRow as jest.MockedFunction<
  typeof fetchCopyrightClaimAttachmentRow
>;
const mockSignedDownload = createCopyrightClaimAttachmentSignedDownloadUrl as jest.MockedFunction<
  typeof createCopyrightClaimAttachmentSignedDownloadUrl
>;

const ATTACHMENT_ID = 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

function baseEvent(overrides: Partial<HandlerEvent> = {}): HandlerEvent {
  return {
    httpMethod: 'GET',
    path: `/.netlify/functions/admin-copyright-claims/${CLAIM_ID}`,
    headers: { authorization: 'Bearer token' },
    body: null,
    queryStringParameters: {},
    isBase64Encoded: false,
    ...overrides,
  } as HandlerEvent;
}

const detailRow = (status: string, admin_note: string | null) => ({
  id: CLAIM_ID,
  content_type: 'album',
  content_id: 'album-slug',
  claimant_name: 'Test',
  claimant_email: 'claimant@example.com',
  claimant_type: 'other',
  description: 'desc',
  status,
  admin_note,
  created_at: new Date('2026-11-06T10:00:00.000Z'),
  content_title: 'Title',
  artist_display: 'Artist',
  artist_slug: 'artist',
  album_slug: 'album-slug',
  track_slug: null,
  album_copyright_restricted: false,
});

describe('admin-copyright-claims', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(ADMIN_ID);
    mockGetUserId.mockReturnValue(ADMIN_ID);
  });

  it('PATCH new → rejected succeeds', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: CLAIM_ID, status: 'new', admin_note: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [detailRow('rejected', null)] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await handler(
      baseEvent({
        httpMethod: 'PATCH',
        body: JSON.stringify({ status: 'rejected' }),
      }),
      {} as never
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string).data.claim.status).toBe('rejected');
  });

  it('PATCH new → under_review succeeds and writes audit', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: CLAIM_ID, status: 'new', admin_note: null }] }) // fetchCopyrightClaimById
      .mockResolvedValueOnce({ rows: [] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }) // INSERT audit
      .mockResolvedValueOnce({ rows: [detailRow('under_review', null)] }) // detail
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'log-1',
            admin_user_id: ADMIN_ID,
            action: 'claim_status_changed',
            details: { from: 'new', to: 'under_review' },
            created_at: new Date('2026-11-06T11:00:00.000Z'),
          },
        ],
      }); // fetchAuditLog

    const res = await handler(
      baseEvent({
        httpMethod: 'PATCH',
        body: JSON.stringify({ status: 'under_review' }),
      }),
      {} as never
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.success).toBe(true);
    expect(body.data.claim.status).toBe('under_review');

    const insertAudit = mockQuery.mock.calls.find((c) =>
      String(c[0]).includes('INSERT INTO admin_audit_log')
    );
    expect(insertAudit).toBeDefined();
  });

  it('PATCH under_review → resolved succeeds', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: CLAIM_ID, status: 'under_review', admin_note: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [detailRow('resolved', null)] })
      .mockResolvedValueOnce({ rows: [] }); // fetchAuditLog

    const res = await handler(
      baseEvent({
        httpMethod: 'PATCH',
        body: JSON.stringify({ status: 'resolved' }),
      }),
      {} as never
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string).data.claim.status).toBe('resolved');
  });

  it('PATCH under_review → rejected succeeds', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: CLAIM_ID, status: 'under_review', admin_note: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [detailRow('rejected', null)] })
      .mockResolvedValueOnce({ rows: [] }); // fetchAuditLog

    const res = await handler(
      baseEvent({
        httpMethod: 'PATCH',
        body: JSON.stringify({ status: 'rejected' }),
      }),
      {} as never
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string).data.claim.status).toBe('rejected');
  });

  it('PATCH resolved → new is rejected', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: CLAIM_ID, status: 'resolved', admin_note: null }],
    });

    const res = await handler(
      baseEvent({
        httpMethod: 'PATCH',
        body: JSON.stringify({ status: 'new' }),
      }),
      {} as never
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body as string).code).toBe('INVALID_TRANSITION');
  });

  it('PATCH rejected → under_review is rejected', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: CLAIM_ID, status: 'rejected', admin_note: null }],
    });

    const res = await handler(
      baseEvent({
        httpMethod: 'PATCH',
        body: JSON.stringify({ status: 'under_review' }),
      }),
      {} as never
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH temporarilyHideAlbum from new is rejected', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: CLAIM_ID, status: 'new', admin_note: null }] });

    const res = await handler(
      baseEvent({
        httpMethod: 'PATCH',
        body: JSON.stringify({ action: 'temporarilyHideAlbum' }),
      }),
      {} as never
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body as string).code).toBe('INVALID_ACTION_FOR_STATUS');
  });

  it('non-admin gets 403 when authenticated', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    mockGetUserId.mockReturnValue('listener-id');

    const res = await handler(
      baseEvent({
        httpMethod: 'PATCH',
        body: JSON.stringify({ status: 'under_review' }),
      }),
      {} as never
    );
    expect(res.statusCode).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('adminNote is persisted and triggers note audit', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: CLAIM_ID, status: 'new', admin_note: null }] })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }) // INSERT claim_note_updated
      .mockResolvedValueOnce({ rows: [detailRow('new', 'Internal note')] }) // detail
      .mockResolvedValueOnce({ rows: [] }); // fetchAuditLog

    const res = await handler(
      baseEvent({
        httpMethod: 'PATCH',
        body: JSON.stringify({ adminNote: 'Internal note' }),
      }),
      {} as never
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string).data.claim.adminNote).toBe('Internal note');

    const noteAudit = mockQuery.mock.calls.some(
      (c) =>
        String(c[0]).includes('INSERT INTO admin_audit_log') &&
        String(c[1]?.[1]) === 'claim_note_updated'
    );
    expect(noteAudit).toBe(true);
  });

  it('GET detail returns 401 when unauthenticated', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    mockGetUserId.mockReturnValue(null);

    const res = await handler(baseEvent({ httpMethod: 'GET' }), {} as never);
    expect(res.statusCode).toBe(401);
  });

  it('GET detail returns 403 for authenticated non-admin', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    mockGetUserId.mockReturnValue('listener-user-id');

    const res = await handler(baseEvent({ httpMethod: 'GET' }), {} as never);
    expect(res.statusCode).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('GET claim detail returns uploaded attachments', async () => {
    mockListAttachments.mockResolvedValueOnce([
      {
        id: ATTACHMENT_ID,
        original_filename: 'proof.pdf',
        mime_type: 'application/pdf',
        size_bytes: '4096',
        upload_status: 'uploaded',
        created_at: new Date('2026-11-06T10:05:00.000Z'),
        uploaded_at: new Date('2026-11-06T10:06:00.000Z'),
      },
    ]);

    mockQuery
      .mockResolvedValueOnce({ rows: [detailRow('new', null)] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await handler(baseEvent({ httpMethod: 'GET' }), {} as never);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.success).toBe(true);
    expect(body.data.attachments).toEqual([
      expect.objectContaining({
        id: ATTACHMENT_ID,
        fileName: 'proof.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 4096,
      }),
    ]);
    expect(mockListAttachments).toHaveBeenCalledWith(CLAIM_ID);
  });

  it('GET attachment download returns signed URL for uploaded file', async () => {
    mockFetchAttachmentRow.mockResolvedValueOnce({
      storage_path: 'copyright-claims/x/y/evidence.pdf',
      mime_type: 'application/pdf',
      original_filename: 'proof.pdf',
    });
    mockSignedDownload.mockResolvedValueOnce('https://signed.example/download');

    const res = await handler(
      baseEvent({
        httpMethod: 'GET',
        path: `/.netlify/functions/admin-copyright-claims/${CLAIM_ID}/attachments/${ATTACHMENT_ID}/download`,
      }),
      {} as never
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.data.downloadUrl).toBe('https://signed.example/download');
    expect(body.data.fileName).toBe('proof.pdf');
    expect(mockFetchAttachmentRow).toHaveBeenCalledWith(CLAIM_ID, ATTACHMENT_ID);
  });

  it('GET attachment download returns 404 when attachment not uploaded', async () => {
    mockFetchAttachmentRow.mockResolvedValueOnce(null);

    const res = await handler(
      baseEvent({
        httpMethod: 'GET',
        path: `/.netlify/functions/admin-copyright-claims/${CLAIM_ID}/attachments/${ATTACHMENT_ID}/download`,
      }),
      {} as never
    );
    expect(res.statusCode).toBe(404);
  });
});
