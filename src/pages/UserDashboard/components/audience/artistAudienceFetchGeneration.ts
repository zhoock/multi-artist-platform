let fetchGeneration = 0;

export function beginArtistAudienceFetch(): number {
  fetchGeneration += 1;
  return fetchGeneration;
}

export function isArtistAudienceFetchStale(generation: number): boolean {
  return generation !== fetchGeneration;
}

export function resetArtistAudienceFetchGenerationForTests(): void {
  fetchGeneration = 0;
}
