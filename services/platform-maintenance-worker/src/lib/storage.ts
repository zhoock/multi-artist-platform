import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const STORAGE_BUCKET_NAME = 'user-media';

export function createSupabaseAdminClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function listAllFilePathsRecursive(
  supabase: SupabaseClient,
  prefix: string
): Promise<string[]> {
  const out: string[] = [];
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET_NAME).list(prefix, {
    limit: 1000,
  });
  if (error) {
    throw new Error(`Storage list failed for "${prefix}": ${error.message}`);
  }
  if (!data?.length) return out;

  for (const item of data) {
    const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.metadata === null) {
      const sub = await listAllFilePathsRecursive(supabase, itemPath);
      out.push(...sub);
    } else {
      out.push(itemPath);
    }
  }
  return out;
}

export async function removeStoragePaths(paths: string[]): Promise<number> {
  const uniq = [...new Set(paths.map((p) => p.replace(/^\/+/, '').trim()).filter(Boolean))];
  if (uniq.length === 0) return 0;

  const supabase = createSupabaseAdminClient();
  let removed = 0;
  const chunkSize = 100;

  for (let i = 0; i < uniq.length; i += chunkSize) {
    const batch = uniq.slice(i, i + chunkSize);
    const { error } = await supabase.storage.from(STORAGE_BUCKET_NAME).remove(batch);
    if (error) {
      throw new Error(`Storage remove failed: ${error.message}`);
    }
    removed += batch.length;
  }

  return removed;
}
