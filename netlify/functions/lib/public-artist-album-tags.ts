import { query } from './db';

type AlbumTagRow = {
  user_id: string;
  tag: string;
};

/** Tags from `release.tags` on published, public albums — deduped per user, stable order. */
export async function fetchPublishedAlbumTagsByUserIds(
  userIds: string[]
): Promise<Map<string, string[]>> {
  if (userIds.length === 0) return new Map();

  const { rows } = await query<AlbumTagRow>(
    `SELECT a.user_id::text AS user_id,
            btrim(tag.value) AS tag
     FROM albums a
     CROSS JOIN LATERAL jsonb_array_elements_text(
       CASE
         WHEN jsonb_typeof(a.release->'tags') = 'array' THEN a.release->'tags'
         ELSE '[]'::jsonb
       END
     ) AS tag(value)
     WHERE a.user_id = ANY($1::uuid[])
       AND a.is_published = true
       AND COALESCE(a.is_public, true) = true
       AND btrim(tag.value) <> ''
     ORDER BY a.user_id, a.updated_at DESC, tag.value ASC`,
    [userIds]
  );

  const tagsByUser = new Map<string, string[]>();
  const seenKeysByUser = new Map<string, Set<string>>();

  for (const row of rows) {
    const tag = row.tag?.trim();
    if (!tag) continue;

    const dedupeKey = tag.toLowerCase();
    let seen = seenKeysByUser.get(row.user_id);
    if (!seen) {
      seen = new Set<string>();
      seenKeysByUser.set(row.user_id, seen);
      tagsByUser.set(row.user_id, []);
    }
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    tagsByUser.get(row.user_id)!.push(tag);
  }

  return tagsByUser;
}
