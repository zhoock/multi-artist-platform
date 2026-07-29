import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { ServicePageLayout } from '@shared/ui/serviceScreen';

export function ArtistPageUnderConstruction() {
  const { lang } = useLang();
  const navigate = useNavigate();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const copy = ui?.artistPageUnderConstruction;

  useEffect(() => {
    document.body.classList.add('page--service-screen', 'page--artist-under-construction');
    return () => {
      document.body.classList.remove('page--service-screen', 'page--artist-under-construction');
    };
  }, []);

  const title = copy?.title ?? 'Page is under construction';
  const subtitle =
    copy?.visitorSubtitle ??
    'This artist has not published their first release yet. This page will become available after the first publication.';
  const ctaLabel = copy?.visitorCta ?? 'Back to the galaxy';

  return (
    <ServicePageLayout
      scene="hexagon"
      titleId="artist-page-under-construction-title"
      pageTitle={title}
      title={title}
      description={subtitle}
      action={{
        label: ctaLabel,
        onClick: () => navigate('/', { replace: true }),
      }}
    />
  );
}

export default ArtistPageUnderConstruction;
