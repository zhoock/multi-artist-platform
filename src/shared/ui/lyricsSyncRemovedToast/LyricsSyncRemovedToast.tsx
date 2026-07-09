import { useEffect, useState } from 'react';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { consumeLyricsSyncRemovedToast } from '@shared/lib/lyricsSyncRemovedToast';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import './style.scss';

const TOAST_DURATION_MS = 4500;

function SuccessIcon() {
  return (
    <svg
      className="lyrics-sync-removed-toast__icon-svg"
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

type LyricsSyncRemovedToastProps = {
  triggerKey: unknown;
};

export function LyricsSyncRemovedToast({ triggerKey }: LyricsSyncRemovedToastProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (consumeLyricsSyncRemovedToast()) {
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
    ui?.dashboard?.lyricsSyncRemovedToast ??
    (en ? 'Synchronization removed' : 'Синхронизация удалена');

  return (
    <div
      className="lyrics-sync-removed-toast"
      role="status"
      aria-live="polite"
      style={
        { '--lyrics-sync-removed-toast-duration': `${TOAST_DURATION_MS}ms` } as React.CSSProperties
      }
    >
      <div className="lyrics-sync-removed-toast__icon">
        <SuccessIcon />
      </div>
      <div className="lyrics-sync-removed-toast__body">
        <p className="lyrics-sync-removed-toast__title">{title}</p>
      </div>
      <div className="lyrics-sync-removed-toast__progress" aria-hidden="true" />
    </div>
  );
}
