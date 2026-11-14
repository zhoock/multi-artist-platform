import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  submitCopyrightClaim,
  uploadCopyrightClaimAttachments,
} from '../copyrightReportAttachmentsApi';

describe('copyrightReportAttachmentsApi', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test('uploads attachments after claim created', async () => {
    const claimId = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';
    const uploadToken = 'secret-token';
    const file = new File(['%PDF-1.4 test'], 'proof.pdf', { type: 'application/pdf' });

    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { claimId, uploadToken } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            attachmentId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a45',
            signedUrl: 'https://x/upload',
          },
        }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { status: 'uploaded' } }),
      } as Response);

    globalThis.fetch = fetchMock;

    const created = await submitCopyrightClaim({ description: 'x'.repeat(20) });
    expect(created.claimId).toBe(claimId);

    await uploadCopyrightClaimAttachments({
      claimId,
      uploadToken,
      files: [file],
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
