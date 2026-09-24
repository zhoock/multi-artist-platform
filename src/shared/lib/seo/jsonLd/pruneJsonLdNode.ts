/** Drops null, undefined, and empty strings so JSON-LD omits unset optional fields. */
export function pruneJsonLdNode<T extends Record<string, unknown>>(node: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (Array.isArray(value)) {
      const items = value
        .map((item) =>
          item && typeof item === 'object' && !Array.isArray(item)
            ? pruneJsonLdNode(item as Record<string, unknown>)
            : item
        )
        .filter((item) => item !== null && item !== undefined);
      if (items.length === 0) continue;
      out[key] = items;
      continue;
    }
    if (typeof value === 'object') {
      out[key] = pruneJsonLdNode(value as Record<string, unknown>);
      continue;
    }
    out[key] = value;
  }
  return out as T;
}
