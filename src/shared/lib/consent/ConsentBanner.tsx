import { ChartColumn as ChartColumnIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useLang } from '@app/providers/lang';
import { buildLocalizedPublicPath } from '@shared/lib/i18n/routeLang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { DashboardButton } from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

import { useConsent } from './ConsentProvider';
import { UNIVERSE_SCENE_OVERLAY_ATTR } from '@shared/lib/universeSceneOverlay';
import './style.scss';

export function ConsentBanner() {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const { accept, decline } = useConsent();

  const copy = ui?.consent;
  const privacyPath = buildLocalizedPublicPath(lang, '/privacy');
  const privacyLabel = copy?.privacyLink ?? ui?.links?.privacyPageTitle ?? 'Privacy Policy';
  const title = copy?.bannerTitle ?? 'Analytics cookies';
  const description =
    copy?.bannerDescription ?? 'We use analytics services to understand how the site is used.';

  return (
    <section
      className="consent-banner"
      {...{ [UNIVERSE_SCENE_OVERLAY_ATTR]: '' }}
      role="dialog"
      aria-live="polite"
      aria-label={copy?.bannerAriaLabel ?? 'Cookie consent'}
    >
      <div className="consent-banner__card">
        <div className="consent-banner__main">
          <span className="consent-banner__icon" aria-hidden="true">
            <ChartColumnIcon {...dashboardActionIconProps({ size: 32, strokeWidth: 1.75 })} />
          </span>

          <div className="consent-banner__copy">
            <h2 className="consent-banner__title">{title}</h2>
            <p className="consent-banner__description">{description}</p>
            <Link className="consent-banner__link" to={privacyPath}>
              {privacyLabel}
            </Link>
          </div>
        </div>

        <div className="consent-banner__actions">
          <DashboardButton variant="primary" onClick={accept}>
            {copy?.accept ?? 'Accept'}
          </DashboardButton>
          <DashboardButton variant="outline" onClick={decline}>
            {copy?.decline ?? 'Decline'}
          </DashboardButton>
        </div>
      </div>
    </section>
  );
}
