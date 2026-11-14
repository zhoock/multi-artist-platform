import { TextDecoder, TextEncoder } from 'node:util';

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

Object.assign(globalThis, { TextEncoder, TextDecoder });

jest.mock('../db', () => ({ query: jest.fn() }));

const mockRemove = jest.fn<() => Promise<{ error: null }>>();
jest.mock('../supabase', () => ({
  STORAGE_BUCKET_NAME: 'user-media',
  createSupabaseAdminClient: jest.fn(() => ({
    storage: {
      from: () => ({
        remove: mockRemove,
      }),
    },
  })),
}));

import { query } from '../db';
import { isCopyrightClaimAttachmentStoragePath } from '../copyright-claim-attachments';
import {
  cleanupOneStalePendingAttachment,
  fetchStalePendingCopyrightAttachments,
  runCopyrightClaimAttachmentsCleanup,
  tryRemoveStaleCopyrightAttachmentStorage,
} from '../copyright-claim-attachments-cleanup';

const mockQuery = query as jest.MockedFunction<typeof query>;

const claimId = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';
const attId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a45';
const validPath = `copyright-claims/${claimId}/${attId}/evidence.pdf`;

describe('isCopyrightClaimAttachmentStoragePath', () => {
  test('accepts canonical copyright-claims paths', () => {
    expect(isCopyrightClaimAttachmentStoragePath(validPath)).toBe(true);
  });

  test('rejects path outside copyright-claims namespace', () => {
    expect(isCopyrightClaimAttachmentStoragePath(`users/x/albums/hack.pdf`)).toBe(false);
  });
});

describe('fetchStalePendingCopyrightAttachments', () => {
  test('queries only stale pending rows with hour threshold', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: attId, storage_path: validPath }] });
    const rows = await fetchStalePendingCopyrightAttachments(10, 72);
    expect(rows).toHaveLength(1);
    expect(mockQuery.mock.calls[0]?.[1]).toEqual([72, 10]);
    expect(String(mockQuery.mock.calls[0]?.[0])).toContain("upload_status = 'pending'");
    expect(String(mockQuery.mock.calls[0]?.[0])).toContain('uploaded_at IS NULL');
  });
});

describe('tryRemoveStaleCopyrightAttachmentStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRemove.mockResolvedValue({ error: null });
  });

  test('does not call storage for invalid path', async () => {
    const outcome = await tryRemoveStaleCopyrightAttachmentStorage('users/evil.pdf');
    expect(outcome).toBe('invalid_path');
    expect(mockRemove).not.toHaveBeenCalled();
  });

  test('treats missing object as already absent', async () => {
    mockRemove.mockResolvedValueOnce({
      error: { name: 'StorageError', message: 'Object not found' },
    } as never);
    const outcome = await tryRemoveStaleCopyrightAttachmentStorage(validPath);
    expect(outcome).toBe('already_absent');
  });

  test('returns error when storage remove fails', async () => {
    mockRemove.mockResolvedValueOnce({
      error: { name: 'StorageError', message: 'timeout' },
    } as never);
    const outcome = await tryRemoveStaleCopyrightAttachmentStorage(validPath);
    expect(outcome).toBe('error');
  });
});

describe('cleanupOneStalePendingAttachment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRemove.mockResolvedValue({ error: null });
  });

  test('removes storage then db when object exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await cleanupOneStalePendingAttachment({ id: attId, storage_path: validPath });
    expect(result.outcome).toBe('db_deleted');
    expect(result.storage).toBe('removed');
    expect(mockRemove).toHaveBeenCalledWith([validPath]);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM copyright_claim_attachments'),
      [attId],
      0
    );
  });

  test('deletes db when storage object already missing', async () => {
    mockRemove.mockResolvedValueOnce({
      error: { name: 'StorageError', message: 'not found' },
    } as never);
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await cleanupOneStalePendingAttachment({ id: attId, storage_path: validPath });
    expect(result.outcome).toBe('db_deleted');
    expect(result.storage).toBe('already_absent');
  });

  test('keeps db row when storage deletion fails', async () => {
    mockRemove.mockResolvedValueOnce({
      error: { name: 'StorageError', message: 'server error' },
    } as never);
    const result = await cleanupOneStalePendingAttachment({ id: attId, storage_path: validPath });
    expect(result.outcome).toBe('storage_error');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('logs db error and leaves row for retry when storage already gone', async () => {
    mockRemove.mockResolvedValueOnce({ error: null });
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    const result = await cleanupOneStalePendingAttachment({ id: attId, storage_path: validPath });
    expect(result.outcome).toBe('db_error');
  });

  test('skips storage for invalid path', async () => {
    const result = await cleanupOneStalePendingAttachment({
      id: attId,
      storage_path: 'users/bad.pdf',
    });
    expect(result.outcome).toBe('invalid_path');
    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('runCopyrightClaimAttachmentsCleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRemove.mockResolvedValue({ error: null });
  });

  test('processes batch and continues after one storage failure', async () => {
    const row2 = { id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a45', storage_path: validPath };
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: attId, storage_path: validPath }, row2],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    mockRemove
      .mockResolvedValueOnce({ error: { name: 'E', message: 'fail' } as never })
      .mockResolvedValueOnce({ error: null });

    const summary = await runCopyrightClaimAttachmentsCleanup({
      batchSize: 10,
      olderThanHours: 72,
    });
    expect(summary.pendingFound).toBe(2);
    expect(summary.storageErrors).toBe(1);
    expect(summary.dbRecordsRemoved).toBe(1);
  });

  test('second run is safe when nothing left', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const first = await runCopyrightClaimAttachmentsCleanup({ batchSize: 5, olderThanHours: 72 });
    expect(first.pendingFound).toBe(0);
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const second = await runCopyrightClaimAttachmentsCleanup({ batchSize: 5, olderThanHours: 72 });
    expect(second.pendingFound).toBe(0);
  });
});
