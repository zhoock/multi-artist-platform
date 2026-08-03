// Helper для debug-логов только в development
export const debugLog = (...args: any[]) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(...args);
  }
};

export const trackDebug = (label: string, data: Record<string, unknown> = {}) => {
  const entry = { t: Date.now(), label, ...data };
  if (typeof window !== 'undefined') {
    (window as any).__playerDebug ??= [];
    (window as any).__playerDebug.push(entry);
  }
};
