import { Hammer as HammerIcon } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLang } from '@app/providers/lang';
import { getDefaultDashboardTab } from '@shared/lib/accountType';
import { useAuthSessionUser } from '@shared/lib/hooks/useAuthSessionUser';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import './ArtistPageUnderConstruction.scss';

export function ArtistPageUnderConstruction() {
  const { lang } = useLang();
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthSessionUser();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const copy = ui?.artistPageUnderConstruction;

  const openDashboard = () => {
    const tab = getDefaultDashboardTab(user);
    navigate(`/dashboard-new/${tab}`, {
      state: { backgroundLocation: location },
    });
  };

  return (
    <section
      className="artist-page-under-construction"
      aria-labelledby="artist-page-under-construction-title"
    >
      <div className="artist-page-under-construction__inner">
        <HammerIcon
          className="artist-page-under-construction__icon"
          aria-hidden="true"
          size={48}
          strokeWidth={1.25}
        />

        <h1
          id="artist-page-under-construction-title"
          className="artist-page-under-construction__title"
        >
          {copy?.title ?? 'Page is under construction'}
        </h1>

        <p className="artist-page-under-construction__subtitle">
          {copy?.subtitle ??
            'Publish an article, album, or fill out your profile — then the page will be visible to everyone.'}
        </p>

        <button
          type="button"
          className="artist-page-under-construction__cta"
          onClick={openDashboard}
        >
          {copy?.cta ?? 'Open dashboard'}
        </button>
      </div>
    </section>
  );
}

export default ArtistPageUnderConstruction;
