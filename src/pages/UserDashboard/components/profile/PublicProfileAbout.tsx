import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Pencil as PencilIcon } from 'lucide-react';
import type { IInterface } from '@models';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

const ABOUT_LINE_CLAMP = 5;

type PublicProfileAboutProps = {
  aboutText: string;
  ui?: IInterface;
  onEditDescription: () => void;
};

export function PublicProfileAbout({ aboutText, ui, onEditDescription }: PublicProfileAboutProps) {
  const preview = ui?.dashboard?.publicProfilePreview;
  const textRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [needsToggle, setNeedsToggle] = useState(false);

  const trimmed = aboutText.trim();
  const isEmpty = trimmed.length === 0;

  useEffect(() => {
    setExpanded(false);
  }, [aboutText]);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || isEmpty) {
      setNeedsToggle(false);
      return;
    }
    if (expanded) {
      setNeedsToggle(true);
      return;
    }
    setNeedsToggle(el.scrollHeight > el.clientHeight + 1);
  }, [aboutText, expanded, isEmpty]);

  if (isEmpty) {
    return (
      <div className="user-dashboard__public-profile-about">
        <p className="user-dashboard__public-profile-empty">
          {preview?.aboutEmpty ?? 'No description yet.'}
        </p>
        <button
          type="button"
          className="user-dashboard__public-profile-edit-link"
          onClick={onEditDescription}
        >
          <PencilIcon {...dashboardActionIconProps({ size: 14 })} />
          <span>{preview?.editDescription ?? 'Edit description'}</span>
          <span aria-hidden="true"> →</span>
        </button>
      </div>
    );
  }

  return (
    <div className="user-dashboard__public-profile-about">
      <p
        ref={textRef}
        className={clsx('user-dashboard__public-profile-about-text', {
          'user-dashboard__public-profile-about-text--clamped': !expanded,
        })}
        style={
          !expanded ? ({ WebkitLineClamp: ABOUT_LINE_CLAMP } as React.CSSProperties) : undefined
        }
      >
        {trimmed}
      </p>
      {needsToggle ? (
        <button
          type="button"
          className="user-dashboard__public-profile-toggle"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
        >
          {expanded ? (preview?.showLess ?? 'Show less') : (preview?.showMore ?? 'Show more')}
        </button>
      ) : null}
    </div>
  );
}
