import { useEffect, useState } from 'react';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { consumeAlbumPublishedToast } from '@shared/lib/albumPublishedToast';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import './style.scss';

const TOAST_DURATION_MS = 4500;

function SuccessIcon() {
  return (
    <svg
      className="album-published-toast__icon-svg"
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

type AlbumPublishedToastProps = {
  /** Re-run consume when this value changes (e.g. album modal closes). */
  triggerKey: unknown;
};

export function AlbumPublishedToast({ triggerKey }: AlbumPublishedToastProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (consumeAlbumPublishedToast()) {
      setVisible(true);
    }
  }, [triggerKey]);

  useEffect(() => {
    if (!visible) return undefined;

    const timer = window.setTimeout(() => setVisible(false), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  const en = lang !== 'ru';
  const title =
    ui?.dashboard?.albumPublishedSuccessToast ?? (en ? 'Album published' : 'Альбом опубликован');
  const description =
    ui?.dashboard?.albumPublishedSuccessToastDescription ??
    (en ? 'Your album is now available to listeners.' : 'Ваш альбом теперь доступен слушателям.');

  return (
    <div
      className="album-published-toast"
      role="status"
      aria-live="polite"
      style={
        { '--album-published-toast-duration': `${TOAST_DURATION_MS}ms` } as React.CSSProperties
      }
    >
      <div className="album-published-toast__icon">
        <SuccessIcon />
      </div>
      <div className="album-published-toast__body">
        <p className="album-published-toast__title">{title}</p>
        <p className="album-published-toast__description">{description}</p>
      </div>
      <div className="album-published-toast__progress" aria-hidden="true" />
    </div>
  );
}
