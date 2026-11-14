import { Link } from 'react-router-dom';
import { ExternalLink as ExternalLinkIcon, Link2 as LinkIcon } from 'lucide-react';

import type { CopyrightReportContextPayload } from '../lib/useCopyrightReportContext';
import type { CopyrightReportContentType } from '../lib/copyrightReportParams';

type CopyrightReportContentCardProps = {
  contentLabel: string;
  contentTypeLabel: string;
  contentPath: string;
  openContentLabel: string;
  titleLine: string;
  artistLine: string;
  context: CopyrightReportContextPayload;
  contentType: CopyrightReportContentType;
};

export function CopyrightReportContentCard({
  contentLabel,
  contentTypeLabel,
  contentPath,
  openContentLabel,
  titleLine,
  artistLine,
  context,
  contentType,
}: CopyrightReportContentCardProps) {
  const subtitle =
    contentType === 'track' && context.albumTitle
      ? `${artistLine} · ${context.albumTitle} · ${contentTypeLabel}`
      : `${artistLine} · ${contentTypeLabel}`;

  return (
    <section className="copyright-report-modal__content-card" aria-label={contentLabel}>
      <div className="copyright-report-modal__content-card-inner">
        <div
          className="copyright-report-modal__content-cover-wrap"
          aria-hidden={!context.coverImageUrl}
        >
          {context.coverImageUrl ? (
            <img
              className="copyright-report-modal__content-cover"
              src={context.coverImageUrl}
              alt=""
              width={88}
              height={88}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="copyright-report-modal__content-cover copyright-report-modal__content-cover--placeholder" />
          )}
        </div>
        <div className="copyright-report-modal__content-meta">
          <div className="copyright-report-modal__content-kicker">{contentLabel}</div>
          <div className="copyright-report-modal__content-title">{titleLine}</div>
          <div className="copyright-report-modal__content-subtitle">{subtitle}</div>
          <Link
            className="copyright-report-modal__content-link"
            to={contentPath}
            target="_blank"
            rel="noopener noreferrer"
          >
            <LinkIcon className="copyright-report-modal__content-link-icon" size={16} aria-hidden />
            <span className="copyright-report-modal__content-link-text">{contentPath}</span>
            <ExternalLinkIcon
              className="copyright-report-modal__content-link-external"
              size={16}
              aria-hidden
            />
            <span className="visually-hidden">{openContentLabel}</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
