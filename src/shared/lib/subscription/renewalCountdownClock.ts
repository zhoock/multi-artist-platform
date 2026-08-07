const MINUTE_MS = 60_000;
const SECOND_MS = 1000;

const targets = new Map<symbol, string | null>();
const listeners = new Set<() => void>();

let nowMs = Date.now();
let timer: ReturnType<typeof setTimeout> | undefined;
let listenerCount = 0;

function minRemainingMs(): number | null {
  let min: number | null = null;

  for (const iso of targets.values()) {
    if (!iso) continue;
    const targetMs = new Date(iso).getTime();
    if (Number.isNaN(targetMs)) continue;
    const remainingMs = targetMs - nowMs;
    if (min === null || remainingMs < min) min = remainingMs;
  }

  return min;
}

function resolveTickInterval(): number {
  const minRemaining = minRemainingMs();
  if (minRemaining !== null && minRemaining > 0 && minRemaining < MINUTE_MS) {
    return SECOND_MS;
  }
  return MINUTE_MS;
}

function notifyListeners(): void {
  nowMs = Date.now();
  for (const listener of listeners) {
    listener();
  }
}

function scheduleTick(): void {
  if (timer !== undefined) clearTimeout(timer);
  if (listenerCount === 0 || targets.size === 0) {
    timer = undefined;
    return;
  }

  timer = setTimeout(() => {
    notifyListeners();
    scheduleTick();
  }, resolveTickInterval());
}

export function getRenewalCountdownNow(): Date {
  return new Date(nowMs);
}

export function registerRenewalCountdownTarget(nextChargeAt: string | null | undefined): symbol {
  const id = Symbol('renewal-countdown-target');
  targets.set(id, nextChargeAt ?? null);
  scheduleTick();
  return id;
}

export function updateRenewalCountdownTarget(
  id: symbol,
  nextChargeAt: string | null | undefined
): void {
  targets.set(id, nextChargeAt ?? null);
  scheduleTick();
}

export function unregisterRenewalCountdownTarget(id: symbol): void {
  targets.delete(id);
  scheduleTick();
}

export function subscribeRenewalCountdownClock(listener: () => void): () => void {
  listenerCount += 1;
  listeners.add(listener);
  nowMs = Date.now();

  if (targets.size > 0) {
    scheduleTick();
  }

  return () => {
    listeners.delete(listener);
    listenerCount = Math.max(0, listenerCount - 1);
    scheduleTick();
  };
}

/** Test helper — resets module state between tests. */
export function resetRenewalCountdownClockForTests(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  targets.clear();
  listeners.clear();
  listenerCount = 0;
  nowMs = Date.now();
}

export function getRenewalCountdownClockTickIntervalForTests(): number {
  return resolveTickInterval();
}

export function getRenewalCountdownTargetCountForTests(): number {
  return targets.size;
}
