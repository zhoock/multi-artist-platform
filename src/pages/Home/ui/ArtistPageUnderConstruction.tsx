import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLang } from '@app/providers/lang';
import { getDefaultDashboardTab } from '@shared/lib/accountType';
import { useAuthSessionUser } from '@shared/lib/hooks/useAuthSessionUser';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { ServiceScreen } from '@shared/ui/serviceScreen';

type ArtistPageUnderConstructionProps = {
  variant?: 'owner' | 'visitor';
};

export function ArtistPageUnderConstruction({
  variant = 'owner',
}: ArtistPageUnderConstructionProps) {
  const { lang } = useLang();
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthSessionUser();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const copy = ui?.artistPageUnderConstruction;
  const isVisitor = variant === 'visitor';

  useEffect(() => {
    document.body.classList.add('page--service-screen', 'page--artist-under-construction');
    return () => {
      document.body.classList.remove('page--service-screen', 'page--artist-under-construction');
    };
  }, []);

  const openDashboard = () => {
    const tab = getDefaultDashboardTab(user);
    navigate(`/dashboard-new/${tab}`, {
      state: { backgroundLocation: location },
    });
  };

  const title = copy?.title ?? 'Page is under construction';
  const subtitle = isVisitor
    ? (copy?.visitorSubtitle ??
      'This artist has not published their first release yet. This page will become available after the first publication.')
    : (copy?.subtitle ??
      'Publish an article, album, or fill out your profile — then the page will be visible to everyone.');
  const ctaLabel = isVisitor
    ? (copy?.visitorCta ?? 'Back to the galaxy')
    : (copy?.cta ?? 'Open dashboard');

  return (
    <ServiceScreen
      modifier="artist-under-construction"
      titleId="artist-page-under-construction-title"
      pageTitle={title}
      title={title}
      description={subtitle}
      primaryAction={{
        label: ctaLabel,
        onClick: isVisitor ? () => navigate('/', { replace: true }) : openDashboard,
      }}
    />
  );
}

export default ArtistPageUnderConstruction;
