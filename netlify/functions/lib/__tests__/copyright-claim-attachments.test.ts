import { TextDecoder, TextEncoder } from 'node:util';

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('../db', () => ({ query: jest.fn() }));
jest.mock('../supabase', () => ({
  STORAGE_BUCKET_NAME: 'user-media',
  createSupabaseAdminClient: jest.fn(),
}));

Object.assign(globalThis, { TextEncoder, TextDecoder });

import { query } from '../db';
import {
  buildCopyrightClaimAttachmentStoragePath,
  COPYRIGHT_CLAIM_ATTACHMENT_PENDING_CLEANUP_HOURS,
  hashCopyrightClaimUploadToken,
  isAllowedCopyrightAttachmentMime,
  isCopyrightClaimAttachmentStoragePath,
  listCopyrightClaimAttachments,
  sanitizeOriginalFilename,
  verifyCopyrightClaimUploadToken,
} from '../copyright-claim-attachments';

const mockQuery = query as jest.MockedFunction<typeof query>;

describe('copyright-claim-attachments helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('listCopyrightClaimAttachments filters to uploaded status only', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await listCopyrightClaimAttachments('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44');
    expect(String(mockQuery.mock.calls[0]?.[0])).toContain("upload_status = 'uploaded'");
  });

  test('hash and verify upload token', () => {
    const token = 'test-token-value';
    const hash = hashCopyrightClaimUploadToken(token);
    expect(verifyCopyrightClaimUploadToken(hash, new Date(Date.now() + 60_000), token)).toBe(true);
    expect(verifyCopyrightClaimUploadToken(hash, new Date(Date.now() + 60_000), 'wrong')).toBe(
      false
    );
  });

  test('rejects expired token', () => {
    const token = 't';
    const hash = hashCopyrightClaimUploadToken(token);
    expect(verifyCopyrightClaimUploadToken(hash, new Date(Date.now() - 1), token)).toBe(false);
  });

  test('storage path stays under claim namespace', () => {
    const claimId = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';
    const attId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a45';
    const path = buildCopyrightClaimAttachmentStoragePath(claimId, attId, 'application/pdf');
    expect(path).toBe(`copyright-claims/${claimId}/${attId}/evidence.pdf`);
    expect(path).not.toContain('..');
  });

  test('sanitize strips path traversal from filename', () => {
    expect(sanitizeOriginalFilename('../../etc/passwd')).toBe('etcpasswd');
  });

  test('mime allowlist', () => {
    expect(isAllowedCopyrightAttachmentMime('application/pdf')).toBe(true);
    expect(isAllowedCopyrightAttachmentMime('application/x-msdownload')).toBe(false);
  });

  test('cleanup age constant is 72 hours', () => {
    expect(COPYRIGHT_CLAIM_ATTACHMENT_PENDING_CLEANUP_HOURS).toBe(72);
  });

  test('storage path guard', () => {
    expect(isCopyrightClaimAttachmentStoragePath('copyright-claims/x/y/evidence.pdf')).toBe(true);
    expect(isCopyrightClaimAttachmentStoragePath('../copyright-claims/x')).toBe(false);
  });
});
