/**
 * Unit tests for artist audience revenue aggregates.
 */

import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import type { QueryResult } from 'pg';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

import { query } from '../db';
import {
  getArtistAlbumSalesRevenue,
  getArtistAudienceRevenue,
  getArtistSubscriberSupportRevenue,
} from '../artist-audience-revenue';

const mockedQuery = query as jest.MockedFunction<typeof query>;

function fakeQueryResult(rows: Record<string, unknown>[] = []): QueryResult<any> {
  return {
    rows,
    rowCount: rows.length,
    command: '',
    oid: 0,
    fields: [],
  };
}

const ARTIST = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const START = new Date('2026-10-01T00:00:00.000Z');

beforeEach(() => {
  mockedQuery.mockReset();
});

describe('getArtistAlbumSalesRevenue', () => {
  test('sums paid orders with succeeded payments for artist albums', async () => {
    mockedQuery.mockResolvedValueOnce(fakeQueryResult([{ total: '4450.00' }]));

    const total = await getArtistAlbumSalesRevenue(ARTIST, START);

    expect(total).toBe(4450);
    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain("o.status = 'paid'");
    expect(String(mockedQuery.mock.calls[0]?.[0])).toContain("p.status = 'succeeded'");
  });
});

describe('getArtistSubscriberSupportRevenue', () => {
  test('aggregates equal shares from succeeded subscription payments', async () => {
    mockedQuery.mockResolvedValueOnce(fakeQueryResult([{ total: '8000.00' }]));

    const total = await getArtistSubscriberSupportRevenue(ARTIST, START);

    expect(total).toBe(8000);
    const sql = String(mockedQuery.mock.calls[0]?.[0]);
    expect(sql).toContain('subscription_payments');
    expect(sql).toContain("sp.status = 'succeeded'");
    expect(sql).toContain("<> 'rebind'");
    expect(sql).toContain('sp.amount / slot_count.c');
  });
});

describe('getArtistAudienceRevenue', () => {
  test('returns total as sum of both sources', async () => {
    mockedQuery
      .mockResolvedValueOnce(fakeQueryResult([{ total: '4450.00' }]))
      .mockResolvedValueOnce(fakeQueryResult([{ total: '8000.00' }]));

    const revenue = await getArtistAudienceRevenue(ARTIST, START);

    expect(revenue).toEqual({
      currency: 'RUB',
      albumSales: 4450,
      subscriberSupport: 8000,
      total: 12450,
    });
  });
});
