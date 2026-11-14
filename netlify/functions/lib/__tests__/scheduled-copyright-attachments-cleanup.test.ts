jest.mock('../copyright-claim-attachments', () => ({
  COPYRIGHT_CLAIM_ATTACHMENT_PENDING_CLEANUP_HOURS: 72,
}));

jest.mock('../copyright-claim-attachments-cleanup', () => ({
  runCopyrightClaimAttachmentsCleanup: jest.fn().mockResolvedValue({
    batchesRun: 1,
    pendingFound: 2,
    storageObjectsRemoved: 1,
    storageAlreadyAbsent: 1,
    dbRecordsRemoved: 2,
    storageErrors: 0,
    dbErrors: 0,
    invalidPathsSkipped: 0,
  }),
}));

jest.mock('../subscription-renewal-scheduler-auth', () => ({
  isTrustedNetlifyPlatformSchedule: jest.fn().mockReturnValue(true),
}));

import { runCopyrightClaimAttachmentsCleanup } from '../copyright-claim-attachments-cleanup';
import { handler } from '../../scheduled-copyright-attachments-cleanup';

const mockRun = runCopyrightClaimAttachmentsCleanup as jest.Mock;

describe('scheduled-copyright-attachments-cleanup', () => {
  test('runs cleanup when schedule is trusted', async () => {
    const res = await handler({ headers: { 'x-nf-event': 'schedule' } } as never, {} as never);
    expect(res?.statusCode).toBe(200);
    expect(mockRun).toHaveBeenCalled();
    const body = JSON.parse(res?.body ?? '{}');
    expect(body.dbRecordsRemoved).toBe(2);
    expect(body.pendingCleanupHours).toBe(72);
  });
});
