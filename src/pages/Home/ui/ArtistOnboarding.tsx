import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  FileText as FileTextIcon,
  SlidersHorizontal as SlidersHorizontalIcon,
  Upload as UploadIcon,
  User as UserIcon,
  type LucideIcon,
} from 'lucide-react';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useSiteArtistDisplayName } from '@shared/lib/hooks/useSiteArtistDisplayName';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import type { DashboardOpenIntent } from '@shared/lib/dashboardOpenIntent';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import './ArtistOnboarding.scss';

type SecondaryFeatureId = 'article' | 'mixer' | 'profile';

const FEATURE_ICONS: Record<SecondaryFeatureId, LucideIcon> = {
  profile: UserIcon,
  article: FileTextIcon,
  mixer: SlidersHorizontalIcon,
};

function FeatureIcon({ id }: { id: SecondaryFeatureId }) {
  const Icon = FEATURE_ICONS[id];
  return <Icon {...dashboardActionIconProps({ size: 18, strokeWidth: 1.5 })} />;
}

export function ArtistOnboarding() {
  const { lang } = useLang();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const artistSlug = searchParams.get('artist')?.trim() ?? '';
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const copy = ui?.artistOnboarding;
  const { displayLabel: artistName } = useSiteArtistDisplayName(lang, { artistSlug });

  const openDashboard = (
    tab: 'albums' | 'posts' | 'settings' | 'mixer',
    intent: Omit<DashboardOpenIntent, 'backgroundLocation'>
  ) => {
    navigate(`/dashboard-new/${tab}`, {
      state: {
        backgroundLocation: location,
        ...intent,
      },
    });
  };

  const greeting = (copy?.welcomeGreeting ?? 'Добро пожаловать, {name}').replace(
    '{name}',
    artistName || '…'
  );

  const preparationFeatures: Array<{
    id: SecondaryFeatureId;
    title: string;
    description: string;
    onClick: () => void;
  }> = [
    {
      id: 'profile',
      title: copy?.features?.profile?.title ?? 'Профиль',
      description:
        copy?.features?.profile?.description ??
        'Оформите страницу артиста: добавьте изображения, описание, выберите жанр и настройте адрес своей страницы.',
      onClick: () => openDashboard('settings', {}),
    },
    {
      id: 'article',
      title: copy?.features?.article?.title ?? 'Статьи',
      description:
        copy?.features?.article?.description ??
        'Расскажите свою историю. Пишите статьи и заметки для будущих слушателей.',
      onClick: () => openDashboard('posts', { openNewArticleModal: true }),
    },
    {
      id: 'mixer',
      title: copy?.features?.mixer?.title ?? 'Миксер стемов',
      description:
        copy?.features?.mixer?.description ??
        'Работайте со стемами своих альбомов. Загружайте стемы и делитесь ими с аудиторией.',
      onClick: () => openDashboard('mixer', {}),
    },
  ];

  return (
    <div className="artist-onboarding">
      <section className="artist-onboarding-hero" aria-labelledby="artist-onboarding-headline">
        <div className="artist-onboarding-hero__backdrop" aria-hidden="true" />
        <div className="artist-onboarding-hero__scrim" aria-hidden="true" />

        <div className="artist-onboarding-hero__frame wrapper">
          <div className="artist-onboarding-hero__content">
            <p className="artist-onboarding-hero__eyebrow">{greeting}</p>
            <h1 id="artist-onboarding-headline" className="artist-onboarding-hero__headline">
              {copy?.heroHeadline ?? 'Ваше творчество начинается'}{' '}
              <span className="artist-onboarding-hero__headline-accent">
                {copy?.heroHeadlineAccent ?? 'здесь'}
              </span>
            </h1>
            <p className="artist-onboarding-hero__subtext">
              {copy?.heroSubtext ?? 'Опубликуйте первый альбом, чтобы попасть\u00a0в\u00a0каталог.'}
            </p>
            <button
              type="button"
              className="artist-onboarding-hero__cta"
              onClick={() => openDashboard('albums', { openEditAlbumModal: true })}
            >
              <UploadIcon {...dashboardActionIconProps({ size: 20, strokeWidth: 1.75 })} />
              <span>{copy?.primaryCta ?? 'Загрузить альбом'}</span>
            </button>
          </div>
        </div>
      </section>

      <section
        className="artist-onboarding-secondary wrapper"
        aria-labelledby="artist-onboarding-secondary-heading"
      >
        <div className="artist-onboarding-secondary__intro">
          <h2
            id="artist-onboarding-secondary-heading"
            className="artist-onboarding-secondary__heading"
          >
            {copy?.secondaryHeading ?? 'После публикации первого альбома вам станет доступно:'}
          </h2>
          <p className="artist-onboarding-secondary__subtext">
            {copy?.secondarySubtext ??
              'Профиль, статьи и миксер стемов будут доступны слушателям только после\u00a0публикации\u00a0вашего\u00a0первого\u00a0альбома.'}
          </p>
        </div>
        <ul className="artist-onboarding-secondary__list">
          {preparationFeatures.map((feature) => (
            <li key={feature.id}>
              <button type="button" className="artist-onboarding-feature" onClick={feature.onClick}>
                <span className="artist-onboarding-feature__icon">
                  <FeatureIcon id={feature.id} />
                </span>
                <span className="artist-onboarding-feature__title">{feature.title}</span>
                <span className="artist-onboarding-feature__description">
                  {feature.description}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default ArtistOnboarding;
