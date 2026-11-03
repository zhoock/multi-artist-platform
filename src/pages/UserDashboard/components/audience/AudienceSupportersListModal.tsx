import { useCallback, useEffect, useId, useRef, useState } from 'react';

import {
  fetchAllAudienceSupporters,
  type AudiencePeriod,
  type AudienceSupporter,
} from '@shared/api/audience';
import type { RouteLang } from '@shared/lib/i18n/routeLang';
import { buildArtistPagePath } from '@shared/lib/seo/publicPagePaths';
import { DashboardLoadingState } from '@shared/ui/dashboard';

import { AudienceAnalyticsListModalShell } from './AudienceAnalyticsListModalShell';

import './AudienceAnalyticsListModal.scss';
import './AudienceTab.scss';
import { AudienceSupporterRow } from './AudienceSupporterRow';

type AudienceSupportersListModalProps = {
  isOpen: boolean;
  period: AudiencePeriod;
  liveRevision?: number;
  lang: RouteLang;
  title: string;
  closeLabel: string;
  errorLabel: string;
  onClose: () => void;
};

export function AudienceSupportersListModal({
  isOpen,
  period,
  liveRevision = 0,
  lang,
  title,
  closeLabel,
  errorLabel,
  onClose,
}: AudienceSupportersListModalProps) {
  const titleId = useId();
  const liveRevisionRef = useRef(liveRevision);
  const [supporters, setSupporters] = useState<AudienceSupporter[]>([]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const loadSupporters = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent === true;
      if (!silent) {
        setLoadState('loading');
      }
      try {
        const loaded = await fetchAllAudienceSupporters(period);
        setSupporters(loaded);
        setLoadState('success');
      } catch {
        if (!silent) {
          setLoadState('error');
          setSupporters([]);
        }
      }
    },
    [period]
  );

  useEffect(() => {
    if (!isOpen) {
      liveRevisionRef.current = liveRevision;
      setLoadState('idle');
      setSupporters([]);
      return;
    }
    void loadSupporters();
  }, [isOpen, loadSupporters]);

  useEffect(() => {
    if (!isOpen || liveRevision <= 0 || liveRevision === liveRevisionRef.current) {
      return;
    }
    liveRevisionRef.current = liveRevision;
    void loadSupporters({ silent: true });
  }, [isOpen, liveRevision, loadSupporters]);

  return (
    <AudienceAnalyticsListModalShell
      isOpen={isOpen}
      titleId={titleId}
      title={title}
      closeLabel={closeLabel}
      onClose={onClose}
    >
      {loadState === 'loading' ? (
        <DashboardLoadingState className="audience-analytics-fullscreen__loading" />
      ) : loadState === 'error' ? (
        <p className="audience-analytics-fullscreen__error">{errorLabel}</p>
      ) : (
        <div className="audience-tab audience-tab--modal-surface">
          <ul className="audience-tab__supporters">
            {supporters.map((supporter) => {
              const slug = supporter.publicArtistSlug?.trim();
              const artistPagePath = slug ? buildArtistPagePath(lang, slug) : null;
              return (
                <AudienceSupporterRow
                  key={supporter.userId}
                  supporter={supporter}
                  artistPagePath={artistPagePath}
                />
              );
            })}
          </ul>
        </div>
      )}
    </AudienceAnalyticsListModalShell>
  );
}
