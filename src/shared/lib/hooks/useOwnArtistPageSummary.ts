import { useEffect, useState } from 'react';

import { useLang } from '@app/providers/lang';
import { useAuthSessionUser } from '@shared/lib/hooks/useAuthSessionUser';
import { fetchOwnArtistPageState, type OwnArtistPageState } from '@shared/lib/ownArtistPage';

const EMPTY_STATE: OwnArtistPageState = {
  publicSlug: null,
  hasPublicReleases: false,
  hasPublicPageContent: false,
  needsOnboarding: false,
  albumsCount: 0,
  articlesCount: 0,
  profileIsEmpty: true,
};

export function useOwnArtistPageSummary(): OwnArtistPageState & { isLoading: boolean } {
  const { lang } = useLang();
  const userId = useAuthSessionUser()?.id ?? null;
  const [state, setState] = useState<OwnArtistPageState>(EMPTY_STATE);
  const [isLoading, setIsLoading] = useState(Boolean(userId));

  useEffect(() => {
    if (!userId) {
      setState(EMPTY_STATE);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void (async () => {
      const next = await fetchOwnArtistPageState(lang);
      if (!cancelled) {
        setState(next);
        setIsLoading(false);
      }
    })();

    const refresh = () => {
      void (async () => {
        const next = await fetchOwnArtistPageState(lang);
        if (!cancelled) setState(next);
      })();
    };

    window.addEventListener('profile-name-updated', refresh);
    window.addEventListener('artist:updated', refresh);

    return () => {
      cancelled = true;
      window.removeEventListener('profile-name-updated', refresh);
      window.removeEventListener('artist:updated', refresh);
    };
  }, [lang, userId]);

  return { ...state, isLoading };
}
