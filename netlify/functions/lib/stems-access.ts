/**
 * Stem read access: entitlement gate + service-role Storage reads.
 * Business rule: viewerCanAccessStems → viewerHasPremiumAccessToArtist (single source of truth).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { viewerHasPremiumAccessToArtist } from './entitlements';
import { getStemsFolderPath, getStemStoragePath } from './stem-storage-path-shared';

export {
  getStemsFolderPath,
  getStemStoragePath,
  STEMS_MANIFEST_FILE,
} from './stem-storage-path-shared';

export const STORAGE_BUCKET_NAME = 'user-media';
export const STEM_ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;

export interface StemMetaDto {
  id: string;
  name: string;
  category: string;
  file: string;
  size?: number;
  originalFileName?: string;
}

const STEM_CATEGORIES = new Set(['drums', 'bass', 'guitar', 'keys', 'vocals', 'fx', 'other']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_SEGMENT_RE = /^[a-zA-Z0-9._-]+$/;

function getStemAccessSecret(): string | null {
  return process.env.JWT_SECRET?.trim() || null;
}

export function createSupabaseAdminClient(): SupabaseClient | null {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/** Thin wrapper — do not duplicate premium/archive logic here. */
export async function viewerCanAccessStems(
  viewerUserId: string | null,
  artistUserId: string | null | undefined
): Promise<boolean> {
  return viewerHasPremiumAccessToArtist(viewerUserId, artistUserId);
}

export function assertArtistUserId(value: string): string {
  const trimmed = value.trim();
  if (!UUID_RE.test(trimmed)) {
    throw new Error('Invalid artistUserId');
  }
  return trimmed;
}

export function assertSafeStemSegment(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed || !SAFE_SEGMENT_RE.test(trimmed)) {
    throw new Error(`Invalid ${field}`);
  }
  return trimmed;
}

function parseStemMeta(raw: unknown): StemMetaDto | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.id !== 'string' || !record.id.trim()) return null;
  if (typeof record.name !== 'string' || !record.name.trim()) return null;
  if (typeof record.category !== 'string' || !STEM_CATEGORIES.has(record.category)) return null;
  if (typeof record.file !== 'string' || !record.file.trim()) return null;
  try {
    assertSafeStemSegment(record.file, 'stem file');
  } catch {
    return null;
  }
  return {
    id: record.id,
    name: record.name,
    category: record.category,
    file: record.file,
    size: typeof record.size === 'number' ? record.size : undefined,
    originalFileName:
      typeof record.originalFileName === 'string' ? record.originalFileName : undefined,
  };
}

function parseManifest(parsed: unknown): StemMetaDto[] | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const { stems } = parsed as { stems?: unknown };
  if (!Array.isArray(stems)) return null;
  return stems.map(parseStemMeta).filter((s): s is StemMetaDto => s !== null);
}

export async function fetchStemManifestFromStorage(
  artistUserId: string,
  albumId: string,
  trackId: string
): Promise<StemMetaDto[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error('Storage is not configured');
  }

  const storagePath = `${getStemsFolderPath(artistUserId, albumId, trackId)}/stems.json`;
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET_NAME).download(storagePath);

  if (error || !data) {
    return [];
  }

  const text = await data.text();
  try {
    return parseManifest(JSON.parse(text)) ?? [];
  } catch {
    return [];
  }
}

export function createStemTrackAccessToken(
  artistUserId: string,
  albumId: string,
  trackId: string
): { token: string; expiresAt: number } {
  const secret = getStemAccessSecret();
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }

  const expiresAt = Date.now() + STEM_ACCESS_TOKEN_TTL_MS;
  const payload = `${artistUserId}:${albumId}:${trackId}:${expiresAt}`;
  const token = createHmac('sha256', secret).update(payload).digest('base64url');
  return { token, expiresAt };
}

export function verifyStemTrackAccessToken(
  token: string,
  artistUserId: string,
  albumId: string,
  trackId: string,
  expiresAt: number
): boolean {
  const secret = getStemAccessSecret();
  if (!secret || !token.trim()) return false;
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;

  const payload = `${artistUserId}:${albumId}:${trackId}:${expiresAt}`;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');

  try {
    const a = Buffer.from(token.trim());
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function downloadStemFileFromStorage(
  artistUserId: string,
  albumId: string,
  trackId: string,
  fileName: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error('Storage is not configured');
  }

  const storagePath = getStemStoragePath(artistUserId, albumId, trackId, fileName);
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET_NAME).download(storagePath);

  if (error || !data) {
    return null;
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const contentType =
    ext === 'mp3'
      ? 'audio/mpeg'
      : ext === 'wav'
        ? 'audio/wav'
        : ext === 'ogg'
          ? 'audio/ogg'
          : ext === 'flac'
            ? 'audio/flac'
            : ext === 'm4a' || ext === 'aac'
              ? 'audio/mp4'
              : 'application/octet-stream';

  return { buffer, contentType };
}
