import clsx from 'clsx';
import { ArrowUpRight as ArrowUpRightIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import './ArtistPageBuilderBlock.scss';

export type ArtistPageBuilderBlockLayout = 'section' | 'heroImage' | 'bar';

type ArtistPageBuilderBlockProps = {
  layout: ArtistPageBuilderBlockLayout;
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Used for aria-label; describes the navigation action on click. */
  actionLabel: ReactNode;
  onAction: () => void;
  heading?: ReactNode;
  className?: string;
};

function resolveAriaLabel(actionLabel: ReactNode, title: ReactNode): string | undefined {
  if (typeof actionLabel === 'string' && actionLabel.trim()) {
    return actionLabel;
  }
  if (typeof title === 'string' && title.trim()) {
    return title;
  }
  return undefined;
}

export function ArtistPageBuilderBlock({
  layout,
  icon,
  title,
  description,
  actionLabel,
  onAction,
  heading,
  className,
}: ArtistPageBuilderBlockProps) {
  return (
    <button
      type="button"
      className={clsx(
        'artist-page-builder-block',
        `artist-page-builder-block--${layout}`,
        heading && 'artist-page-builder-block--withHeading',
        className
      )}
      onClick={onAction}
      aria-label={resolveAriaLabel(actionLabel, title)}
    >
      {/*
        Only phrasing content inside <button>: nested <div>/<p> is invalid HTML and some
        mobile browsers hoist those nodes out of the button, shrinking the real hit target.
      */}
      <span className="artist-page-builder-block__main">
        <span className="artist-page-builder-block__icon" aria-hidden="true">
          {icon}
        </span>
        {heading ? <span className="artist-page-builder-block__heading">{heading}</span> : null}
        <span className="artist-page-builder-block__text">
          <span className="artist-page-builder-block__title">{title}</span>
          {description ? (
            <span className="artist-page-builder-block__description">{description}</span>
          ) : null}
        </span>
      </span>
      <ArrowUpRightIcon className="artist-page-builder-block__arrow" aria-hidden size={18} />
    </button>
  );
}
