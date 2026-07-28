import { createReadStream, promises as fs } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { pipelineTrace } from './pipelineTrace.js';
import type { PipelineStorage } from '../pipeline/types.js';

const BUCKET = 'user-media';

export function createPipelineStorage(): PipelineStorage {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    async downloadToFile(storagePath, localPath) {
      pipelineTrace('storage.download start', { storagePath, localPath });
      const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
      if (error || !data) {
        throw new Error(`Download failed for ${storagePath}: ${error?.message ?? 'no data'}`);
      }
      const buf = Buffer.from(await data.arrayBuffer());
      await fs.writeFile(localPath, buf);
      pipelineTrace('storage.download completed', { storagePath, bytes: buf.length });
    },

    async uploadFile(storagePath, localPath, contentType) {
      pipelineTrace('storage.upload start', { storagePath, localPath, contentType });
      const stream = createReadStream(localPath);
      const { error } = await supabase.storage.from(BUCKET).upload(storagePath, stream, {
        upsert: true,
        contentType,
      });
      if (error) {
        throw new Error(`Upload failed for ${storagePath}: ${error.message}`);
      }
      pipelineTrace('storage.upload completed', { storagePath });
    },
  };
}

export function buildPublicStorageUrl(storagePath: string): string | null {
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  if (!supabaseUrl) return null;
  const clean = storagePath.replace(/^\/+/, '');
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${clean}`;
}
