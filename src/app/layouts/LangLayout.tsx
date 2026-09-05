import { Suspense, lazy, useLayoutEffect } from 'react';
import { Outlet, useParams } from 'react-router-dom';

import { useLang } from '@app/providers/lang';
import { isRouteLang } from '@shared/lib/i18n/routeLang';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { langActions } from '@shared/model/lang/langSlice';

const NotFoundPage = lazy(() =>
  import('@widgets/notFound').then((m) => ({ default: m.NotFoundPage }))
);

/**
 * Validates `/:lang` and syncs URL locale → Redux (single source of truth on prefixed routes).
 * Renders nested public routes via `<Outlet />`.
 */
export function LangLayout() {
  const { lang: langParam } = useParams<{ lang: string }>();
  const dispatch = useAppDispatch();
  const { lang: currentLang } = useLang();
  const isValidLang = langParam !== undefined && isRouteLang(langParam);

  // Sync URL → Redux on navigation only. Do not depend on `currentLang`: otherwise
  // locale changes from dashboard settings (or other UI) are immediately reverted
  // while a prefixed route stays mounted under a dashboard modal.
  useLayoutEffect(() => {
    if (!isValidLang || !langParam || langParam === currentLang) {
      return;
    }
    dispatch(langActions.setLang(langParam));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- URL is the trigger, not Redux
  }, [dispatch, isValidLang, langParam]);

  if (!isValidLang) {
    return (
      <Suspense fallback={null}>
        <NotFoundPage />
      </Suspense>
    );
  }

  return <Outlet />;
}
