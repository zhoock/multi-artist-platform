import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { ContextNavMode } from '@shared/lib/navigationContext';

import './contextNav.scss';

export interface ContextNavProps {
  mode: ContextNavMode;
  artistName: string;
  artistTo: string;
  listLabel?: string;
  listTo?: string;
  className?: string;
}

function ArtistBackLink({ to, artistName }: { to: string; artistName: string }) {
  const label = artistName.trim();

  return (
    <Link
      to={to}
      className="context-nav__back context-nav__back--artist context-nav__back--icon-only"
      aria-label={label || undefined}
    >
      <ChevronLeft className="context-nav__chevron" strokeWidth={2} aria-hidden />
    </Link>
  );
}

export function ContextNav({
  mode,
  artistName,
  artistTo,
  listLabel,
  listTo,
  className = '',
}: ContextNavProps) {
  if (!artistTo.trim()) {
    return null;
  }

  const rootClassName = ['context-nav', className].filter(Boolean).join(' ');

  if (mode === 'artist-only') {
    return (
      <nav className={rootClassName} aria-label="Context navigation">
        <ArtistBackLink to={artistTo} artistName={artistName} />
      </nav>
    );
  }

  if (!listLabel?.trim() || !listTo) {
    return (
      <nav className={rootClassName} aria-label="Context navigation">
        <ArtistBackLink to={artistTo} artistName={artistName} />
      </nav>
    );
  }

  return (
    <nav className={rootClassName} aria-label="Context navigation">
      <Link to={listTo} className="context-nav__back context-nav__back--section">
        <ChevronLeft className="context-nav__chevron" strokeWidth={2} aria-hidden />
        {listLabel}
      </Link>
    </nav>
  );
}
