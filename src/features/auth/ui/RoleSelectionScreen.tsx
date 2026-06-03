import { useMemo } from 'react';
import {
  ArrowRight as ArrowRightIcon,
  Bookmark as BookmarkIcon,
  CloudUpload as CloudUploadIcon,
  Disc as DiscIcon,
  Headphones as HeadphonesIcon,
  Music as MusicIcon,
  SlidersHorizontal as SlidersHorizontalIcon,
  type LucideIcon,
} from 'lucide-react';

import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import type { AccountType } from '@shared/lib/accountType';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

import './RoleSelectionScreen.scss';

interface RoleSelectionScreenProps {
  onSelect: (accountType: AccountType) => void;
  onSwitchToLogin?: () => void;
}

const roleHeroIconProps = (className: string) =>
  dashboardActionIconProps({ size: 40, strokeWidth: 1.75, className });

const roleFeatureIconProps = dashboardActionIconProps({
  size: 18,
  className: 'role-selection__feature-icon-svg',
});

const roleCtaIconProps = dashboardActionIconProps({
  size: 18,
  className: 'role-selection__cta-icon',
});

function RoleHeroIcon({ icon: Icon, className }: { icon: LucideIcon; className: string }) {
  return <Icon {...roleHeroIconProps(className)} />;
}

function RoleFeatureIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon {...roleFeatureIconProps} />;
}

function stripTrailingArrow(label: string): string {
  return label.replace(/\s*→\s*$/, '').trim();
}

export function RoleSelectionScreen({ onSelect, onSwitchToLogin }: RoleSelectionScreenProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));

  const copy = useMemo(() => {
    const reg = ui?.auth?.register;
    const en = lang !== 'ru';
    const fallback = en
      ? {
          welcomeTitle: 'Welcome',
          welcomeSubtitle: 'Choose how you want to use the platform',
          listenerTitle: 'Listener',
          listenerDescription: 'Buy music, save albums, and get access to releases.',
          listenerFeatureBuy: 'Buy music',
          listenerFeatureSave: 'Save albums',
          listenerCta: 'Continue as listener',
          artistTitle: 'Artist',
          artistDescription: 'Upload releases and create interactive albums.',
          artistFeatureUpload: 'Publish releases',
          artistFeatureAlbums: 'Create interactive albums',
          artistCta: 'Continue as artist',
          roleChangeHint: 'You can change your role later in profile settings.',
          hasAccount: 'Already have an account?',
          signIn: 'Sign in',
        }
      : {
          welcomeTitle: 'Добро пожаловать',
          welcomeSubtitle: 'Выберите, как вы хотите использовать платформу',
          listenerTitle: 'Слушатель',
          listenerDescription: 'Покупайте музыку, сохраняйте альбомы и получайте доступ к релизам.',
          listenerFeatureBuy: 'Покупайте музыку',
          listenerFeatureSave: 'Сохраняйте альбомы',
          listenerCta: 'Продолжить как слушатель',
          artistTitle: 'Артист',
          artistDescription: 'Загружайте релизы и создавайте интерактивные альбомы.',
          artistFeatureUpload: 'Публикуйте релизы',
          artistFeatureAlbums: 'Создавайте интерактивные альбомы',
          artistCta: 'Продолжить как артист',
          roleChangeHint: 'Вы всегда сможете изменить роль в настройках профиля.',
          hasAccount: 'Уже есть аккаунт?',
          signIn: 'Войти',
        };
    return { ...fallback, ...reg };
  }, [lang, ui?.auth?.register]);

  return (
    <div className="role-selection">
      <div className="role-selection__intro">
        <h2 className="role-selection__title">{copy.welcomeTitle}</h2>
        <p className="role-selection__subtitle">{copy.welcomeSubtitle}</p>
      </div>

      <div className="role-selection__cards">
        <article className="role-selection__card role-selection__card--listener">
          <RoleHeroIcon icon={HeadphonesIcon} className="role-selection__icon" />
          <h3 className="role-selection__card-title">{copy.listenerTitle}</h3>
          <p className="role-selection__card-text">{copy.listenerDescription}</p>
          <div className="role-selection__card-divider" aria-hidden />
          <ul className="role-selection__features">
            <li className="role-selection__feature">
              <span className="role-selection__feature-icon" aria-hidden>
                <RoleFeatureIcon icon={MusicIcon} />
              </span>
              {copy.listenerFeatureBuy}
            </li>
            <li className="role-selection__feature">
              <span className="role-selection__feature-icon" aria-hidden>
                <RoleFeatureIcon icon={BookmarkIcon} />
              </span>
              {copy.listenerFeatureSave}
            </li>
          </ul>
          <button
            type="button"
            className="role-selection__cta"
            onClick={() => onSelect('listener')}
          >
            <span>{stripTrailingArrow(copy.listenerCta)}</span>
            <ArrowRightIcon {...roleCtaIconProps} />
          </button>
        </article>

        <article className="role-selection__card role-selection__card--artist">
          <RoleHeroIcon icon={SlidersHorizontalIcon} className="role-selection__icon" />
          <h3 className="role-selection__card-title">{copy.artistTitle}</h3>
          <p className="role-selection__card-text">{copy.artistDescription}</p>
          <div className="role-selection__card-divider" aria-hidden />
          <ul className="role-selection__features">
            <li className="role-selection__feature">
              <span className="role-selection__feature-icon" aria-hidden>
                <RoleFeatureIcon icon={CloudUploadIcon} />
              </span>
              {copy.artistFeatureUpload}
            </li>
            <li className="role-selection__feature">
              <span className="role-selection__feature-icon" aria-hidden>
                <RoleFeatureIcon icon={DiscIcon} />
              </span>
              {copy.artistFeatureAlbums}
            </li>
          </ul>
          <button type="button" className="role-selection__cta" onClick={() => onSelect('artist')}>
            <span>{stripTrailingArrow(copy.artistCta)}</span>
            <ArrowRightIcon {...roleCtaIconProps} />
          </button>
        </article>
      </div>

      <p className="role-selection__footer">{copy.roleChangeHint}</p>

      {onSwitchToLogin ? (
        <div className="role-selection__switch">
          {copy.hasAccount}{' '}
          <button type="button" className="role-selection__link" onClick={onSwitchToLogin}>
            {copy.signIn}
          </button>
        </div>
      ) : null}
    </div>
  );
}
