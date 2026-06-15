// src/components/NotFoundPage/404.tsx
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useLang } from '@app/providers/lang';
import './style.scss';

function useNotFoundCopy() {
  const { lang } = useLang();

  return useMemo(
    () =>
      lang === 'ru'
        ? {
            pageTitle: '404 — Страница не найдена',
            heading: 'Страница не найдена',
            descriptionLine1: 'Похоже, вы заблудились в космосе.',
            descriptionLine2: 'Страница, которую вы ищете, не существует.',
            backToHome: 'На главную',
          }
        : {
            pageTitle: '404 — Page not found',
            heading: 'Page not found',
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
    <section className="not-found" aria-labelledby="not-found-title">
      <div className="not-found__backdrop" aria-hidden="true" />
      <div className="not-found__content">
        <Helmet>
          <title>{copy.pageTitle}</title>
        </Helmet>

        <p className="not-found__code" aria-hidden="true">
          404
        </p>

        <h1 id="not-found-title" className="not-found__title">
          {copy.heading}
        </h1>

        <p className="not-found__description">
          {copy.descriptionLine1}
          <br />
          {copy.descriptionLine2}
        </p>

        <div className="not-found__divider" aria-hidden="true" />

        <button
          type="button"
          className="not-found__cta"
          onClick={() => navigate('/', { replace: true })}
        >
          {copy.backToHome}
        </button>
      </div>
    </section>
  );
};
