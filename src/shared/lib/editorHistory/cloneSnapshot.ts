/** Глубокое клонирование snapshot (blocks + selection). */
export function cloneSnapshot<T>(snapshot: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(snapshot);
  }
  return JSON.parse(JSON.stringify(snapshot)) as T;
}
