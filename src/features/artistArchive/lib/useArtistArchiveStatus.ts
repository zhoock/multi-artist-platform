import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  activateArchiveArtistsApi,
  addArtistToArchiveApi,
  ArchiveApiError,
  getArchiveStatus,
  type ArchiveStatus,
} from '@shared/api/archive';
import { getToken } from '@shared/lib/auth';
import { useAuthSessionUser } from '@shared/lib/hooks/useAuthSessionUser';

import {
  resolveCollectionButtonState,
  type ArtistArchiveButtonState,
} from './resolveCollectionButtonState';

export type { ArtistArchiveButtonState };

export function useArtistArchiveStatus(artistUserId: string | null | undefined) {
  const viewer = useAuthSessionUser();
  const [status, setStatus] = useState<ArchiveStatus | null>(null);
  const [loading, setLoading] = useState(() => Boolean(getToken() && artistUserId));
  const [adding, setAdding] = useState(false);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipNextRefetchRef = useRef(false);

  const isOwner = Boolean(viewer?.id && artistUserId && viewer.id === artistUserId);

  const refetch = useCallback(async () => {
    if (!artistUserId || isOwner) {
      setStatus(null);
      setLoading(false);
      return null;
    }

    if (!getToken()) {
      setStatus(null);
      setLoading(false);
      return null;
    }

    setLoading(true);
    setError(null);
    try {
      const next = await getArchiveStatus(artistUserId);
      setStatus(next);
      return next;
    } catch (err) {
      if (err instanceof ArchiveApiError && err.code === 'UNAUTHORIZED') {
        setStatus(null);
        return null;
      }
      console.warn('[useArtistArchiveStatus] failed to load status', err);
      setError(err instanceof Error ? err.message : 'Failed to load collection status');
      return null;
    } finally {
      setLoading(false);
    }
  }, [artistUserId, isOwner]);

  useEffect(() => {
    if (!viewer && !getToken()) {
      setStatus(null);
      return;
    }
    void refetch();

    const onArchiveChanged = () => {
      if (skipNextRefetchRef.current) {
        skipNextRefetchRef.current = false;
        return;
      }
      void refetch();
    };
    window.addEventListener('archive:changed', onArchiveChanged);
    window.addEventListener('archive:artist-added', onArchiveChanged);
    window.addEventListener('archive:artist-removed', onArchiveChanged);
    window.addEventListener('subscription:activated', onArchiveChanged);
    return () => {
      window.removeEventListener('archive:changed', onArchiveChanged);
      window.removeEventListener('archive:artist-added', onArchiveChanged);
      window.removeEventListener('archive:artist-removed', onArchiveChanged);
      window.removeEventListener('subscription:activated', onArchiveChanged);
    };
  }, [refetch, viewer?.id]);

  const buttonState: ArtistArchiveButtonState = useMemo(
    () =>
      resolveCollectionButtonState({
        artistUserId,
        isOwner,
        status,
        loading,
        adding,
        activating,
        hasToken: Boolean(getToken()),
      }),
    [activating, adding, artistUserId, isOwner, loading, status]
  );

  const slotsRemaining = useMemo(() => {
    if (!status) return 0;
    return Math.max(0, status.slotsLimit - status.slotsUsed);
  }, [status]);

  const addToArchive = useCallback(async (): Promise<ArchiveStatus | null> => {
    if (!artistUserId || adding) return null;

    setAdding(true);
    setError(null);

    const previous = status;
    if (status) {
      setStatus({
        ...status,
        artistInArchive: true,
        slotsUsed: status.slotsUsed + (status.artistInArchive ? 0 : 1),
      });
    }

    try {
      const { status: next } = await addArtistToArchiveApi(artistUserId);
      setStatus(next);
      skipNextRefetchRef.current = true;
      return next;
    } catch (err) {
      setStatus(previous);
      const message =
        err instanceof ArchiveApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to add to collection';
      setError(message);
      throw err;
    } finally {
      setAdding(false);
    }
  }, [adding, artistUserId, status]);

  const activateInArchive = useCallback(async (): Promise<ArchiveStatus | null> => {
    if (!artistUserId || activating) return null;

    setActivating(true);
    setError(null);

    const previous = status;
    if (status) {
      setStatus({
        ...status,
        artistActiveInArchive: true,
      });
    }

    try {
      await activateArchiveArtistsApi([artistUserId]);
      const next = await getArchiveStatus(artistUserId);
      setStatus(next);
      skipNextRefetchRef.current = true;
      window.dispatchEvent(new Event('archive:changed'));
      return next;
    } catch (err) {
      setStatus(previous);
      const message =
        err instanceof ArchiveApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to activate artist';
      setError(message);
      throw err;
    } finally {
      setActivating(false);
    }
  }, [activating, artistUserId, status]);

  return {
    status,
    loading,
    adding,
    activating,
    error,
    buttonState,
    slotsRemaining,
    isOwner,
    artistInArchive: Boolean(status?.artistInArchive),
    artistActiveInArchive: Boolean(status?.artistActiveInArchive),
    refetch,
    addToArchive,
    activateInArchive,
    clearError: () => setError(null),
  };
}
