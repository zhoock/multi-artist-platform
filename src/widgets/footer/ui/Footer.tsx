import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { selectPublicArtistSlug } from '@shared/model/currentArtist';
import { loadSocialLinksFromDatabase } from '@entities/user/lib';
import { socialLinksToList } from '@shared/constants/socialLinks';
import { buildSupportMailtoHref } from '@shared/lib/supportEmail';
import { shouldShowArtistPageBuilderBlock } from '@shared/lib/artistPageBuilder';
import { useArtistPageBuilder } from '@shared/lib/hooks/useArtistPageBuilder';
import { useEffectiveSearchParams } from '@shared/lib/hooks/useEffectiveLocation';
import {
  ArtistPageBuilderBlock,
  artistPageBuilderBarIconProps,
  useArtistPageBuilderNav,
} from '@shared/ui/artistPageBuilder';
import { platformDisplayName } from '@shared/constants/platformBranding';
import { buildLocalizedPublicPath } from '@shared/lib/i18n/routeLang';
import { buildHelpHomePath } from '@shared/lib/seo/publicPagePaths';
import { Link2 as Link2Icon } from 'lucide-react';
import './style.scss';

const supportLink = (label: string) => <a href={buildSupportMailtoHref()}>{label}</a>;

function FooterComponent() {
  const { lang } = useLang();
  const [searchParams] = useEffectiveSearchParams();
  const artistSlugFromStore = useAppSelector(selectPublicArtistSlug);
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));

  const artistSlug = useMemo(() => {
    return searchParams.get('artist')?.trim() || artistSlugFromStore || null;
  }, [searchParams, artistSlugFromStore]);

  const [socialItems, setSocialItems] = useState<Array<{ platform: string; href: string }>>([]);
  const { builderVisibility, showArtistPageSkeleton } = useArtistPageBuilder(artistSlug ?? '');
  const { openDashboard } = useArtistPageBuilderNav();
  const showSocialBuilder =
    Boolean(artistSlug) &&
    shouldShowArtistPageBuilderBlock(builderVisibility, socialItems.length === 0);

  const loadLinks = useCallback(async () => {
    if (!artistSlug) {
      setSocialItems([]);
      return;
    }

    const links = await loadSocialLinksFromDatabase({ artistSlugOverride: artistSlug });
    setSocialItems(socialLinksToList(links));
  }, [artistSlug]);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  useEffect(() => {
    const handleArtistUpdated = () => {
      void loadLinks();
    };
    window.addEventListener('artist:updated', handleArtistUpdated);
    return () => window.removeEventListener('artist:updated', handleArtistUpdated);
  }, [loadLinks]);

  return (
    <footer role="contentinfo" className="footer extra-background">
      <div className="wrapper">
        {showArtistPageSkeleton ? null : socialItems.length > 0 ? (
          <ul className="social-networks-list">
            {socialItems.map((item) => (
              <li className="social-networks-list__item" key={item.platform}>
                <a
                  className={`social-networks__link icon-${item.platform}`}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="visually-hidden">{item.platform}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : showSocialBuilder ? (
          <div className="footer__social-builder">
            <ArtistPageBuilderBlock
              layout="bar"
              icon={<Link2Icon {...artistPageBuilderBarIconProps()} />}
              title={ui?.artistPageBuilder?.social?.title ?? 'Add social media'}
              actionLabel={ui?.artistPageBuilder?.social?.cta ?? 'Add social networks'}
              onAction={() => openDashboard('settings')}
            />
          </div>
        ) : null}

        <ul className="copyright-list">
          <li className="copyright-list__item">
            <small>
              <span>© 2026 {platformDisplayName(lang)}</span>
            </small>
          </li>
          <li>
            <small>{supportLink(ui?.titles?.support ?? 'Поддержка')}</small>
          </li>
          <li>
            <small>
              <Link to={buildHelpHomePath(lang)}>{ui?.links?.helpCenter ?? 'Help center'}</Link>
            </small>
          </li>
          <li>
            <small>
              <Link to={buildLocalizedPublicPath(lang, '/offer')}>
                {ui?.links?.publicOffer ?? 'Публичная оферта'}
              </Link>
            </small>
          </li>
        </ul>
      </div>
    </footer>
  );
}

export const Footer = memo(FooterComponent);
export default Footer;
