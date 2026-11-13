/** Open album checkout `<dialog>` — must be closed before cross-origin payment navigation. */
export const ALBUM_CHECKOUT_OPEN_DIALOG_SELECTOR = 'dialog.popup[open]:has(.album-checkout-modal)';

/**
 * Native `showModal()` keeps the checkout dialog on the top layer until `close()`.
 * React `onClose()` alone is async; this sync close is required before YooKassa redirect.
 */
export function releaseAlbumCheckoutTopLayerDialog(): void {
  if (typeof document === 'undefined') {
    return;
  }

  const dialog = document.querySelector<HTMLDialogElement>(ALBUM_CHECKOUT_OPEN_DIALOG_SELECTOR);
  if (dialog?.open) {
    dialog.close();
  }
}
