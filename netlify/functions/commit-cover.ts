/**
 * Netlify Serverless Function для коммита обложки из черновиков в финальный путь
 *
 * Использование:
 * POST /api/albums/cover/commit
 * Authorization: Bearer <token>
 * Content-Type: application/json
 * Body: {
 *   draftKey: string (ключ черновика из upload-cover-draft),
 *   albumId: string (ID альбома)
 * }
 *
 * Возвращает:
 * {
 *   success: boolean,
 *   data?: {
 *     url: string (финальный URL обложки),
 *     storagePath: string (финальный путь в Storage)
 *   },
 *   error?: string
 * }
 *
 * Data integrity: does NOT delete the previous live cover. OLD cleanup runs in albums.ts
 * only after a successful DB save pointing at the new baseName.
 */

import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import {
  createOptionsResponse,
  createErrorResponse,
  createSuccessResponse,
  requireAuth,
  unauthorizedFromAuthHeader,
  parseJsonBody,
} from './lib/api-helpers';
import { extractBaseName } from './lib/image-processor';
import { createSupabaseAdminClient, STORAGE_BUCKET_NAME } from './lib/supabase';

const COVER_VARIANT_CACHE_CONTROL = '31536000, immutable';

interface CommitCoverRequest {
  draftKey: string;
  albumId: string;
  artist?: string;
  album?: string;
  lang?: 'ru' | 'en';
}

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    const userId = requireAuth(event);
    if (!userId) {
      return unauthorizedFromAuthHeader(event);
    }

    const { guardUserEmailVerifiedForUpload } = await import('./lib/email-verification');
    const emailGuardResponse = await guardUserEmailVerifiedForUpload(userId);
    if (emailGuardResponse) {
      return emailGuardResponse;
    }

    const body = parseJsonBody<Partial<CommitCoverRequest>>(event.body, {});

    const { draftKey, albumId } = body;

    if (!draftKey || !albumId) {
      return createErrorResponse(400, 'Missing required fields: draftKey, albumId');
    }

    if (!draftKey.startsWith(`${userId}/`)) {
      return createErrorResponse(403, 'Forbidden. Draft key does not belong to current user.');
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return createErrorResponse(
        500,
        'Supabase admin client is not available. Please check environment variables.'
      );
    }

    const draftKeyParts = draftKey.split('/');
    const draftFolder = `drafts/${draftKeyParts.slice(0, -1).join('/')}`;

    const { data: draftFiles, error: listError } = await supabase.storage
      .from(STORAGE_BUCKET_NAME)
      .list(draftFolder, {
        limit: 100,
      });

    if (listError || !draftFiles || draftFiles.length === 0) {
      console.error('Draft files not found:', {
        draftKey,
        draftFolder,
        error: listError?.message,
      });
      return createErrorResponse(404, 'Draft files not found');
    }

    const coverFiles = draftFiles.filter((f) => f.name.toLowerCase().includes('cover'));

    if (coverFiles.length === 0) {
      console.error('No cover files found in draft folder:', draftFolder);
      return createErrorResponse(404, 'No cover files found in draft');
    }

    const firstFileName = coverFiles[0].name;
    const baseNameMatch = firstFileName.match(
      /^(.+?)(?:-64|-128|-448|-896|-1344)(?:\.(jpg|webp))$/
    );
    let finalBaseName: string;

    if (baseNameMatch) {
      finalBaseName = baseNameMatch[1];
    } else {
      let baseName = extractBaseName(firstFileName);
      const beforeSuffix = baseName.replace(/(?:-64|-128|-448|-896|-1344)$/, '');
      finalBaseName = beforeSuffix || `${albumId}-cover`;
    }

    const uploadedStoragePaths: string[] = [];
    const committedFileNames: string[] = [];
    const commitErrors: string[] = [];
    const draftPaths: string[] = coverFiles.map((f) => `${draftFolder}/${f.name}`);

    for (const draftFile of coverFiles) {
      const draftPath = `${draftFolder}/${draftFile.name}`;

      const { data: draftData, error: downloadError } = await supabase.storage
        .from(STORAGE_BUCKET_NAME)
        .download(draftPath);

      if (downloadError || !draftData) {
        console.error(`Failed to download draft file ${draftFile.name}:`, downloadError?.message);
        commitErrors.push(`${draftFile.name}: ${downloadError?.message || 'Download failed'}`);
        break;
      }

      const suffixMatch = draftFile.name.match(/(-\d+\.(jpg|webp))$/);
      const suffix = suffixMatch ? suffixMatch[0] : '';

      const finalFileName = suffix ? `${finalBaseName}${suffix}` : `${finalBaseName}.webp`;
      const finalPath = `users/${userId}/albums/${finalFileName}`;

      const arrayBuffer = await draftData.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);

      const contentType = finalFileName.endsWith('.webp') ? 'image/webp' : 'image/jpeg';

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET_NAME)
        .upload(finalPath, fileBuffer, {
          contentType,
          upsert: true,
          cacheControl: COVER_VARIANT_CACHE_CONTROL,
        });

      if (uploadError) {
        console.error(`Error committing ${finalFileName}:`, uploadError.message);
        commitErrors.push(`${finalFileName}: ${uploadError.message}`);
        break;
      }

      uploadedStoragePaths.push(finalPath);
      committedFileNames.push(finalFileName);
    }

    if (commitErrors.length > 0 || committedFileNames.length !== coverFiles.length) {
      if (uploadedStoragePaths.length > 0) {
        const { error: rollbackError } = await supabase.storage
          .from(STORAGE_BUCKET_NAME)
          .remove(uploadedStoragePaths);
        if (rollbackError) {
          console.warn('[commit-cover] Partial NEW rollback failed:', rollbackError.message);
        }
      }

      return createErrorResponse(
        500,
        `Failed to commit cover files: ${commitErrors.join(', ') || 'Incomplete upload'}`
      );
    }

    const { error: deleteDraftsError } = await supabase.storage
      .from(STORAGE_BUCKET_NAME)
      .remove(draftPaths);

    if (deleteDraftsError) {
      console.warn(
        '[commit-cover] Failed to delete draft files (non-critical):',
        deleteDraftsError.message
      );
    }

    const previewFileName = `${finalBaseName}-448.webp`;
    const previewPath = `users/${userId}/albums/${previewFileName}`;
    const { data: urlData } = supabase.storage.from(STORAGE_BUCKET_NAME).getPublicUrl(previewPath);

    return createSuccessResponse(
      {
        url: urlData.publicUrl,
        storagePath: previewPath,
        baseName: finalBaseName,
        variants: committedFileNames,
      },
      200
    );
  } catch (error) {
    console.error('❌ Error in commit-cover function:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : 'Unknown',
      timestamp: new Date().toISOString(),
    });
    return createErrorResponse(
      500,
      error instanceof Error ? error.message : 'Internal server error'
    );
  }
};
