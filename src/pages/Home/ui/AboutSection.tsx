import { useState, useEffect } from 'react';
import {
  useEffectiveLocation,
  useEffectiveSearchParams,
} from '@shared/lib/hooks/useEffectiveLocation';
import { Text } from '@shared/ui/text';
import { PublicFullscreenTextModal } from '@shared/ui/publicFullscreenText';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { useSiteArtistDisplayName } from '@shared/lib/hooks/useSiteArtistDisplayName';
import { loadTheBandFromDatabase } from '@entities/user/lib';
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
    setTheBandFromDb(null);
    setIsLoadingTheBand(true);
  }, [lang, isArtistPage, artistSlug]);

  useEffect(() => {
    let cancelled = false;

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

  const theBand = (theBandFromDb || []).filter(
    (paragraph) => typeof paragraph === 'string' && paragraph.trim().length > 0
  );
  const previewParagraph = theBand[0];
  const showLabel = ui?.buttons?.show ?? '';

  const showAboutBuilder =
    isArtistPage &&
    shouldShowArtistPageBuilderBlock(builderVisibility, !hasFilledBandParagraphs(theBand));

  const showSection = hasFilledBandParagraphs(theBand) || showAboutBuilder;

  if (isArtistPage && isLoadingTheBand) {
    return null;
  }

  if (!showSection) {
    return null;
  }

  const aboutAriaLabel = `${title} ${bandDisplayLabel}`.trim();

  if (showAboutBuilder) {
    return (
      <section
        id="about"
        className={`${aboutStyles.about} main-background`}
        aria-label={aboutAriaLabel || undefined}
      >
        <div className="wrapper">
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
      aria-label={aboutAriaLabel || undefined}
    >
      <div className="wrapper">
        {previewParagraph ? (
          <button
            type="button"
            className={aboutStyles.aboutPreviewTrigger}
            onClick={onOpen}
            aria-haspopup="dialog"
            aria-expanded={isAboutModalOpen}
          >
            <Text className={`${aboutStyles.aboutText} ${aboutStyles.aboutTextPreview}`}>
              {previewParagraph}
            </Text>
            <span className={aboutStyles.aboutPreviewFade} aria-hidden="true" />
            <span className={aboutStyles.aboutPreviewMore} aria-hidden="true">
              {showLabel}
            </span>
          </button>
        ) : null}

        <PublicFullscreenTextModal
          isOpen={isAboutModalOpen}
          onClose={onClose}
          title={`${title} ${bandDisplayLabel}`.trim()}
          closeAriaLabel={ui?.albumComments?.cancel ?? 'Close'}
        >
          {theBand.map((paragraph, index) => (
            <Text key={index}>{paragraph}</Text>
          ))}
        </PublicFullscreenTextModal>
      </div>
    </section>
  );
}
