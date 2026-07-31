import { useLayoutEffect } from 'react';
import { Outlet, useParams } from 'react-router-dom';

import { useLang } from '@app/providers/lang';
import { isRouteLang } from '@shared/lib/i18n/routeLang';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { langActions } from '@shared/model/lang/langSlice';
import { NotFoundPage } from '@widgets/notFound';

/**
 * Validates `/:lang` and syncs URL locale → Redux (single source of truth on prefixed routes).
 * Renders nested public routes via `<Outlet />`.
 */
export function LangLayout() {
  const { lang: langParam } = useParams<{ lang: string }>();
  const dispatch = useAppDispatch();
  const { lang: currentLang } = useLang();
  const isValidLang = langParam !== undefined && isRouteLang(langParam);

  useLayoutEffect(() => {
    if (!isValidLang || !langParam || langParam === currentLang) {
      return;
    }
    dispatch(langActions.setLang(langParam));
  }, [currentLang, dispatch, isValidLang, langParam]);

  if (!isValidLang) {
    return <NotFoundPage />;
  }

  return <Outlet />;
}
