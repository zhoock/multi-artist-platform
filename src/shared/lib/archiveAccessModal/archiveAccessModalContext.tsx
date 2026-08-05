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

import { getArchiveStatus } from '@shared/api/archive';
import { getToken } from '@shared/lib/auth';
import { promoteToastLayers } from '@shared/lib/toast/useToastLayerDialog';
import { useAuthSessionUser } from '@shared/lib/hooks/useAuthSessionUser';
import { CollectionFullModal } from '@features/artistArchive/ui/CollectionFullModal';
import { useArtistPageBuilderNav } from '@shared/ui/artistPageBuilder/useArtistPageBuilderNav';
import {
  beginPremiumCheckoutAuthIntent,
  clearPremiumCheckoutAuthIntent,
  type PremiumCheckoutIntentContext,
} from '@shared/lib/authIntent';

import { AddArtistToArchiveModalView } from './AddArtistToArchiveModalView';
import { ArchiveAccessModalView } from './ArchiveAccessModalView';
import {
  useSubscriptionCheckout,
  type SubscriptionCheckoutResult,
} from './useSubscriptionCheckout';
import type { SubscriptionPlanSlug } from '@shared/lib/payment/subscriptionPlans';

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
  /** Start YooKassa checkout for a known plan without opening the plan picker. */
  startCheckout: (
    planSlug: SubscriptionPlanSlug,
    options?: import('./useSubscriptionCheckout').SubscriptionCheckoutOptions
  ) => Promise<SubscriptionCheckoutResult>;
};

const ArchiveAccessModalContext = createContext<ArchiveAccessModalContextValue | null>(null);

function isGuestSession(): boolean {
  return !getToken();
}

function ArchiveFullAlert({
  isOpen,
  onClose,
  onUpgradePlan,
  onManageCollection,
}: {
  isOpen: boolean;
  onClose: () => void;
  onUpgradePlan: () => void;
  onManageCollection: () => void;
}) {
  return (
    <CollectionFullModal
      isOpen={isOpen}
      onClose={onClose}
      onUpgradePlan={onUpgradePlan}
      onManageCollection={onManageCollection}
    />
  );
}

export function ArchiveAccessModalProvider({ children }: { children: ReactNode }) {
  const premiumDialogRef = useRef<HTMLDialogElement>(null);
  const addArtistDialogRef = useRef<HTMLDialogElement>(null);
  const viewer = useAuthSessionUser();
  const { openDashboard } = useArtistPageBuilderNav();
  const [pendingAccess, setPendingAccess] = useState<PendingPremiumContentAccess | null>(null);
  const [archiveFullOpen, setArchiveFullOpen] = useState(false);
  const [archiveFullContext, setArchiveFullContext] = useState<PremiumCheckoutIntentContext | null>(
    null
  );

  const close = useCallback((options?: CloseArchiveAccessModalOptions) => {
    if (!options?.preserveCheckoutIntent) {
      clearPremiumCheckoutAuthIntent();
    }
    premiumDialogRef.current?.close();
    setPendingAccess(null);
    addArtistDialogRef.current?.close();
    setArchiveFullOpen(false);
    setArchiveFullContext(null);
  }, []);

  const closeAddArtist = useCallback(() => {
    setPendingAccess(null);
    addArtistDialogRef.current?.close();
  }, []);

  const { startCheckout } = useSubscriptionCheckout({ onClose: close });

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
    promoteToastLayers();
  }, []);

  const showAddArtistModal = useCallback((ctx: PendingPremiumContentAccess) => {
    setPendingAccess(ctx);
    requestAnimationFrame(() => {
      addArtistDialogRef.current?.showModal();
      promoteToastLayers();
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
          setArchiveFullContext({ artistUserId, artistSlug });
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
    () => ({ open, close, openFromIntentResume, requestAccess, startCheckout }),
    [open, close, openFromIntentResume, requestAccess, startCheckout]
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
      <ArchiveFullAlert
        isOpen={archiveFullOpen}
        onClose={() => {
          setArchiveFullOpen(false);
          setArchiveFullContext(null);
        }}
        onUpgradePlan={() => {
          open({
            artistUserId: archiveFullContext?.artistUserId,
            artistSlug: archiveFullContext?.artistSlug,
          });
        }}
        onManageCollection={() => openDashboard('collection')}
      />
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
      startCheckout: async () => ({ ok: false, error: 'Unavailable' }),
    };
  }
  return ctx;
}
