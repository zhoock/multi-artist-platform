/** Separate generations so provider refetch and collection load do not invalidate each other. */
let providerGeneration = 0;
let collectionGeneration = 0;

export function beginMyArchiveProviderFetch(): number {
  providerGeneration += 1;
  return providerGeneration;
}

export function isMyArchiveProviderFetchStale(generation: number): boolean {
  return generation !== providerGeneration;
}

export function beginMyArchiveCollectionFetch(): number {
  collectionGeneration += 1;
  return collectionGeneration;
}

export function isMyArchiveCollectionFetchStale(generation: number): boolean {
  return generation !== collectionGeneration;
}

/** @deprecated Use beginMyArchiveProviderFetch or beginMyArchiveCollectionFetch */
export function beginMyArchiveFetch(): number {
  return beginMyArchiveCollectionFetch();
}

/** @deprecated Use isMyArchiveCollectionFetchStale */
export function isMyArchiveFetchStale(generation: number): boolean {
  return isMyArchiveCollectionFetchStale(generation);
}

export function resetMyArchiveFetchGenerationForTests(): void {
  providerGeneration = 0;
  collectionGeneration = 0;
}
