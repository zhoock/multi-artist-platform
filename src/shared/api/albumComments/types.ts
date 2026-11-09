export type AlbumCommentDto = {
  id: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  isEdited: boolean;
  author: {
    userId: string;
    displayName: string;
    avatarPath: string | null;
    isArtist: boolean;
    publicSlug: string | null;
  };
  likeCount: number;
  likedByViewer: boolean;
  replies: AlbumCommentDto[];
};

export type AlbumCommentsSummaryDto = {
  totalCount: number;
  recentCommenters: Array<{
    userId: string;
    displayName: string;
    avatarPath: string | null;
  }>;
};

export type AlbumCommentsPageDto = {
  comments: AlbumCommentDto[];
  nextCursor: string | null;
  totalRootCount: number;
  artistUserId: string;
};
