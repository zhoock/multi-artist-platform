import clsx from 'clsx';
import { ArrowUpRight as ArrowUpRightIcon } from 'lucide-react';
import type { MouseEvent, ReactNode, SyntheticEvent } from 'react';
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
  /** When false, renders a static placeholder (no click, no arrow). */
  interactive?: boolean;
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

function stopBubble(event: SyntheticEvent) {
  event.stopPropagation();
}

function ArtistPageBuilderBlockContent({
  icon,
  title,
  description,
  heading,
  showArrow,
}: Pick<ArtistPageBuilderBlockProps, 'icon' | 'title' | 'description' | 'heading'> & {
  showArrow: boolean;
}) {
  return (
    <>
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
      {showArrow ? (
        <ArrowUpRightIcon className="artist-page-builder-block__arrow" aria-hidden size={18} />
      ) : null}
    </>
  );
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
  interactive = true,
}: ArtistPageBuilderBlockProps) {
  const blockClassName = clsx(
    'artist-page-builder-block',
    `artist-page-builder-block--${layout}`,
    heading && 'artist-page-builder-block--withHeading',
    !interactive && 'artist-page-builder-block--static',
    className
  );

  if (!interactive) {
    return (
      <div
        className={blockClassName}
        role="status"
        aria-label={resolveAriaLabel(actionLabel, title)}
      >
        <ArtistPageBuilderBlockContent
          icon={icon}
          title={title}
          description={description}
          heading={heading}
          showArrow={false}
        />
      </div>
    );
  }

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onAction();
  };

  return (
    <button
      type="button"
      className={blockClassName}
      onClick={handleClick}
      onPointerDown={stopBubble}
      onMouseDown={stopBubble}
      aria-label={resolveAriaLabel(actionLabel, title)}
    >
      <ArtistPageBuilderBlockContent
        icon={icon}
        title={title}
        description={description}
        heading={heading}
        showArrow
      />
    </button>
  );
}
