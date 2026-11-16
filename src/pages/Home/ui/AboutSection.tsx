import { useState, useEffect, useMemo } from 'react';
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
import { ChevronRight as ChevronRightIcon, Mail as MailIcon, User as UserIcon } from 'lucide-react';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { fetchPublicArtistUserProfile } from '@shared/lib/publicArtistUserProfile';
import { hasPublicManagerContacts } from '@shared/lib/managerContactsFromSocialLinks';
import {
  ArtistContactManagerModal,
  type ArtistContactManagerModalLabels,
} from '@features/artistContactManager';
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
  const { builderVisibility, isOwner } = useArtistPageBuilder(artistSlug);
  const { openDashboard } = useArtistPageBuilderNav();

  const { displayLabel: bandDisplayLabel } = useSiteArtistDisplayName(lang, {
    artistSlug: isArtistPage ? artistSlug : null,
  });

  const [theBandFromDb, setTheBandFromDb] = useState<string[] | null>(null);
  const [isLoadingTheBand, setIsLoadingTheBand] = useState(true);
  const [theBandRefreshToken, setTheBandRefreshToken] = useState(0);
  const [isContactManagerModalOpen, setIsContactManagerModalOpen] = useState(false);
  const [managerTelegramUrl, setManagerTelegramUrl] = useState<string | null>(null);
  const [managerEmail, setManagerEmail] = useState<string | null>(null);
  const [managerContactsResolved, setManagerContactsResolved] = useState(false);

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
    setManagerTelegramUrl(null);
    setManagerEmail(null);
    setManagerContactsResolved(false);
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

  useEffect(() => {
    if (!isArtistPage || !artistSlug) {
      setManagerTelegramUrl(null);
      setManagerEmail(null);
      setManagerContactsResolved(true);
      return;
    }

    let cancelled = false;
    setManagerContactsResolved(false);

    void fetchPublicArtistUserProfile(artistSlug, { lang })
      .then((profile) => {
        if (!cancelled) {
          setManagerTelegramUrl(profile?.managerTelegramUrl ?? null);
          setManagerEmail(profile?.managerEmail ?? null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setManagerContactsResolved(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [artistSlug, isArtistPage, lang, theBandRefreshToken]);

  const theBand = (theBandFromDb || []).filter(
    (paragraph) => typeof paragraph === 'string' && paragraph.trim().length > 0
  );
  const previewParagraph = theBand[0];
  const showLabel = ui?.buttons?.show ?? '';

  const hasManagerContacts = hasPublicManagerContacts({
    managerEmail,
    managerTelegramUrl,
  });

  const showContactBuilder =
    managerContactsResolved &&
    isArtistPage &&
    isOwner &&
    shouldShowArtistPageBuilderBlock(builderVisibility, !hasManagerContacts);

  const showContactPublic = managerContactsResolved && isArtistPage && hasManagerContacts;

  const contactManagerLabels: ArtistContactManagerModalLabels = useMemo(
    () => ({
      title: ui?.artistContactManager?.title ?? 'Связаться с менеджером',
      description:
        ui?.artistContactManager?.description ??
        'По вопросам концертов, сотрудничества, прессы и другим предложениям.',
      telegram: ui?.artistContactManager?.telegram ?? 'Telegram',
      email: ui?.artistContactManager?.email ?? 'Email',
      close: ui?.albumComments?.cancel ?? ui?.buttons?.cancel ?? 'Close',
      emailCopied: ui?.artistContactManager?.emailCopied ?? 'Email скопирован',
      openTelegram: ui?.artistContactManager?.openTelegram ?? 'Открыть Telegram',
      copyEmail: ui?.artistContactManager?.copyEmail ?? 'Скопировать email',
    }),
    [ui]
  );

  const contactManagerLinkLabel = ui?.artistContactManager?.linkLabel ?? 'Связаться с менеджером';

  const showAboutBuilder =
    isArtistPage &&
    shouldShowArtistPageBuilderBlock(builderVisibility, !hasFilledBandParagraphs(theBand));

  const showSection =
    hasFilledBandParagraphs(theBand) || showAboutBuilder || showContactPublic || showContactBuilder;

  if (isArtistPage && (isLoadingTheBand || !managerContactsResolved)) {
    return null;
  }

  if (!showSection) {
    return null;
  }

  const managerContactBlock = showContactPublic ? (
    <>
      <button
        type="button"
        className={aboutStyles.aboutContactTrigger}
        onClick={() => setIsContactManagerModalOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isContactManagerModalOpen}
      >
        <MailIcon
          className={aboutStyles.aboutContactIcon}
          {...dashboardActionIconProps({ size: 20 })}
        />
        <span className={aboutStyles.aboutContactLabel}>
          {contactManagerLinkLabel}
          <ChevronRightIcon
            className={aboutStyles.aboutContactChevron}
            strokeWidth={2}
            aria-hidden
          />
        </span>
      </button>
      <ArtistContactManagerModal
        isOpen={isContactManagerModalOpen}
        onClose={() => setIsContactManagerModalOpen(false)}
        telegramUrl={managerTelegramUrl}
        managerEmail={managerEmail}
        labels={contactManagerLabels}
      />
    </>
  ) : showContactBuilder ? (
    <div className={aboutStyles.aboutManagerBuilder}>
      <ArtistPageBuilderBlock
        layout="section"
        className="artist-page-builder-block--compact"
        icon={
          <MailIcon {...dashboardActionIconProps({ size: 18, strokeWidth: 1.5 })} aria-hidden />
        }
        title={
          ui?.artistPageBuilder?.managerContacts?.title ?? 'Add manager contacts for your audience'
        }
        description={
          ui?.artistPageBuilder?.managerContacts?.text ??
          'Add Telegram and email so listeners can reach your manager for concerts and press.'
        }
        actionLabel={ui?.artistPageBuilder?.managerContacts?.cta ?? 'Set up manager contacts →'}
        onAction={() => openDashboard('settings', { scrollToManagerContacts: true })}
      />
    </div>
  ) : null;

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
          {managerContactBlock}
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

        {managerContactBlock}

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
