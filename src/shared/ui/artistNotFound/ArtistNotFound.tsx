import { Link } from 'react-router-dom';
import { useLang } from '@app/providers/lang';
import { buildLocalizedPublicPath } from '@shared/lib/i18n/routeLang/buildLocalizedPublicPath';
import './style.scss';

const COPY = {
  en: {
    title: 'Artist not found',
    subtitle: 'This page no longer exists',
    backToHome: 'Back to Home',
  },
  ru: {
    title: 'Артист не найден',
    subtitle: 'Эта страница больше не существует',
    backToHome: 'На главную',
  },
} as const;

export function ArtistNotFound() {
  const { lang } = useLang();
  const copy = COPY[lang === 'ru' ? 'ru' : 'en'];

  return (
    <section className="artist-not-found main-background" aria-labelledby="artist-not-found-title">
      <div className="artist-not-found__inner wrapper">
        <h1 id="artist-not-found-title" className="artist-not-found__title">
          {copy.title}
        </h1>
        <p className="artist-not-found__subtitle">{copy.subtitle}</p>
        <Link to={buildLocalizedPublicPath(lang, '/')} className="artist-not-found__cta" replace>
          {copy.backToHome}
        </Link>
      </div>
    </section>
  );
}
