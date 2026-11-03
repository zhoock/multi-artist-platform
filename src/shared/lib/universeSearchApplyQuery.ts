export const UNIVERSE_SEARCH_APPLY_QUERY_EVENT = 'universe-search:apply-query';

export function dispatchUniverseSearchApplyQuery(query: string): void {
  const trimmed = query.trim();
  if (!trimmed) return;
  window.dispatchEvent(
    new CustomEvent(UNIVERSE_SEARCH_APPLY_QUERY_EVENT, { detail: { query: trimmed } })
  );
}
