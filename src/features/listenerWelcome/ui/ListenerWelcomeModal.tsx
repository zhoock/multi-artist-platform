import { useCallback, useEffect, useMemo, type RefObject } from 'react';

import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { useBodyScrollLock } from '@shared/lib/hooks/useBodyScrollLock';
import { LocalModal } from '@shared/ui/localModal';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import { platformDisplayName } from '@shared/constants/platformBranding';

import './listenerWelcomeModal.scss';

type ListenerWelcomeModalProps = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  open: boolean;
  onDismiss: () => void;
};

function FeatureIcon({ name }: { name: 'follow' | 'purchase' | 'read' | 'archive' }) {
  switch (name) {
    case 'follow':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="17" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M3.5 19c0-2.8 2.5-5 5.5-5s5.5 2.2 5.5 5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M14.5 17.5c.6-1.6 2-2.8 3.8-2.8 2.2 0 4 1.7 4 3.8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'purchase':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6 6h15l-1.5 9h-12L6 6Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M6 6 5 3H2"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="10" cy="19" r="1.25" fill="currentColor" />
          <circle cx="17" cy="19" r="1.25" fill="currentColor" />
        </svg>
      );
    case 'read':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 5.5h14v13H5V5.5Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M8 9h8M8 12h8M8 15h5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'archive':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 7.5h16v11H4v-11Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M8 4.5h8v3H8v-3Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M9.5 12h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
  }
}

export function ListenerWelcomeModal({ dialogRef, open, onDismiss }: ListenerWelcomeModalProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));

  useBodyScrollLock(open);

  const copy = useMemo(() => {
    const welcome = ui?.listenerWelcome;
    const en = lang !== 'ru';
    const fallback = en
      ? {
          welcomePrefix: 'Welcome to',
          siteName: platformDisplayName('en'),
          subtitle: 'Discover music, albums and articles from independent artists.',
          featureFollow: 'Follow your favorite artists',
          featurePurchase: 'Purchase albums and support artists',
          featureRead: 'Read articles and interviews',
          featureArchive: 'Build your personal collection',
          startExploring: 'Start exploring',
          close: 'Close',
        }
      : {
          welcomePrefix: 'Добро пожаловать на',
          siteName: platformDisplayName('ru'),
          subtitle: 'Открывайте музыку, альбомы и статьи независимых артистов.',
          featureFollow: 'Подписывайтесь на любимых артистов',
          featurePurchase: 'Покупайте альбомы и поддерживайте музыкантов',
          featureRead: 'Читайте статьи и интервью',
          featureArchive: 'Собирайте личную коллекцию',
          startExploring: 'Начать знакомство',
          close: 'Закрыть',
        };
    return { ...fallback, ...welcome };
  }, [lang, ui?.listenerWelcome]);

  const features = useMemo(
    () =>
      [
        { id: 'follow', label: copy.featureFollow },
        { id: 'purchase', label: copy.featurePurchase },
        { id: 'read', label: copy.featureRead },
        { id: 'archive', label: copy.featureArchive },
      ] as const,
    [copy]
  );

  const handleDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;

    const onCancel = (event: Event) => {
      event.preventDefault();
      handleDismiss();
    };

    dialog.addEventListener('cancel', onCancel);
    return () => dialog.removeEventListener('cancel', onCancel);
  }, [dialogRef, handleDismiss, open]);

  return (
    <LocalModal
      dialogRef={dialogRef}
      isOpen={open}
      onClose={handleDismiss}
      className="listener-welcome-modal"
      aria-labelledby="listener-welcome-title"
      closeOnBackdropClick
    >
      <div className="listener-welcome-modal__panel">
        <button
          type="button"
          className="listener-welcome-modal__close"
          onClick={handleDismiss}
          aria-label={copy.close}
        >
          <ModalCloseIcon />
        </button>

        <h2 id="listener-welcome-title" className="listener-welcome-modal__title">
          {copy.welcomePrefix}
          <span className="listener-welcome-modal__site-name">{copy.siteName}</span>
        </h2>

        <div className="listener-welcome-modal__divider" aria-hidden="true" />

        <p className="listener-welcome-modal__subtitle">{copy.subtitle}</p>

        <ul className="listener-welcome-modal__features">
          {features.map((feature) => (
            <li key={feature.id} className="listener-welcome-modal__feature">
              <span className="listener-welcome-modal__feature-icon">
                <FeatureIcon name={feature.id} />
              </span>
              <span>{feature.label}</span>
            </li>
          ))}
        </ul>

        <button type="button" className="listener-welcome-modal__cta" onClick={handleDismiss}>
          {copy.startExploring}
          <span className="listener-welcome-modal__cta-arrow" aria-hidden="true">
            →
          </span>
        </button>
      </div>
    </LocalModal>
  );
}
