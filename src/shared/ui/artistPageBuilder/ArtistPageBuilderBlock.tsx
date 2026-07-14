import clsx from 'clsx';
import type { ReactNode } from 'react';
import { DashboardButton } from '@shared/ui/dashboard/DashboardButton';
import './ArtistPageBuilderBlock.scss';

export type ArtistPageBuilderBlockLayout = 'section' | 'heroImage' | 'bar';

type ArtistPageBuilderBlockProps = {
  layout: ArtistPageBuilderBlockLayout;
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actionLabel: ReactNode;
  onAction: () => void;
  actionIcon?: ReactNode;
  heading?: ReactNode;
  className?: string;
};

export function ArtistPageBuilderBlock({
  layout,
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon,
  heading,
  className,
}: ArtistPageBuilderBlockProps) {
  return (
    <div
      className={clsx(
        'artist-page-builder-block',
        `artist-page-builder-block--${layout}`,
        heading && 'artist-page-builder-block--withHeading',
        className
      )}
      role="status"
    >
      <div className="artist-page-builder-block__main">
        <div className="artist-page-builder-block__icon" aria-hidden="true">
          {icon}
        </div>
        {heading ? <div className="artist-page-builder-block__heading">{heading}</div> : null}
        <div className="artist-page-builder-block__text">
          <p className="artist-page-builder-block__title">{title}</p>
          {description ? (
            <p className="artist-page-builder-block__description">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="artist-page-builder-block__action">
        <DashboardButton type="button" variant="primary" onClick={onAction}>
          {actionIcon}
          <span>{actionLabel}</span>
        </DashboardButton>
      </div>
    </div>
  );
}
