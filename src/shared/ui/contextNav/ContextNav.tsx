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

export function ContextNav({
  mode,
  artistName,
  artistTo,
  listLabel,
  listTo,
  className = '',
}: ContextNavProps) {
  if (!artistName.trim()) {
    return null;
  }

  const rootClassName = ['context-nav', className].filter(Boolean).join(' ');

  if (mode === 'artist-only') {
    return (
      <nav className={rootClassName} aria-label="Context navigation">
        <Link to={artistTo} className="context-nav__back context-nav__back--artist">
          ← {artistName}
        </Link>
      </nav>
    );
  }

  if (!listLabel?.trim() || !listTo) {
    return (
      <nav className={rootClassName} aria-label="Context navigation">
        <Link to={artistTo} className="context-nav__back context-nav__back--artist">
          ← {artistName}
        </Link>
      </nav>
    );
  }

  return (
    <nav className={rootClassName} aria-label="Context navigation">
      <Link to={listTo} className="context-nav__back context-nav__back--section">
        ← {listLabel}
      </Link>
      <span className="context-nav__sep" aria-hidden="true">
        •
      </span>
      <Link to={artistTo} className="context-nav__link">
        {artistName}
      </Link>
    </nav>
  );
}
