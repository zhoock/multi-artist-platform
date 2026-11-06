import { query } from '../db';
import { insertCopyrightClaimAdminNotification } from '../admin-notifications-db';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

const mockQuery = query as jest.MockedFunction<typeof query>;

describe('admin-notifications-db', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('insert uses ON CONFLICT DO NOTHING for duplicate prevention', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await insertCopyrightClaimAdminNotification({
      claimId: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a46',
      payload: { contentTitle: 'Album' },
    });
    const sql = String(mockQuery.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('ON CONFLICT');
    expect(sql).toContain('DO NOTHING');
    expect(mockQuery.mock.calls[0]?.[1]).toEqual([
      JSON.stringify({ contentTitle: 'Album' }),
      'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a46',
    ]);
  });
});
