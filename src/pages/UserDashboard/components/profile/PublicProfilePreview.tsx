import clsx from 'clsx';
import { useCallback, useEffect, useState } from 'react';
import { Copy as CopyIcon } from 'lucide-react';
import type { IInterface } from '@models';
import type { SupportedLang } from '@shared/model/lang';
import { buildOwnArtistPagePath } from '@shared/lib/ownArtistPage';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { PublicProfileAbout } from './PublicProfileAbout';
import {
  formatPublicProfileAboutText,
  getPublicProfileGenreLabel,
  type PublicProfilePreviewData,
} from './usePublicProfilePreview';

type PublicProfilePreviewProps = {
  data: PublicProfilePreviewData;
  isLoading: boolean;
  lang: SupportedLang;
  ui?: IInterface;
  onEditDescription: () => void;
};

function PreviewValue({
  children,
  empty,
  isLoading,
}: {
  children: React.ReactNode;
  empty?: boolean;
  isLoading: boolean;
}) {
  if (isLoading) {
    return <span className="user-dashboard__public-profile-skeleton" aria-hidden="true" />;
  }

  return (
    <span
      className={clsx('user-dashboard__public-profile-value', {
        'user-dashboard__public-profile-value--empty': empty,
      })}
    >
      {children}
    </span>
  );
}

export function PublicProfilePreview({
  data,
  isLoading,
  lang,
  ui,
  onEditDescription,
}: PublicProfilePreviewProps) {
  const preview = ui?.dashboard?.publicProfilePreview;
  const settings = ui?.dashboard?.profileSettingsModal?.fields;
  const [copied, setCopied] = useState(false);

  const genreLabel = getPublicProfileGenreLabel(data.genreCode, lang);
  const aboutText = formatPublicProfileAboutText(data.aboutParagraphs);
  const bandName = data.bandName?.trim() || null;
  const slug = data.publicSlug?.trim() || null;

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopyPublicUrl = useCallback(async () => {
    if (!slug) return;
    const url = new URL(buildOwnArtistPagePath(slug), window.location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch (error) {
      console.error('[dashboard] copy public URL failed', error);
    }
  }, [slug]);

  return (
    <section
      className="user-dashboard__profile-block user-dashboard__public-profile"
      aria-labelledby="user-dashboard-public-profile-title"
    >
      <h4
        id="user-dashboard-public-profile-title"
        className="user-dashboard__profile-block-heading user-dashboard__profile-block-heading--accent"
      >
        {preview?.sectionTitle ?? 'Public Profile'}
      </h4>

      <div className="user-dashboard__public-profile-card">
        <dl className="user-dashboard__public-profile-list">
          <div className="user-dashboard__public-profile-row">
            <dt className="user-dashboard__profile-row-label">
              {settings?.bandName ?? preview?.bandName ?? 'Band name'}
            </dt>
            <dd>
              <PreviewValue isLoading={isLoading} empty={!bandName}>
                {bandName ?? preview?.bandNameEmpty ?? 'Not set'}
              </PreviewValue>
            </dd>
          </div>

          <div className="user-dashboard__public-profile-row">
            <dt className="user-dashboard__profile-row-label">
              {settings?.primaryGenre ?? preview?.primaryGenre ?? 'Primary genre'}
            </dt>
            <dd>
              <PreviewValue isLoading={isLoading} empty={!genreLabel}>
                {genreLabel ?? preview?.genreEmpty ?? 'Not selected'}
              </PreviewValue>
            </dd>
          </div>

          <div className="user-dashboard__public-profile-row">
            <dt className="user-dashboard__profile-row-label">
              {preview?.publicUrl ?? 'Public URL (slug)'}
            </dt>
            <dd>
              {isLoading ? (
                <span className="user-dashboard__public-profile-skeleton" aria-hidden="true" />
              ) : slug ? (
                <div className="user-dashboard__public-profile-slug-row">
                  <span className="user-dashboard__public-profile-value">{slug}</span>
                  <button
                    type="button"
                    className="user-dashboard__public-profile-copy-link"
                    onClick={handleCopyPublicUrl}
                    aria-label={preview?.copy ?? 'Copy'}
                  >
                    <CopyIcon {...dashboardActionIconProps({ size: 14 })} />
                    <span>
                      {copied ? (preview?.copied ?? 'Copied') : (preview?.copy ?? 'Copy')}
                    </span>
                  </button>
                </div>
              ) : (
                <PreviewValue isLoading={false} empty>
                  {preview?.slugEmpty ?? 'Not configured'}
                </PreviewValue>
              )}
            </dd>
          </div>

          <div className="user-dashboard__public-profile-row user-dashboard__public-profile-row--about">
            <dt className="user-dashboard__profile-row-label">
              {settings?.aboutBand ?? preview?.about ?? 'About'}
            </dt>
            <dd>
              {isLoading ? (
                <span
                  className="user-dashboard__public-profile-skeleton user-dashboard__public-profile-skeleton--about"
                  aria-hidden="true"
                />
              ) : (
                <PublicProfileAbout
                  aboutText={aboutText}
                  ui={ui ?? undefined}
                  onEditDescription={onEditDescription}
                />
              )}
            </dd>
          </div>
        </dl>

        <p className="user-dashboard__public-profile-hint">
          {preview?.openPageHint ??
            'To view the full description and how your profile looks to listeners — click Open artist page.'}
        </p>
      </div>
    </section>
  );
}
