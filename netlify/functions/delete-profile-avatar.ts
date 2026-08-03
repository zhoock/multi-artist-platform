/**
 * Удаление файлов аватара из Supabase Storage (папка `users/{id}/profile/`, варианты `profile-…`, не `cover-*`)
 * с service role — клиентский anon key часто не может удалять по политикам.
 *
 * POST /api/delete-profile-avatar
 * Authorization: Bearer <token>
 */

import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import {
  createOptionsResponse,
  createErrorResponse,
  createSuccessResponse,
  requireAuth,
  unauthorizedFromAuthHeader,
} from './lib/api-helpers';
import { createSupabaseAdminClient, STORAGE_BUCKET_NAME } from './lib/supabase';
import { isProfileAvatarStorageObjectName } from '../../src/shared/lib/avatarUpload';

export const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  if (event.httpMethod !== 'POST' && event.httpMethod !== 'DELETE') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    const userId = requireAuth(event);
    if (!userId) {
      return unauthorizedFromAuthHeader(event);
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return createErrorResponse(500, 'Server storage is not configured.');
    }

    const profilePrefix = `users/${userId}/profile`;
    const { data: files, error: listError } = await supabase.storage
      .from(STORAGE_BUCKET_NAME)
      .list(profilePrefix, { limit: 200 });

    if (listError) {
      console.error('[delete-profile-avatar] list error:', listError);
      return createErrorResponse(500, listError.message);
    }

    const profileFiles = (files || []).filter(
      (f) => f.name && isProfileAvatarStorageObjectName(String(f.name))
    );

    if (profileFiles.length === 0) {
      return createSuccessResponse({ deleted: 0, paths: [] as string[] }, 200);
    }

    const paths = profileFiles.map((f) => `${profilePrefix}/${f.name}`);
    const { error: removeError } = await supabase.storage.from(STORAGE_BUCKET_NAME).remove(paths);

    if (removeError) {
      console.error('[delete-profile-avatar] remove error:', removeError);
      return createErrorResponse(500, removeError.message);
    }

    return createSuccessResponse({ deleted: paths.length, paths }, 200);
  } catch (error) {
    console.error('[delete-profile-avatar] Error:', error);
    return createErrorResponse(
      500,
      error instanceof Error ? error.message : 'Internal server error'
    );
  }
};
