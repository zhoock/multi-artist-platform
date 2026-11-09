import clsx from 'clsx';
import { profileAvatarPathToDisplayUrl } from '@shared/lib/profileAvatar';

type AlbumCommentAvatarProps = {
  avatarPath?: string | null | undefined;
  imageUrl?: string | null;
  displayName: string;
  size?: 'sm' | 'md';
  className?: string;
};

export function AlbumCommentAvatar({
  avatarPath,
  imageUrl,
  displayName,
  size = 'md',
  className,
}: AlbumCommentAvatarProps) {
  const url = imageUrl?.trim() || profileAvatarPathToDisplayUrl(avatarPath);
  const initial = displayName.trim().slice(0, 1).toUpperCase() || '?';
  const pixelSize = size === 'sm' ? 24 : 32;

  return (
    <span
      className={clsx(
        'album-comments__avatar',
        size === 'sm' && 'album-comments__avatar--sm',
        className
      )}
      aria-hidden
    >
      {url ? (
        <img
          src={url}
          alt=""
          width={pixelSize}
          height={pixelSize}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="album-comments__avatar-initial">{initial}</span>
      )}
    </span>
  );
}
