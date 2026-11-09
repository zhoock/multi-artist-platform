let syncHomeArtistCardPlayButton: (() => void) | null = null;

export function setHomeArtistCardPlayButtonSync(handler: (() => void) | null): void {
  syncHomeArtistCardPlayButton = handler;
}

export function syncHomeArtistCardPlayButtonFromPlayer(): void {
  syncHomeArtistCardPlayButton?.();
}
