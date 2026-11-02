import clsx from 'clsx';
import { Link } from 'react-router-dom';

import type { AudienceSupporter } from '@shared/api/audience';
import { profileAvatarPathToDisplayUrl } from '@shared/lib/profileAvatar';

function resolveSupporterAvatar(url: string | null): string | null {
  const displayUrl = profileAvatarPathToDisplayUrl(url);
  return displayUrl || null;
}

export type AudienceSupporterRowProps = {
  supporter: AudienceSupporter;
  artistPagePath: string | null;
};

export function AudienceSupporterRow({ supporter, artistPagePath }: AudienceSupporterRowProps) {
  const avatar = resolveSupporterAvatar(supporter.avatarUrl);
  const avatarContent = avatar ? (
    <img src={avatar} alt="" loading="lazy" decoding="async" />
  ) : (
    <span className="audience-tab__supporter-initial">
      {supporter.displayName.slice(0, 1).toUpperCase()}
    </span>
  );

  const isPublicArtist = Boolean(artistPagePath);

  return (
    <li
      className={clsx(
        'audience-tab__supporter-row',
        isPublicArtist && 'audience-tab__supporter-row--public-artist'
      )}
    >
      {isPublicArtist && artistPagePath ? (
        <Link to={artistPagePath} className="audience-tab__supporter-avatar-link">
          <span className="audience-tab__supporter-avatar" aria-hidden>
            {avatarContent}
          </span>
        </Link>
      ) : (
        <span className="audience-tab__supporter-avatar" aria-hidden>
          {avatarContent}
        </span>
      )}
      {isPublicArtist && artistPagePath ? (
        <Link to={artistPagePath} className="audience-tab__supporter-name-link">
          {supporter.displayName}
        </Link>
      ) : (
        <span className="audience-tab__supporter-name">{supporter.displayName}</span>
      )}
    </li>
  );
}
