import type { HandlerEvent } from '@netlify/functions';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { handleCopyrightClaimAttachmentRoute } from '../copyright-claim-attachment-routes';
import * as attachmentsLib from '../copyright-claim-attachments';
import { query } from '../db';
import { enforceIpRateLimit } from '../ip-rate-limit';

jest.mock('../db', () => ({ query: jest.fn() }));
jest.mock('../ip-rate-limit', () => ({ enforceIpRateLimit: jest.fn() }));

jest.mock('../copyright-claim-attachments', () => {
  const actual = jest.requireActual('../copyright-claim-attachments') as typeof attachmentsLib;
  return {
    ...actual,
    assertCopyrightClaimUploadAuthorized: jest.fn(),
    countCopyrightClaimAttachments: jest.fn(),
    verifyUploadedAttachmentContent: jest.fn(),
    removeCopyrightClaimStorageObject: jest.fn(),
  };
});

jest.mock('../supabase', () => ({
  STORAGE_BUCKET_NAME: 'user-media',
  createSupabaseAdminClient: jest.fn(() => ({
    storage: {
      from: () => ({
        createSignedUploadUrl: async () => ({
          data: { signedUrl: 'https://signed.example/upload' },
          error: null,
        }),
      }),
    },
  })),
}));

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockRate = enforceIpRateLimit as jest.MockedFunction<typeof enforceIpRateLimit>;
const mockAuth = attachmentsLib.assertCopyrightClaimUploadAuthorized as jest.MockedFunction<
  typeof attachmentsLib.assertCopyrightClaimUploadAuthorized
>;
const mockCount = attachmentsLib.countCopyrightClaimAttachments as jest.MockedFunction<
  typeof attachmentsLib.countCopyrightClaimAttachments
>;
const mockVerify = attachmentsLib.verifyUploadedAttachmentContent as jest.MockedFunction<
  typeof attachmentsLib.verifyUploadedAttachmentContent
>;

const claimId = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';
const attachmentId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a45';

function postEvent(path: string, body: Record<string, unknown>): HandlerEvent {
  return {
    httpMethod: 'POST',
    path: `/api/copyright-claims${path}`,
    headers: {},
    body: JSON.stringify(body),
    queryStringParameters: {},
    isBase64Encoded: false,
  } as HandlerEvent;
}

describe('copyright claim attachment routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRate.mockResolvedValue(null);
    mockAuth.mockResolvedValue({
      id: claimId,
      attachment_upload_token_hash: 'x',
      attachment_upload_expires_at: new Date(Date.now() + 60_000),
    });
    mockCount.mockResolvedValue(0);
    mockQuery.mockResolvedValue({ rows: [] });
  });

  test('presign rejects invalid mime', async () => {
    const res = await handleCopyrightClaimAttachmentRoute(
      postEvent(`/${claimId}/attachments/presign`, {
        uploadToken: 'tok',
        originalFilename: 'bad.exe',
        mimeType: 'application/x-msdownload',
        sizeBytes: 100,
      }),
      `/${claimId}/attachments/presign`
    );
    expect(res?.statusCode).toBe(400);
  });

  test('presign returns signed url for valid request', async () => {
    const res = await handleCopyrightClaimAttachmentRoute(
      postEvent(`/${claimId}/attachments/presign`, {
        uploadToken: 'tok',
        originalFilename: 'proof.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 4096,
      }),
      `/${claimId}/attachments/presign`
    );
    expect(res?.statusCode).toBe(200);
    const json = JSON.parse(res?.body ?? '{}');
    expect(json.data.signedUrl).toContain('https://');
    expect(json.data.attachmentId).toBeTruthy();
  });

  test('complete marks attachment uploaded after verification', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: attachmentId,
          claim_id: claimId,
          storage_path: `copyright-claims/${claimId}/${attachmentId}/evidence.pdf`,
          mime_type: 'application/pdf',
          size_bytes: '4096',
          upload_status: 'pending',
        },
      ],
    });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockVerify.mockResolvedValueOnce(undefined);

    const res = await handleCopyrightClaimAttachmentRoute(
      postEvent(`/${claimId}/attachments/${attachmentId}/complete`, { uploadToken: 'tok' }),
      `/${claimId}/attachments/${attachmentId}/complete`
    );
    expect(res?.statusCode).toBe(200);
    const json = JSON.parse(res?.body ?? '{}');
    expect(json.data.status).toBe('uploaded');
    expect(mockVerify).toHaveBeenCalled();
    const updateCall = mockQuery.mock.calls.find((c) =>
      String(c[0]).includes("upload_status = 'uploaded'")
    );
    expect(updateCall).toBeDefined();
  });

  test('presign rejects without upload token', async () => {
    mockAuth.mockRejectedValue(
      Object.assign(new Error('Invalid upload token'), { code: 'FORBIDDEN' })
    );
    const res = await handleCopyrightClaimAttachmentRoute(
      postEvent(`/${claimId}/attachments/presign`, {
        uploadToken: 'wrong',
        originalFilename: 'proof.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 4096,
      }),
      `/${claimId}/attachments/presign`
    );
    expect(res?.statusCode).toBe(403);
  });
});
