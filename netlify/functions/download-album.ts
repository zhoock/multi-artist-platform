/**
 * Album zip download for purchased library.
 * GET /api/download-album?token={purchase_token}
 * or GET /api/download-album?albumId={album_slug} with Authorization.
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import { query } from './lib/db';
import { getUserIdFromEvent } from './lib/api-helpers';
import {
  getArtistUserIdForAlbumSlug,
  getViewerEmailLower,
  viewerHasPremiumAccessToArtist,
} from './lib/entitlements';
import { isAlbumOwnedByUser, isPurchaseTokenActive } from './lib/purchase-access';
import { resolveAlbumByKey } from './lib/resolve-album-key';
import {
  buildAlbumZipFileName,
  buildZipEntryFileName,
  resolveTrackPublicUrl,
} from './lib/track-storage';

async function buildZipBuffer(
  archive: archiver.Archiver,
  passThrough: PassThrough
): Promise<Buffer> {
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    passThrough.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    passThrough.on('end', () => resolve(Buffer.concat(chunks)));
    passThrough.on('error', reject);
    archive.on('error', reject);
  });
}

export const handler: Handler = async (
  event: HandlerEvent
): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
}> => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed. Use GET.' }),
    };
  }

  try {
    const purchaseToken = event.queryStringParameters?.token?.trim();
    const albumIdParam = event.queryStringParameters?.albumId?.trim();
    const authUserId = getUserIdFromEvent(event);

    let purchaseRowId: string | null = null;
    let resolvedAlbumId: string;

    if (purchaseToken) {
      const activePurchase = await isPurchaseTokenActive(purchaseToken);
      if (!activePurchase) {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Purchase not found or access revoked' }),
        };
      }
      purchaseRowId = activePurchase.id;
      resolvedAlbumId = activePurchase.albumId;
    } else if (authUserId && albumIdParam) {
      const ownerId = await getArtistUserIdForAlbumSlug(albumIdParam);
      if (!ownerId) {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Album not found' }),
        };
      }
      const emailLower = await getViewerEmailLower(authUserId);
      const purchased = await isAlbumOwnedByUser(authUserId, emailLower, albumIdParam);
      const subscribed = await viewerHasPremiumAccessToArtist(authUserId, ownerId);
      if (!purchased && !subscribed) {
        return {
          statusCode: 403,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'Download not allowed: purchase this album or subscribe for access',
          }),
        };
      }
      resolvedAlbumId = albumIdParam;
    } else {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error:
            'Provide purchase token: ?token=... or signed-in download: ?albumId=... with Authorization',
        }),
      };
    }

    const album = await resolveAlbumByKey(resolvedAlbumId);

    if (!album) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Album not found' }),
      };
    }

    const tracksResult = await query<{
      track_id: string;
      title: string;
      src: string | null;
      order_index: number;
    }>(
      `SELECT track_id, title, src, order_index
       FROM tracks
       WHERE album_id = $1::uuid AND src IS NOT NULL
       ORDER BY order_index ASC`,
      [album.id]
    );

    if (tracksResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No downloadable tracks found for this album' }),
      };
    }

    // Файлы лежат в storage владельца альбома, не у слушателя/подписчика.
    const storageUserId = album.userId || null;
    const archive = archiver('zip', { zlib: { level: 1 } });
    const passThrough = new PassThrough();
    const zipBufferPromise = buildZipBuffer(archive, passThrough);
    archive.pipe(passThrough);

    let appendedCount = 0;

    for (const track of tracksResult.rows) {
      if (!track.src) {
        continue;
      }

      const publicUrl = await resolveTrackPublicUrl(track.src, album.albumSlug, storageUserId);
      if (!publicUrl) {
        continue;
      }

      const fileResponse = await fetch(publicUrl, { signal: AbortSignal.timeout(25_000) });
      if (!fileResponse.ok) {
        continue;
      }

      const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());
      const entryName = buildZipEntryFileName(
        track.order_index,
        track.track_id,
        track.title,
        track.src
      );
      archive.append(fileBuffer, { name: entryName });
      appendedCount += 1;
    }

    if (appendedCount === 0) {
      archive.abort();
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Track files not found in storage' }),
      };
    }

    await archive.finalize();
    const zipBuffer = await zipBufferPromise;
    const zipFileName = buildAlbumZipFileName(album.artist, album.album);

    if (purchaseRowId) {
      query(
        `UPDATE purchases
         SET download_count = download_count + $2,
             last_downloaded_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [purchaseRowId, appendedCount]
      ).catch((error) => {
        console.error('❌ [download-album] Failed to update download count:', error);
      });
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(zipBuffer.length),
        'Content-Disposition': `attachment; filename="${zipFileName}"; filename*=UTF-8''${encodeURIComponent(zipFileName)}`,
        'Cache-Control': 'no-cache',
      },
      body: zipBuffer.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (error) {
    console.error('❌ [download-album] Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
    };
  }
};
