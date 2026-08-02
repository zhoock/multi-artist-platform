import { loadGoogleAnalytics } from './loadGoogleAnalytics';
import { loadYandexMetrika } from './loadYandexMetrika';

let initPromise: Promise<void> | null = null;

export function initAnalytics(): Promise<void> {
  if (initPromise) {
    return initPromise;
  }

  initPromise = Promise.resolve().then(() => {
    loadGoogleAnalytics();
    loadYandexMetrika();
  });

  return initPromise;
}
