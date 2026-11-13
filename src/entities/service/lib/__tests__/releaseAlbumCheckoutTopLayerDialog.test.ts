import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import {
  ALBUM_CHECKOUT_OPEN_DIALOG_SELECTOR,
  releaseAlbumCheckoutTopLayerDialog,
} from '../releaseAlbumCheckoutTopLayerDialog';

describe('releaseAlbumCheckoutTopLayerDialog', () => {
  let dialog: HTMLDialogElement;

  beforeEach(() => {
    dialog = document.createElement('dialog');
    dialog.className = 'popup';
    dialog.innerHTML = '<div class="album-checkout-modal"></div>';
    document.body.appendChild(dialog);
    dialog.showModal();
  });

  afterEach(() => {
    dialog.remove();
  });

  test('selector matches open checkout dialog', () => {
    expect(document.querySelector(ALBUM_CHECKOUT_OPEN_DIALOG_SELECTOR)).toBe(dialog);
  });

  test('closes open checkout dialog synchronously', () => {
    expect(dialog.open).toBe(true);
    releaseAlbumCheckoutTopLayerDialog();
    expect(dialog.open).toBe(false);
  });
});
