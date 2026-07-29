import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '@app/providers/lang';
import { ServicePageLayout } from '@shared/ui/serviceScreen';

function useNotFoundCopy() {
  const { lang } = useLang();

  return useMemo(
    () =>
      lang === 'ru'
        ? {
            pageTitle: '404 — Страница не найдена',
            subtitle: 'Страница не найдена',
            descriptionLine1: 'Похоже, вы заблудились в космосе.',
            descriptionLine2: 'Страница, которую вы ищете, не существует.',
            backToHome: 'На главную',
          }
        : {
            pageTitle: '404 — Page not found',
            subtitle: 'Page not found',
            descriptionLine1: 'Looks like you got lost in space.',
            descriptionLine2: "The page you're looking for doesn't exist.",
            backToHome: 'Back to Home',
          },
    [lang]
  );
}

export const NotFoundPage = () => {
  const navigate = useNavigate();
  const copy = useNotFoundCopy();

  return (
    <ServicePageLayout
      scene="404"
      titleId="not-found-title"
      pageTitle={copy.pageTitle}
      title="404"
      description={
        <>
          {copy.subtitle}
          <br />
          {copy.descriptionLine1}
          <br />
          {copy.descriptionLine2}
        </>
      }
      action={{
        label: copy.backToHome,
        onClick: () => navigate('/', { replace: true }),
      }}
    />
  );
};
