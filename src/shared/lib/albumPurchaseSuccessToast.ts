import { armPurchaseSuccessToast } from '@shared/lib/toast/armPurchaseSuccessToast';
import { toast } from './toast/toastApi';
import { ALBUM_PURCHASE_SUCCESS_TOAST_DURATION_MS } from './toast/toastDurations';

export function normalizeAlbumReturnPath(returnTo: string): string | null {
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://local.invalid';
    const url = new URL(returnTo, base);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function showAlbumPurchaseSuccessToast(
  ui:
    | { checkout?: { purchaseSuccessToast?: { title?: string; description?: string } } }
    | null
    | undefined,
  lang: string
): void {
  const en = lang !== 'ru';
  const copy = ui?.checkout?.purchaseSuccessToast;
  toast.show({
    variant: 'success',
    title: copy?.title ?? (en ? 'Album added to My Purchases' : 'Альбом добавлен в «Мои покупки»'),
    description:
      copy?.description ??
      (en ? 'You can download it any time.' : 'Вы можете скачать его в любой момент.'),
    duration: ALBUM_PURCHASE_SUCCESS_TOAST_DURATION_MS,
    placement: 'top-right-offset',
  });
}

export function redirectToAlbumReturnPath(returnTo: string): void {
  if (typeof window === 'undefined') return;

  armPurchaseSuccessToast(returnTo);

  const path = normalizeAlbumReturnPath(returnTo);
  if (path) {
    window.location.href = path;
    return;
  }

  window.location.href = returnTo;
}
