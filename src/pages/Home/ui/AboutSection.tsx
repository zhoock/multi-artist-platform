import { useState, useEffect } from 'react';
import {
  useEffectiveLocation,
  useEffectiveSearchParams,
} from '@shared/lib/hooks/useEffectiveLocation';
import { Popup, PopupHamburgerToggle } from '@shared/ui/popup';
import { Text } from '@shared/ui/text';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { useSiteArtistDisplayName } from '@shared/lib/hooks/useSiteArtistDisplayName';
import { loadTheBandFromDatabase, loadTheBandFromProfileJson } from '@entities/user/lib';
import { shouldShowArtistPageBuilderBlock } from '@shared/lib/artistPageBuilder';
import { useArtistPageBuilder } from '@shared/lib/hooks/useArtistPageBuilder';
import {
  ArtistPageBuilderBlock,
  artistPageBuilderSectionIconProps,
  useArtistPageBuilderNav,
} from '@shared/ui/artistPageBuilder';
import { User as UserIcon } from 'lucide-react';
import aboutStyles from './AboutSection.module.scss';

type AboutSectionProps = {
  isAboutModalOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
};

function hasFilledBandParagraphs(paragraphs: string[] | null | undefined): boolean {
  return (
    Array.isArray(paragraphs) &&
    paragraphs.some((paragraph) => typeof paragraph === 'string' && paragraph.trim().length > 0)
  );
}

export function AboutSection({ isAboutModalOpen, onOpen, onClose }: AboutSectionProps) {
  const { lang } = useLang();
  const location = useEffectiveLocation();
  const [searchParams] = useEffectiveSearchParams();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const artistSlug = searchParams.get('artist')?.trim() ?? '';
  const isArtistPage = artistSlug.length > 0;
  const { builderVisibility } = useArtistPageBuilder(artistSlug);
  const { openDashboard } = useArtistPageBuilderNav();

  const { displayLabel: bandDisplayLabel } = useSiteArtistDisplayName(lang, {
    artistSlug: isArtistPage ? artistSlug : null,
  });

  const [theBandFromDb, setTheBandFromDb] = useState<string[] | null>(null);
  const [isLoadingTheBand, setIsLoadingTheBand] = useState(true);
  const [theBandFromProfileJson, setTheBandFromProfileJson] = useState<string[] | null>(null);
  const [theBandRefreshToken, setTheBandRefreshToken] = useState(0);

  const title = ui?.titles?.theBand ?? '';

  useEffect(() => {
    const handleArtistUpdated = () => {
      setTheBandRefreshToken((token) => token + 1);
    };

    window.addEventListener('artist:updated', handleArtistUpdated);
    return () => window.removeEventListener('artist:updated', handleArtistUpdated);
  }, []);

  useEffect(() => {
    let cancelled = false;

    setTheBandFromDb(null);
    setIsLoadingTheBand(true);

    (async () => {
      try {
        const theBand = await loadTheBandFromDatabase(lang, {
          artistSlugOverride: isArtistPage ? artistSlug : null,
        });
        if (!cancelled) {
          setTheBandFromDb(theBand);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('⚠️ Ошибка загрузки theBand из БД:', error);
          setTheBandFromDb(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingTheBand(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lang, location.search, isArtistPage, artistSlug, theBandRefreshToken]);

  useEffect(() => {
    if (isArtistPage) {
      setTheBandFromProfileJson(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const profileData = await loadTheBandFromProfileJson(lang);
        if (!cancelled) {
          setTheBandFromProfileJson(profileData);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('⚠️ Ошибка загрузки theBand из profile.json:', error);
          setTheBandFromProfileJson(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lang, isArtistPage]);

  const theBand = (
    isArtistPage
      ? theBandFromDb || []
      : hasFilledBandParagraphs(theBandFromDb)
        ? theBandFromDb!
        : theBandFromProfileJson || []
  ).filter((paragraph) => typeof paragraph === 'string' && paragraph.trim().length > 0);
  const previewParagraph = theBand[0];
  const showLabel = ui?.buttons?.show ?? '';

  if (isArtistPage && isLoadingTheBand) {
    return null;
  }

  const showAboutBuilder =
    isArtistPage &&
    shouldShowArtistPageBuilderBlock(builderVisibility, !hasFilledBandParagraphs(theBand));

  if (!hasFilledBandParagraphs(theBand) && !showAboutBuilder) {
    return null;
  }

  if (showAboutBuilder) {
    return (
      <section
        id="about"
        className={`${aboutStyles.about} main-background`}
        aria-labelledby="home-about-heading"
      >
        <div className="wrapper">
          <h2 id="home-about-heading">
            {title} {bandDisplayLabel}
          </h2>
          <ArtistPageBuilderBlock
            layout="section"
            icon={<UserIcon {...artistPageBuilderSectionIconProps()} />}
            title={ui?.artistPageBuilder?.about?.title ?? 'Tell about your band'}
            description={
              ui?.artistPageBuilder?.about?.text ??
              'Add a band description, origin story, members, and interesting facts.'
            }
            actionLabel={ui?.artistPageBuilder?.about?.cta ?? 'Add description'}
            onAction={() => openDashboard('settings')}
          />
        </div>
      </section>
    );
  }

  return (
    <section
      id="about"
      className={`${aboutStyles.about} main-background`}
      aria-labelledby="home-about-heading"
    >
      <div className="wrapper">
        <h2 id="home-about-heading">
          {title} {bandDisplayLabel}
        </h2>

        {previewParagraph && (
          <Text className={`${aboutStyles.aboutText} ${aboutStyles.aboutTextPreview}`}>
            {previewParagraph}
          </Text>
        )}

        <div className={aboutStyles.aboutButtonWrapper}>
          <button
            className={aboutStyles.aboutLookMore}
            onClick={onOpen}
            type="button"
            aria-haspopup="dialog"
          >
            {showLabel}
          </button>
        </div>

        <Popup isActive={isAboutModalOpen} onClose={onClose} aria-labelledby="about-popup-title">
          <div className={aboutStyles.aboutPopup}>
            <div className={aboutStyles.aboutPopupHeader}>
              <h3 id="about-popup-title">
                {title} {bandDisplayLabel}
              </h3>
              <PopupHamburgerToggle
                isActive={isAboutModalOpen}
                className={aboutStyles.aboutPopupHamburger}
              />
            </div>

            <div className={aboutStyles.aboutPopupInner}>
              {theBand.map((paragraph, index) => (
                <Text key={index} className={aboutStyles.aboutText}>
                  {paragraph}
                </Text>
              ))}
            </div>
          </div>
        </Popup>
      </div>
    </section>
  );
}
