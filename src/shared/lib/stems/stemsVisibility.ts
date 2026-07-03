export type StemsVisibility = 'public' | 'subscribers_only' | 'hidden';

const VIS_SET: ReadonlySet<string> = new Set(['public', 'subscribers_only', 'hidden']);

export function normalizeStemsVisibility(raw: unknown): StemsVisibility {
  if (typeof raw === 'string' && VIS_SET.has(raw)) {
    return raw as StemsVisibility;
  }
  return 'public';
}

export const STEMS_VISIBILITY_OPTIONS: readonly {
  value: StemsVisibility;
}[] = [{ value: 'public' }, { value: 'subscribers_only' }, { value: 'hidden' }] as const;
