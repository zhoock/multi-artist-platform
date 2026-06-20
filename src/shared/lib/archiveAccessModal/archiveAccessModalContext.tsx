import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';

import { getArchiveStatus } from '@shared/api/archive';
import { getToken } from '@shared/lib/auth';
import { useAuthSessionUser } from '@shared/lib/hooks/useAuthSessionUser';
import { AlertModal } from '@shared/ui/alertModal';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import {
  beginPremiumCheckoutAuthIntent,
  clearPremiumCheckoutAuthIntent,
  type PremiumCheckoutIntentContext,
} from '@shared/lib/authIntent';

import { AddArtistToArchiveModalView } from './AddArtistToArchiveModalView';
import { ArchiveAccessModalView } from './ArchiveAccessModalView';

export type OpenArchiveAccessModalOptions = PremiumCheckoutIntentContext;

export type RequestPremiumContentAccessOptions = PremiumCheckoutIntentContext & {
  onAccessGranted?: () => void | Promise<void>;
};

export type PendingPremiumContentAccess = {
  artistUserId: string;
  artistSlug?: string;
  onAccessGranted?: () => void | Promise<void>;
};

export type CloseArchiveAccessModalOptions = {
  /** Keep pending premium checkout intent (e.g. redirecting to auth or YooKassa). */
  preserveCheckoutIntent?: boolean;
};

export type ArchiveAccessModalContextValue = {
  /** Always opens the Premium paywall (e.g. header CTA, archive button without premium). */
  open: (options?: OpenArchiveAccessModalOptions) => void;
  /** Close all paywall modals (Premium, add-to-archive, archive-full alert). */
  close: (options?: CloseArchiveAccessModalOptions) => void;
  /** @deprecated Use resume via PremiumCheckoutIntentResumeController → requestAccess. */
  openFromIntentResume: (options?: OpenArchiveAccessModalOptions) => void;
  /** Route hidden-content clicks through premium / add-to-archive / allow access. */
  requestAccess: (options: RequestPremiumContentAccessOptions) => Promise<void>;
};

const ArchiveAccessModalContext = createContext<ArchiveAccessModalContextValue | null>(null);

function isGuestSession(): boolean {
  return !getToken();
}

function ArchiveFullAlert({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const navigate = useNavigate();

  const archiveFullTitle =
    ui?.titles?.artistArchiveFullTitle ??
    (lang === 'en' ? 'Collection full' : 'Коллекция заполнена');
  const archiveFullMessage =
    ui?.titles?.artistArchiveFullMessage ??
    (lang === 'en'
      ? 'You have used all collection slots. Remove an artist when their lock expires to add another.'
      : 'Все слоты коллекции заняты. Удалите артиста после окончания блокировки, чтобы добавить другого.');
  const manageArchiveLabel =
    ui?.buttons?.premiumSuccessGoToArchive ??
    (lang === 'en' ? 'Open Collection' : 'Открыть коллекцию');

  return (
    <AlertModal
      isOpen={isOpen}
      title={archiveFullTitle}
      message={archiveFullMessage}
      buttonText={manageArchiveLabel}
      variant="warning"
      onClose={() => {
        onClose();
        navigate('/dashboard-new/archive');
      }}
    />
  );
}

export function ArchiveAccessModalProvider({ children }: { children: ReactNode }) {
  const premiumDialogRef = useRef<HTMLDialogElement>(null);
  const addArtistDialogRef = useRef<HTMLDialogElement>(null);
  const viewer = useAuthSessionUser();
  const [pendingAccess, setPendingAccess] = useState<PendingPremiumContentAccess | null>(null);
  const [archiveFullOpen, setArchiveFullOpen] = useState(false);

  const close = useCallback((options?: CloseArchiveAccessModalOptions) => {
    if (!options?.preserveCheckoutIntent) {
      clearPremiumCheckoutAuthIntent();
    }
    premiumDialogRef.current?.close();
    setPendingAccess(null);
    addArtistDialogRef.current?.close();
    setArchiveFullOpen(false);
  }, []);

  const closeAddArtist = useCallback(() => {
    setPendingAccess(null);
    addArtistDialogRef.current?.close();
  }, []);

  useEffect(() => {
    const onActivated = () => {
      clearPremiumCheckoutAuthIntent();
      close({ preserveCheckoutIntent: true });
    };
    window.addEventListener('subscription:activated', onActivated);
    return () => window.removeEventListener('subscription:activated', onActivated);
  }, [close]);

  const showPremiumModal = useCallback(() => {
    premiumDialogRef.current?.showModal();
  }, []);

  const showAddArtistModal = useCallback((ctx: PendingPremiumContentAccess) => {
    setPendingAccess(ctx);
    requestAnimationFrame(() => {
      addArtistDialogRef.current?.showModal();
    });
  }, []);

  const open = useCallback(
    (options?: OpenArchiveAccessModalOptions) => {
      if (isGuestSession() && !viewer?.id) {
        beginPremiumCheckoutAuthIntent(options);
      }
      showPremiumModal();
    },
    [showPremiumModal, viewer?.id]
  );

  const requestAccess = useCallback(
    async (options: RequestPremiumContentAccessOptions) => {
      const artistUserId = options.artistUserId?.trim();
      const artistSlug = options.artistSlug?.trim() || undefined;
      const onAccessGranted = options.onAccessGranted;

      if (isGuestSession() && !viewer?.id) {
        beginPremiumCheckoutAuthIntent({ artistUserId, artistSlug });
        showPremiumModal();
        return;
      }

      if (!artistUserId) {
        open({ artistUserId, artistSlug });
        return;
      }

      try {
        const status = await getArchiveStatus(artistUserId);

        if (status?.artistInArchive) {
          if (status.isPremium) {
            await onAccessGranted?.();
          } else {
            open({ artistUserId, artistSlug });
          }
          return;
        }

        if (!status?.isPremium) {
          open({ artistUserId, artistSlug });
          return;
        }

        if (status.slotsUsed >= status.slotsLimit) {
          setArchiveFullOpen(true);
          return;
        }

        showAddArtistModal({ artistUserId, artistSlug, onAccessGranted });
      } catch {
        open({ artistUserId, artistSlug });
      }
    },
    [open, showAddArtistModal, showPremiumModal, viewer?.id]
  );

  const openFromIntentResume = useCallback(
    (options?: OpenArchiveAccessModalOptions) => {
      void requestAccess({
        artistUserId: options?.artistUserId?.trim() || undefined,
        artistSlug: options?.artistSlug?.trim() || undefined,
      });
    },
    [requestAccess]
  );

  const value = useMemo(
    () => ({ open, close, openFromIntentResume, requestAccess }),
    [open, close, openFromIntentResume, requestAccess]
  );

  return (
    <ArchiveAccessModalContext.Provider value={value}>
      {children}
      <ArchiveAccessModalView dialogRef={premiumDialogRef} onClose={close} />
      <AddArtistToArchiveModalView
        dialogRef={addArtistDialogRef}
        pendingAccess={pendingAccess}
        onClose={closeAddArtist}
      />
      <ArchiveFullAlert isOpen={archiveFullOpen} onClose={() => setArchiveFullOpen(false)} />
    </ArchiveAccessModalContext.Provider>
  );
}

export function useArchiveAccessModal(): ArchiveAccessModalContextValue {
  const ctx = useContext(ArchiveAccessModalContext);
  if (!ctx) {
    return {
      open: () => {},
      close: () => {},
      openFromIntentResume: () => {},
      requestAccess: async () => {},
    };
  }
  return ctx;
}
