import { useEffect, useState } from 'react';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { consumeAlbumPurchaseSuccessToast } from '@shared/lib/albumPurchaseSuccessToast';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import './style.scss';

const TOAST_DURATION_MS = 4500;

function SuccessIcon() {
  return (
    <svg
      className="album-purchase-success-toast__icon-svg"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M5 10.5L8.5 14L15 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type AlbumPurchaseSuccessToastProps = {
  isOwned: boolean;
  ownershipLoading: boolean;
  returnPath: string;
};

export function AlbumPurchaseSuccessToast({
  isOwned,
  ownershipLoading,
  returnPath,
}: AlbumPurchaseSuccessToastProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (ownershipLoading || !isOwned) return;

    if (consumeAlbumPurchaseSuccessToast(returnPath)) {
      setVisible(true);
    }
  }, [isOwned, ownershipLoading, returnPath]);

  useEffect(() => {
    if (!visible) return undefined;

    const timer = window.setTimeout(() => setVisible(false), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  const en = lang !== 'ru';
  const copy = ui?.checkout?.purchaseSuccessToast;
  const title =
    copy?.title ?? (en ? 'Album added to My Purchases' : 'Альбом добавлен в «Мои покупки»');
  const description =
    copy?.description ??
    (en ? 'You can download it any time.' : 'Вы можете скачать его в любой момент.');

  return (
    <div
      className="album-purchase-success-toast"
      role="status"
      aria-live="polite"
      style={
        {
          '--album-purchase-success-toast-duration': `${TOAST_DURATION_MS}ms`,
        } as React.CSSProperties
      }
    >
      <div className="album-purchase-success-toast__icon">
        <SuccessIcon />
      </div>
      <div className="album-purchase-success-toast__body">
        <p className="album-purchase-success-toast__title">{title}</p>
        <p className="album-purchase-success-toast__description">{description}</p>
      </div>
      <div className="album-purchase-success-toast__progress" aria-hidden="true" />
    </div>
  );
}
