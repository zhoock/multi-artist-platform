import { useMemo } from 'react';
import {
  ArrowRight as ArrowRightIcon,
  Bookmark as BookmarkIcon,
  CloudUpload as CloudUploadIcon,
  FileText as FileTextIcon,
  Headphones as HeadphonesIcon,
  Library as LibraryIcon,
  MicVocal as MicVocalIcon,
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
          listenerDescription:
            'Discover music from independent artists, find new bands, build your own collection, and get access to exclusive content from your favorite artists.',
          listenerFeatureBuy: 'Discover new artists.',
          listenerFeatureCollection:
            'Build a collection of artists and get access to their exclusive content.',
          listenerFeatureSave: 'Buy and save albums.',
          listenerFeatureMix: 'Mix individual tracks and experiment with how tracks sound.',
          listenerCta: 'Continue as listener',
          artistTitle: 'Artist',
          artistDescription:
            "Create your own space for music and everything related to your creativity. Publish and sell albums, tell your band's story, share additional materials, and discover music from other artists.",
          artistFeaturePublish: 'Publish albums and articles, set prices, and sell your music.',
          artistFeatureMaterials:
            'Add song lyrics and additional materials, and publish individual tracks for listeners to mix.',
          artistFeatureDiscover: 'Discover new artists.',
          artistFeatureCollection:
            'Build a collection of artists and get access to their exclusive content.',
          artistFeatureSave: 'Buy and save albums.',
          artistFeatureMix: 'Mix individual tracks and experiment with how tracks sound.',
          artistCta: 'Continue as artist',
          roleChangeHint: 'You can change your role later in profile settings.',
          hasAccount: 'Already have an account?',
          signIn: 'Sign in',
        }
      : {
          welcomeTitle: 'Добро пожаловать',
          welcomeSubtitle: 'Выберите, как вы хотите использовать платформу',
          listenerTitle: 'Слушатель',
          listenerDescription:
            'Открывайте музыку независимых артистов, находите новые группы, собирайте собственную коллекцию и получайте доступ к эксклюзивному контенту любимых исполнителей.',
          listenerFeatureBuy: 'Открывайте новых исполнителей.',
          listenerFeatureCollection:
            'Собирайте коллекцию артистов и получайте доступ к их закрытому контенту.',
          listenerFeatureSave: 'Покупайте и сохраняйте альбомы.',
          listenerFeatureMix:
            'Микшируйте отдельные дорожки и экспериментируйте со звучанием композиций.',
          listenerCta: 'Продолжить как слушатель',
          artistTitle: 'Артист',
          artistDescription:
            'Создайте собственное пространство для музыки и всего, что связано с вашим творчеством. Публикуйте и продавайте альбомы, рассказывайте о своей группе, делитесь дополнительными материалами и открывайте для себя музыку других артистов.',
          artistFeaturePublish:
            'Публикуйте альбомы и статьи, устанавливайте цены и продавайте свою музыку.',
          artistFeatureMaterials:
            'Добавляйте тексты песен и дополнительные материалы, публикуйте отдельные дорожки для микширования слушателями.',
          artistFeatureDiscover: 'Открывайте новых исполнителей.',
          artistFeatureCollection:
            'Собирайте коллекцию артистов и получайте доступ к их закрытому контенту.',
          artistFeatureSave: 'Покупайте и сохраняйте альбомы.',
          artistFeatureMix:
            'Микшируйте отдельные дорожки и экспериментируйте со звучанием композиций.',
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
          <ul className="role-selection__features">
            <li className="role-selection__feature">
              <span className="role-selection__feature-icon" aria-hidden>
                <RoleFeatureIcon icon={MusicIcon} />
              </span>
              {copy.listenerFeatureBuy}
            </li>
            <li className="role-selection__feature">
              <span className="role-selection__feature-icon" aria-hidden>
                <RoleFeatureIcon icon={LibraryIcon} />
              </span>
              {copy.listenerFeatureCollection}
            </li>
            <li className="role-selection__feature">
              <span className="role-selection__feature-icon" aria-hidden>
                <RoleFeatureIcon icon={BookmarkIcon} />
              </span>
              {copy.listenerFeatureSave}
            </li>
            <li className="role-selection__feature">
              <span className="role-selection__feature-icon" aria-hidden>
                <RoleFeatureIcon icon={SlidersHorizontalIcon} />
              </span>
              {copy.listenerFeatureMix}
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
          <RoleHeroIcon icon={MicVocalIcon} className="role-selection__icon" />
          <h3 className="role-selection__card-title">{copy.artistTitle}</h3>
          <ul className="role-selection__features">
            <li className="role-selection__feature">
              <span className="role-selection__feature-icon" aria-hidden>
                <RoleFeatureIcon icon={CloudUploadIcon} />
              </span>
              {copy.artistFeaturePublish}
            </li>
            <li className="role-selection__feature">
              <span className="role-selection__feature-icon" aria-hidden>
                <RoleFeatureIcon icon={FileTextIcon} />
              </span>
              {copy.artistFeatureMaterials}
            </li>
            <li className="role-selection__feature">
              <span className="role-selection__feature-icon" aria-hidden>
                <RoleFeatureIcon icon={MusicIcon} />
              </span>
              {copy.artistFeatureDiscover}
            </li>
            <li className="role-selection__feature">
              <span className="role-selection__feature-icon" aria-hidden>
                <RoleFeatureIcon icon={LibraryIcon} />
              </span>
              {copy.artistFeatureCollection}
            </li>
            <li className="role-selection__feature">
              <span className="role-selection__feature-icon" aria-hidden>
                <RoleFeatureIcon icon={BookmarkIcon} />
              </span>
              {copy.artistFeatureSave}
            </li>
            <li className="role-selection__feature">
              <span className="role-selection__feature-icon" aria-hidden>
                <RoleFeatureIcon icon={SlidersHorizontalIcon} />
              </span>
              {copy.artistFeatureMix}
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
