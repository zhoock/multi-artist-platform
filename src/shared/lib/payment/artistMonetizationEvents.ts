/**
 * Broadcast when the current artist connects/disconnects payment acceptance.
 * Listeners refresh monetizationEnabled without a full page reload.
 */

export const ARTIST_MONETIZATION_CHANGED_EVENT = 'artist:monetization-changed';

export type ArtistMonetizationChangedDetail = {
  monetizationEnabled: boolean;
};

export function dispatchArtistMonetizationChanged(monetizationEnabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ArtistMonetizationChangedDetail>(ARTIST_MONETIZATION_CHANGED_EVENT, {
      detail: { monetizationEnabled },
    })
  );
}

export function subscribeArtistMonetizationChanged(
  listener: (monetizationEnabled: boolean) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<ArtistMonetizationChangedDetail>).detail;
    listener(Boolean(detail?.monetizationEnabled));
  };

  window.addEventListener(ARTIST_MONETIZATION_CHANGED_EVENT, handler);
  return () => window.removeEventListener(ARTIST_MONETIZATION_CHANGED_EVENT, handler);
}
