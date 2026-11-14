export const COPYRIGHT_REPORT_OPEN_QUERY_PARAM = 'copyrightReport';

export type CopyrightReportContentType = 'album' | 'track';

export type CopyrightReportRequest = {
  contentType: CopyrightReportContentType;
  contentId: string;
  artistSlug: string;
  /** Known on album page — skips waiting on context for cover. */
  coverImageUrl?: string | null;
};

export function buildCopyrightReportStandalonePath(input: {
  contentType: CopyrightReportContentType;
  contentId: string;
  artistSlug: string;
}): string {
  const qs = new URLSearchParams({
    contentType: input.contentType,
    contentId: input.contentId.trim(),
    artistSlug: input.artistSlug.trim(),
  });
  return `/copyright/report?${qs.toString()}`;
}

export function parseCopyrightReportRequestFromSearchParams(
  searchParams: URLSearchParams
): Omit<CopyrightReportRequest, 'coverImageUrl'> | null {
  const contentType = (searchParams.get('contentType') ??
    searchParams.get('content_type')) as CopyrightReportContentType | null;
  const contentId = (searchParams.get('contentId') ?? searchParams.get('content_id') ?? '').trim();
  const artistSlug = (
    searchParams.get('artistSlug') ??
    searchParams.get('artist') ??
    searchParams.get('artist_slug') ??
    ''
  ).trim();

  if (
    !contentType ||
    (contentType !== 'album' && contentType !== 'track') ||
    !contentId ||
    !artistSlug
  ) {
    return null;
  }

  return { contentType, contentId, artistSlug };
}

export function readCopyrightReportOpenFromSearchParams(searchParams: URLSearchParams): boolean {
  const raw = searchParams.get(COPYRIGHT_REPORT_OPEN_QUERY_PARAM);
  return raw === '1' || raw === 'true' || raw === 'open';
}

export function stripCopyrightReportOpenParams(searchParams: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  next.delete(COPYRIGHT_REPORT_OPEN_QUERY_PARAM);
  return next;
}
