import { useEffect, useMemo, useState } from 'react';
import { useEffectiveSearchParams } from '@shared/lib/hooks/useEffectiveLocation';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { shouldShowArtistPageBuilderBlock } from '@shared/lib/artistPageBuilder';
import { useArtistPageBuilder } from '@shared/lib/hooks/useArtistPageBuilder';
import { ArtistPageBuilderBlock, useArtistPageBuilderNav } from '@shared/ui/artistPageBuilder';
import { ChevronRight as ChevronRightIcon, Mail as MailIcon } from 'lucide-react';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { fetchPublicArtistUserProfile } from '@shared/lib/publicArtistUserProfile';
import { hasPublicManagerContacts } from '@shared/lib/managerContactsFromSocialLinks';
import {
  ArtistContactManagerModal,
  type ArtistContactManagerModalLabels,
} from '@features/artistContactManager';
import sectionStyles from './ArtistContactManagerSection.module.scss';

export function ArtistContactManagerSection() {
  const { lang } = useLang();
  const [searchParams] = useEffectiveSearchParams();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const artistSlug = searchParams.get('artist')?.trim() ?? '';
  const isArtistPage = artistSlug.length > 0;
  const { builderVisibility, isOwner } = useArtistPageBuilder(artistSlug);
  const { openDashboard } = useArtistPageBuilderNav();

  const [isContactManagerModalOpen, setIsContactManagerModalOpen] = useState(false);
  const [managerTelegramUrl, setManagerTelegramUrl] = useState<string | null>(null);
  const [managerEmail, setManagerEmail] = useState<string | null>(null);
  const [managerContactsResolved, setManagerContactsResolved] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const handleArtistUpdated = () => {
      setRefreshToken((token) => token + 1);
    };

    window.addEventListener('artist:updated', handleArtistUpdated);
    return () => window.removeEventListener('artist:updated', handleArtistUpdated);
  }, []);

  useEffect(() => {
    setManagerTelegramUrl(null);
    setManagerEmail(null);
    setManagerContactsResolved(false);
  }, [lang, isArtistPage, artistSlug]);

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
  }, [artistSlug, isArtistPage, lang, refreshToken]);

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

  if (!isArtistPage || !managerContactsResolved) {
    return null;
  }

  if (!showContactPublic && !showContactBuilder) {
    return null;
  }

  return (
    <section
      id="contact-manager"
      className={`${sectionStyles.section} main-background`}
      aria-label={contactManagerLinkLabel}
    >
      <div className="wrapper">
        {showContactPublic ? (
          <>
            <button
              type="button"
              className={sectionStyles.sectionContactTrigger}
              onClick={() => setIsContactManagerModalOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={isContactManagerModalOpen}
            >
              <MailIcon
                className={sectionStyles.sectionContactIcon}
                {...dashboardActionIconProps({ size: 20 })}
              />
              <span className={sectionStyles.sectionContactLabel}>
                {contactManagerLinkLabel}
                <ChevronRightIcon
                  className={sectionStyles.sectionContactChevron}
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
          <div className={sectionStyles.sectionManagerBuilder}>
            <ArtistPageBuilderBlock
              layout="section"
              className="artist-page-builder-block--compact"
              icon={
                <MailIcon
                  {...dashboardActionIconProps({ size: 18, strokeWidth: 1.5 })}
                  aria-hidden
                />
              }
              title={
                ui?.artistPageBuilder?.managerContacts?.title ??
                'Add manager contacts for your audience'
              }
              description={
                ui?.artistPageBuilder?.managerContacts?.text ??
                'Add Telegram and email so listeners can reach your manager for concerts and press.'
              }
              actionLabel={
                ui?.artistPageBuilder?.managerContacts?.cta ?? 'Set up manager contacts →'
              }
              onAction={() => openDashboard('settings', { scrollToManagerContacts: true })}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
