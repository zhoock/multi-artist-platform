import { describe, expect, test } from '@jest/globals';

import {
  beginMyArchiveCollectionFetch,
  beginMyArchiveProviderFetch,
  isMyArchiveCollectionFetchStale,
  isMyArchiveProviderFetchStale,
  resetMyArchiveFetchGenerationForTests,
} from '../myArchiveFetchGeneration';

describe('myArchiveFetchGeneration', () => {
  test('drops stale collection fetch after a newer collection fetch starts', () => {
    resetMyArchiveFetchGenerationForTests();
    const first = beginMyArchiveCollectionFetch();
    const second = beginMyArchiveCollectionFetch();
    expect(isMyArchiveCollectionFetchStale(first)).toBe(true);
    expect(isMyArchiveCollectionFetchStale(second)).toBe(false);
  });

  test('provider and collection generations do not cross-invalidate', () => {
    resetMyArchiveFetchGenerationForTests();
    const provider = beginMyArchiveProviderFetch();
    const collection = beginMyArchiveCollectionFetch();
    expect(isMyArchiveProviderFetchStale(provider)).toBe(false);
    expect(isMyArchiveCollectionFetchStale(collection)).toBe(false);
    beginMyArchiveProviderFetch();
    expect(isMyArchiveProviderFetchStale(provider)).toBe(true);
    expect(isMyArchiveCollectionFetchStale(collection)).toBe(false);
  });
});
