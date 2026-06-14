import { Sparkles as SparklesIcon } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import './ArtistAwaitingFirstReleaseBanner.scss';

type ArtistAwaitingFirstReleaseBannerProps = {
  isOwner: boolean;
};

export function ArtistAwaitingFirstReleaseBanner({
  isOwner,
}: ArtistAwaitingFirstReleaseBannerProps) {
  const { lang } = useLang();
  const location = useLocation();
  const navigate = useNavigate();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const copy = ui?.artistAwaitingFirstRelease;

  const openAlbumsDashboard = () => {
    navigate('/dashboard-new/albums', {
      state: { backgroundLocation: location },
    });
  };

  return (
    <section
      className="artist-awaiting-first-release-banner"
      aria-label={copy?.bannerStatus ?? 'Awaiting first release'}
    >
      <div className="artist-awaiting-first-release-banner__inner">
        <p className="artist-awaiting-first-release-banner__status">
          <SparklesIcon
            className="artist-awaiting-first-release-banner__icon"
            aria-hidden="true"
            size={16}
            strokeWidth={1.5}
          />
          <span>{copy?.bannerStatus ?? 'Your star has not yet joined the constellation.'}</span>
        </p>

        {isOwner ? (
          <button
            type="button"
            className="artist-awaiting-first-release-banner__cta"
            onClick={openAlbumsDashboard}
          >
            {copy?.bannerCta ?? 'Release your first album'}
          </button>
        ) : null}
      </div>
    </section>
  );
}

export default ArtistAwaitingFirstReleaseBanner;
