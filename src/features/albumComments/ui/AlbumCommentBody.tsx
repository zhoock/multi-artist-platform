import { Link } from 'react-router-dom';
import type { RouteLang } from '@shared/lib/i18n/routeLang';
import { buildArtistPagePath } from '@shared/lib/seo/publicPagePaths';
import { splitCommentBodyIntoSegments, type MentionTarget } from '../lib/commentMentions';

type AlbumCommentBodyProps = {
  body: string;
  lang: string;
  mentionTargets?: MentionTarget[];
};

export function AlbumCommentBody({ body, lang, mentionTargets = [] }: AlbumCommentBodyProps) {
  const segments = splitCommentBodyIntoSegments(body, mentionTargets);

  return (
    <p className="album-comments__text">
      {segments.map((segment, index) => {
        if (segment.kind === 'text') {
          return <span key={`${index}-text`}>{segment.value}</span>;
        }

        const slug = segment.publicSlug?.trim();
        const artistPath =
          segment.isArtist && slug ? buildArtistPagePath(lang as RouteLang, slug) : null;

        if (artistPath) {
          return (
            <Link
              key={`${index}-${segment.label}`}
              to={artistPath}
              className="album-comments__mention album-comments__mention-link"
            >
              {segment.label}
            </Link>
          );
        }

        return (
          <span key={`${index}-${segment.label}`} className="album-comments__mention">
            {segment.label}
          </span>
        );
      })}
    </p>
  );
}
