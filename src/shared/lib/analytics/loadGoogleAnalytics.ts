import { GA_MEASUREMENT_ID } from './config';

function ensureGtagStub(): void {
  window.dataLayer = window.dataLayer || [];

  if (window.gtag) {
    return;
  }

  window.gtag = function gtag() {
    window.dataLayer!.push(arguments);
  };
}

function appendGtagScript(measurementId: string): void {
  const src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);

  if (existingScript) {
    return;
  }

  const script = document.createElement('script');
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

export function loadGoogleAnalytics(measurementId = GA_MEASUREMENT_ID): void {
  ensureGtagStub();
  appendGtagScript(measurementId);

  window.gtag!('js', new Date());
  window.gtag!('config', measurementId);
}
