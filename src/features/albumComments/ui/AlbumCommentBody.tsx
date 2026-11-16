import { splitCommentBodyIntoSegments } from '../lib/commentMentions';

type AlbumCommentBodyProps = {
  body: string;
};

export function AlbumCommentBody({ body }: AlbumCommentBodyProps) {
  const segments = splitCommentBodyIntoSegments(body);

  return (
    <p className="album-comments__text">
      {segments.map((segment, index) =>
        segment.kind === 'mention' ? (
          <span key={`${index}-${segment.value}`} className="album-comments__mention">
            {segment.value}
          </span>
        ) : (
          <span key={`${index}-text`}>{segment.value}</span>
        )
      )}
    </p>
  );
}
