import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';

import { useLang } from '@app/providers/lang';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { getToken } from '@shared/lib/auth';
import { addArtistToArchiveApi, ArchiveApiError, getMyArchive } from '@shared/api/archive';
import {
  dispatchArchiveArtistAdded,
  refreshPremiumContentForArchiveChange,
  SUBSCRIPTION_ACTIVATED_EVENT,
} from '@features/artistArchive';

import { usePremiumSubscription } from '../lib/PremiumSubscriptionContext';
import { SubscriptionPlanBadge } from '@shared/ui/subscriptionPlan';
import {
  isPremiumCheckoutPending,
  isPremiumSuccessModalShown,
  markPremiumSuccessModalShown,
} from '../lib/premiumSuccessModalStorage';
import { resolveCheckoutArtistCard, type CheckoutArtistCard } from '../lib/resolveCheckoutArtist';
import { LocalModal } from '@shared/ui/localModal';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';

import './premiumSuccessModal.scss';

function IconPremiumSuccess({ className }: { className?: string }) {
  return (
    <svg className={className} width={48} height={48} viewBox="0 0 48 48" fill="none" aria-hidden>
      <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" />
      <path
        d="M15 24.5l6 6 12-13"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type Props = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  open: boolean;
  onClose: () => void;
};

export function PremiumSuccessModalView({ dialogRef, open, onClose }: Props) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const { isPremium, slotsLimit, planSlug } = usePremiumSubscription();

  const [artist, setArtist] = useState<CheckoutArtistCard | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [artistInArchive, setArtistInArchive] = useState(false);

  const title =
    ui?.titles?.premiumSuccessTitle ?? (lang === 'en' ? "You're Premium!" : 'Вы Premium!');
  const subtitle =
    ui?.titles?.premiumSuccessSubtitle ??
    (lang === 'en'
      ? 'Add this artist to your collection and unlock exclusive content.'
      : 'Добавьте артиста в коллекцию и откройте эксклюзивный контент.');
  const planLabel = planSlug ? (
    lang === 'en' ? (
      <>
        Current plan: <SubscriptionPlanBadge planSlug={planSlug} />
      </>
    ) : (
      <>
        Текущий план: <SubscriptionPlanBadge planSlug={planSlug} />
      </>
    )
  ) : null;
  const slotsHint = ui?.titles?.premiumSuccessSlotsHint?.includes('{count}')
    ? ui.titles.premiumSuccessSlotsHint.replace('{count}', String(slotsLimit))
    : lang === 'en'
      ? `You can now add up to ${slotsLimit} artists to your collection.`
      : `Теперь вы можете добавить до ${slotsLimit} артистов в коллекцию.`;
  const addLabel = ui?.buttons?.premiumSuccessAdd ?? (lang === 'en' ? 'Add' : 'Добавить');
  const goArchiveLabel =
    ui?.buttons?.premiumSuccessGoToArchive ??
    (lang === 'en' ? 'Open Collection' : 'Открыть коллекцию');
  const maybeLaterLabel =
    ui?.buttons?.premiumSuccessMaybeLater ?? (lang === 'en' ? 'Maybe later' : 'Позже');
  const closeLabel = ui?.buttons?.articleLockedDialogClose ?? (lang === 'en' ? 'Close' : 'Закрыть');

  const dismiss = useCallback(() => {
    markPremiumSuccessModalShown();
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void resolveCheckoutArtistCard(lang).then((card) => {
      if (!cancelled) setArtist(card);
    });
    return () => {
      cancelled = true;
    };
  }, [lang, open]);

  const handleAdd = useCallback(async () => {
    if (!artist?.artistUserId || adding || artistInArchive) return;

    setAdding(true);
    setAddError(null);
    try {
      const { status } = await addArtistToArchiveApi(artist.artistUserId);
      if (status.artistInArchive) {
        setArtistInArchive(true);
        refreshPremiumContentForArchiveChange(dispatch, artist.slug);
        dispatchArchiveArtistAdded(artist.artistUserId, artist.slug);
        markPremiumSuccessModalShown();
        onClose();
      }
    } catch (err) {
      if (err instanceof ArchiveApiError && err.code === 'ARCHIVE_SLOTS_LIMIT') {
        setAddError(
          ui?.titles?.premiumSuccessArchiveFull ??
            (lang === 'en' ? 'Collection is full' : 'Коллекция заполнена')
        );
      } else {
        setAddError(
          err instanceof Error
            ? err.message
            : (ui?.titles?.premiumSuccessAddError ??
                (lang === 'en' ? 'Could not add artist' : 'Не удалось добавить'))
        );
      }
    } finally {
      setAdding(false);
    }
  }, [adding, artist, artistInArchive, dispatch, lang, onClose, ui?.titles]);

  const handleGoArchive = useCallback(() => {
    dismiss();
    navigate('/dashboard-new/archive');
  }, [dismiss, navigate]);

  return (
    <LocalModal
      dialogRef={dialogRef}
      isOpen={open}
      className="premium-success-modal"
      aria-labelledby="premium-success-modal-title"
      onClose={dismiss}
    >
      <div className="premium-success-modal__panel">
        <button
          type="button"
          className="premium-success-modal__close"
          aria-label={closeLabel}
          onClick={dismiss}
        >
          <ModalCloseIcon />
        </button>

        <div className="premium-success-modal__icon-wrap">
          <IconPremiumSuccess className="premium-success-modal__icon" />
        </div>

        <h2 id="premium-success-modal-title" className="premium-success-modal__title">
          {title}
        </h2>
        {planLabel ? <p className="premium-success-modal__plan">{planLabel}</p> : null}
        <p className="premium-success-modal__subtitle">{subtitle}</p>

        {artist ? (
          <div className="premium-success-modal__artist">
            <div className="premium-success-modal__artist-cover">
              {artist.cover ? (
                <img src={artist.cover} alt="" loading="lazy" decoding="async" />
              ) : (
                <span className="premium-success-modal__artist-cover-fallback" aria-hidden>
                  {artist.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="premium-success-modal__artist-meta">
              <span className="premium-success-modal__artist-name">{artist.name}</span>
              <span className="premium-success-modal__artist-genre">{artist.genreLabel}</span>
            </div>
            {artistInArchive ? (
              <span className="premium-success-modal__artist-added" aria-live="polite">
                ✓
              </span>
            ) : (
              <button
                type="button"
                className="premium-success-modal__artist-add"
                disabled={adding || !isPremium}
                aria-busy={adding}
                onClick={() => void handleAdd()}
              >
                + {addLabel}
              </button>
            )}
          </div>
        ) : null}

        {addError ? (
          <p className="premium-success-modal__error" role="alert">
            {addError}
          </p>
        ) : null}

        <p className="premium-success-modal__slots-hint">{slotsHint}</p>

        <div className="premium-success-modal__actions">
          <button type="button" className="premium-success-modal__cta" onClick={handleGoArchive}>
            {goArchiveLabel}
          </button>
          <button type="button" className="premium-success-modal__secondary" onClick={dismiss}>
            {maybeLaterLabel}
          </button>
        </div>
      </div>
    </LocalModal>
  );
}

export function PremiumSuccessModalController() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const { refetch } = usePremiumSubscription();
  const openedRef = useRef(false);

  const tryOpen = useCallback(async () => {
    if (openedRef.current) return;
    if (isPremiumSuccessModalShown()) return;
    if (!isPremiumCheckoutPending()) return;
    if (!getToken()) return;

    try {
      const data = await getMyArchive();
      if (!data.isPremium) return;
      if (isPremiumSuccessModalShown()) return;
      if (!isPremiumCheckoutPending()) return;

      openedRef.current = true;
      setOpen(true);
      void refetch();
    } catch {
      /* ignore */
    }
  }, [refetch]);

  useEffect(() => {
    void tryOpen();
  }, [tryOpen]);

  useEffect(() => {
    const onActivated = () => {
      void tryOpen();
    };
    window.addEventListener(SUBSCRIPTION_ACTIVATED_EVENT, onActivated);
    return () => window.removeEventListener(SUBSCRIPTION_ACTIVATED_EVENT, onActivated);
  }, [tryOpen]);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  return <PremiumSuccessModalView dialogRef={dialogRef} open={open} onClose={close} />;
}
