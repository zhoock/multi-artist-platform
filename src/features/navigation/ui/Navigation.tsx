// src/components/Navigation/Navigation.tsx
import { memo } from 'react';
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { NavigationProps } from '@models';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { selectPublicArtistSlug } from '@shared/model/currentArtist';
import { buildLocalizedPublicPathWithArtist } from '@shared/lib/seo/publicPagePaths';
import { useEffectiveSearchParams } from '@shared/lib/hooks/useEffectiveLocation';
import './style.scss';

const NavigationComponent = ({ onToggle }: NavigationProps) => {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const [searchParams] = useEffectiveSearchParams();
  const publicArtistSlugFromStore = useAppSelector(selectPublicArtistSlug);
  const publicArtistSlug =
    searchParams.get('artist')?.trim() || publicArtistSlugFromStore?.trim() || null;

  // UI словарь загружается через loader

  const fallbackLabels = {
    stems: lang === 'en' ? 'mixer' : 'миксер',
  };

  const menu = ui?.menu ?? {};
  const labels = {
    stems: menu.stems ?? fallbackLabels.stems,
  };

  return (
    <nav className="header__menu">
      <ul className="header__links-list">
        {[
          {
            to: buildLocalizedPublicPathWithArtist(lang, '/stems', publicArtistSlug),
            label: labels.stems,
          },
        ].map(({ to, label }) => (
          <li key="stems">
            <NavLink
              to={to}
              title={label ?? undefined}
              onClick={onToggle}
              className={({ isActive, isPending }) =>
                clsx('header__link', { active: isActive, pending: isPending })
              }
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export const Navigation = memo(NavigationComponent);
