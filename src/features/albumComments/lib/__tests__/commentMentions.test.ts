import {
  buildReplyDraftWithMention,
  collectMentionTargets,
  splitCommentBodyIntoSegments,
  type MentionTarget,
} from '../commentMentions';
import type { AlbumCommentDto } from '@shared/api/albumComments';

describe('commentMentions', () => {
  describe('buildReplyDraftWithMention', () => {
    test('prefixes @displayName and trailing space when name exists', () => {
      expect(buildReplyDraftWithMention('Смоляное чучелко')).toBe('@Смоляное чучелко ');
      expect(buildReplyDraftWithMention('beatles')).toBe('@beatles ');
    });

    test('returns empty string when name missing', () => {
      expect(buildReplyDraftWithMention(null)).toBe('');
      expect(buildReplyDraftWithMention('  ')).toBe('');
    });
  });

  describe('splitCommentBodyIntoSegments', () => {
    const smolyanoeTarget: MentionTarget[] = [
      {
        displayName: 'Смоляное чучелко',
        publicSlug: 'smolyanoe-chuchelko',
        isArtist: true,
      },
    ];

    test('splits leading slug mention without catalog (legacy)', () => {
      expect(splitCommentBodyIntoSegments('@jane Great track!')).toEqual([
        { kind: 'mention', label: '@jane', publicSlug: null, isArtist: false },
        { kind: 'text', value: ' Great track!' },
      ]);
    });

    test('splits display-name mention with slug when catalog provided', () => {
      expect(
        splitCommentBodyIntoSegments('@Смоляное чучелко Great track!', smolyanoeTarget)
      ).toEqual([
        {
          kind: 'mention',
          label: '@Смоляное чучелко',
          publicSlug: 'smolyanoe-chuchelko',
          isArtist: true,
        },
        { kind: 'text', value: ' Great track!' },
      ]);
    });

    test('maps legacy @public_slug mention to display name via catalog', () => {
      expect(splitCommentBodyIntoSegments('@smolyanoe-chuchelko Earlier', smolyanoeTarget)).toEqual(
        [
          {
            kind: 'mention',
            label: '@Смоляное чучелко',
            publicSlug: 'smolyanoe-chuchelko',
            isArtist: true,
          },
          { kind: 'text', value: ' Earlier' },
        ]
      );
    });

    test('keeps plain text as single segment', () => {
      expect(splitCommentBodyIntoSegments('No mention')).toEqual([
        { kind: 'text', value: 'No mention' },
      ]);
    });
  });

  describe('collectMentionTargets', () => {
    test('collects unique authors from roots and replies', () => {
      const root: AlbumCommentDto = {
        id: 'r',
        parentId: null,
        body: '',
        createdAt: '',
        updatedAt: '',
        deletedAt: null,
        isEdited: false,
        likeCount: 0,
        likedByViewer: false,
        author: {
          userId: 'a1',
          displayName: 'Root',
          username: 'root',
          avatarPath: null,
          isArtist: false,
          publicSlug: null,
        },
        replies: [
          {
            id: 'p',
            parentId: 'r',
            body: '',
            createdAt: '',
            updatedAt: '',
            deletedAt: null,
            isEdited: false,
            likeCount: 0,
            likedByViewer: false,
            author: {
              userId: 'a2',
              displayName: 'Смоляное чучелко',
              username: 'smolyanoe-chuchelko',
              avatarPath: null,
              isArtist: true,
              publicSlug: 'smolyanoe-chuchelko',
            },
            replies: [],
          },
        ],
      };

      expect(collectMentionTargets([root])).toEqual([
        { displayName: 'Root', publicSlug: null, isArtist: false },
        {
          displayName: 'Смоляное чучелко',
          publicSlug: 'smolyanoe-chuchelko',
          isArtist: true,
        },
      ]);
    });
  });
});
