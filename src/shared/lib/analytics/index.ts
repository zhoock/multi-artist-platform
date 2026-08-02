declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    dataLayer?: any[];
    ym?: ((counterId: number, method: string, ...args: unknown[]) => void) & {
      a?: IArguments[];
      l?: number;
    };
  }
}

export { AnalyticsController } from './AnalyticsController';
export { initAnalytics } from './initAnalytics';

const DEBUG_GA =
  (typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('debugGa') === '1') ||
  (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production');

/**
 * Sends a GA4 custom event.
 *
 * Before analytics initialization (including before user consent), events are
 * intentionally ignored. We do not buffer events collected prior to consent.
 */
export function gaEvent(name: string, params: Record<string, any> = {}) {
  if (DEBUG_GA) {
    console.log('[GA4]', name, params);
  }

  if (window.gtag) {
    window.gtag('event', name, params);
    return;
  }

  if (window.dataLayer) {
    window.dataLayer.push({ event: name, ...params });
  }
}
