import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { selectPublicArtistSlug } from '@shared/model/currentArtist';
import { loadSocialLinksFromDatabase } from '@entities/user/lib';
import { socialLinksToList } from '@shared/constants/socialLinks';
import { buildSupportMailtoHref } from '@shared/lib/supportEmail';
import './style.scss';

const supportLink = (label: string) => <a href={buildSupportMailtoHref()}>{label}</a>;

function FooterComponent() {
  const { lang } = useLang();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const artistSlugFromStore = useAppSelector(selectPublicArtistSlug);
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));

  const isDashboardRoute = location.pathname.startsWith('/dashboard');
  const artistSlug = useMemo(() => {
    if (isDashboardRoute) return null;
    return searchParams.get('artist')?.trim() || artistSlugFromStore || null;
  }, [isDashboardRoute, searchParams, artistSlugFromStore]);

  const [socialItems, setSocialItems] = useState<Array<{ platform: string; href: string }>>([]);

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
        {socialItems.length > 0 ? (
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
        ) : null}

        <ul className="copyright-list">
          <li className="copyright-list__item">
            <small>
              <span>© 2021—2025 Смоляное чучелко</span>
            </small>
          </li>
          <li>
            <small>{supportLink(ui?.titles?.support ?? 'Поддержка')}</small>
          </li>
          <li>
            <small>
              <Link to="/offer">{ui?.links?.publicOffer ?? 'Публичная оферта'}</Link>
            </small>
          </li>
        </ul>
      </div>
    </footer>
  );
}

export const Footer = memo(FooterComponent);
export default Footer;
