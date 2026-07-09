import { useEffect, useState } from 'react';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { consumeLyricsSyncSavedToast } from '@shared/lib/lyricsSyncSavedToast';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import './style.scss';

const TOAST_DURATION_MS = 4500;

function SuccessIcon() {
  return (
    <svg
      className="lyrics-sync-saved-toast__icon-svg"
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

type LyricsSyncSavedToastProps = {
  triggerKey: unknown;
};

export function LyricsSyncSavedToast({ triggerKey }: LyricsSyncSavedToastProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (consumeLyricsSyncSavedToast()) {
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
    ui?.dashboard?.lyricsSyncSavedToast ??
    (en ? 'Synchronization saved' : 'Синхронизация сохранена');
  const description =
    ui?.dashboard?.lyricsSyncSavedToastDescription ??
    (en ? 'Your changes have been saved.' : 'Изменения сохранены.');

  return (
    <div
      className="lyrics-sync-saved-toast"
      role="status"
      aria-live="polite"
      style={
        { '--lyrics-sync-saved-toast-duration': `${TOAST_DURATION_MS}ms` } as React.CSSProperties
      }
    >
      <div className="lyrics-sync-saved-toast__icon">
        <SuccessIcon />
      </div>
      <div className="lyrics-sync-saved-toast__body">
        <p className="lyrics-sync-saved-toast__title">{title}</p>
        <p className="lyrics-sync-saved-toast__description">{description}</p>
      </div>
      <div className="lyrics-sync-saved-toast__progress" aria-hidden="true" />
    </div>
  );
}
