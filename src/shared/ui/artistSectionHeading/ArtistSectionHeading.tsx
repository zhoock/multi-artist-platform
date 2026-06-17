import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import './artistSectionHeading.scss';

export interface ArtistSectionHeadingProps {
  id: string;
  title: string;
  to?: string;
}

export function ArtistSectionHeading({ id, title, to }: ArtistSectionHeadingProps) {
  return (
    <h2 id={id} className="artist-section-heading">
      {to ? (
        <Link to={to} className="artist-section-heading__link">
          <span className="artist-section-heading__label">{title}</span>
          <ChevronRight className="artist-section-heading__chevron" strokeWidth={2} aria-hidden />
        </Link>
      ) : (
        title
      )}
    </h2>
  );
}
