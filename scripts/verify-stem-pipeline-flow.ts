#!/usr/bin/env npx tsx
/**
 * Real stem pipeline: upload master → process-stem → storage checks → manifest fields.
 * Requires DATABASE_URL, JWT_SECRET, SUPABASE_* in .env
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { HandlerEvent } from '@netlify/functions';
import pg from 'pg';

import { generateToken } from '../netlify/functions/lib/jwt';
import { handler as processStemHandler } from '../netlify/functions/process-stem';
import { handler as stemsManifestHandler } from '../netlify/functions/stems-manifest';
import {
  buildStemMasterStoragePath,
  buildStemPlaybackFileName,
  getStemStoragePath,
} from '../src/shared/lib/stems/stemStoragePaths';

const envPath = join(__dirname, '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[m[1].trim()] = v;
    }
  }
}

const BUCKET = 'user-media';

function authEvent(method: string, path: string, token: string, body?: unknown): HandlerEvent {
  return {
    httpMethod: method,
    path,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    queryStringParameters: null,
    body: body ? JSON.stringify(body) : null,
    isBase64Encoded: false,
  } as HandlerEvent;
}

async function pickVerifiedArtist(): Promise<{
  userId: string;
  email: string;
  albumId: string;
  trackId: string;
}> {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const r = await client.query(
      `SELECT u.id::text AS user_id, u.email,
              a.album_id AS album_slug, t.track_id AS logical_track_id
       FROM users u
       INNER JOIN albums a ON a.user_id = u.id
       INNER JOIN tracks t ON t.album_id = a.id
       WHERE u.account_type = 'artist'
         AND COALESCE(u.is_email_verified, false) = true
       LIMIT 1`
    );
    if (!r.rows[0]) throw new Error('No verified artist with tracks in DB');
    return {
      userId: r.rows[0].user_id,
      email: r.rows[0].email,
      albumId: r.rows[0].album_slug,
      trackId: r.rows[0].logical_track_id,
    };
  } finally {
    await client.end();
  }
}

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function objectExists(storagePath: string): Promise<boolean> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  return !error && Boolean(data);
}

async function objectBytes(storagePath: string): Promise<number> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) throw new Error(`download failed: ${storagePath} ${error?.message}`);
  const buf = Buffer.from(await data.arrayBuffer());
  return buf.length;
}

async function main() {
  if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
    console.error('Need DATABASE_URL and JWT_SECRET');
    process.exit(1);
  }

  delete process.env.LAMBDA_TASK_ROOT;
  delete process.env.FFMPEG_PATH;
  delete process.env.FFPROBE_PATH;

  const artist = await pickVerifiedArtist();
  const token = generateToken(artist.userId, artist.email, 'user', 'artist');
  const masterFileName = `stem-verify-${Date.now()}.wav`;
  const masterPath = buildStemMasterStoragePath(
    artist.userId,
    artist.albumId,
    artist.trackId,
    masterFileName
  );
  const playbackFileName = buildStemPlaybackFileName(masterFileName);
  const playbackPath = getStemStoragePath(
    artist.userId,
    artist.albumId,
    artist.trackId,
    playbackFileName
  );

  const workDir = await mkdtemp(join(tmpdir(), 'stem-verify-'));
  const wavPath = join(workDir, masterFileName);
  execSync(`ffmpeg -y -f lavfi -i "sine=frequency=523:duration=45" -ac 2 -ar 48000 "${wavPath}"`, {
    stdio: 'ignore',
  });
  const { stat } = await import('node:fs/promises');
  const masterBytes = (await stat(wavPath)).size;

  const supabase = supabaseAdmin();
  const wavBuffer = readFileSync(wavPath);
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(masterPath, wavBuffer, {
    upsert: true,
    contentType: 'audio/wav',
  });
  if (uploadError) throw new Error(uploadError.message);

  console.log('✓ master uploaded', { masterPath, masterBytes });

  const process1 = await processStemHandler(
    authEvent('POST', '/api/stems/process', token, {
      albumId: artist.albumId,
      trackId: artist.trackId,
      masterFileName,
    }),
    {} as never
  );

  if (process1.statusCode !== 200) {
    console.error('process-stem failed', process1.statusCode, process1.body);
    process.exit(2);
  }

  const processBody = JSON.parse(process1.body ?? '{}') as {
    data?: { fileName: string; fileSize: number };
  };
  const opusBytesReported = processBody.data?.fileSize ?? 0;
  const opusBytes = await objectBytes(playbackPath);

  console.log('✓ process-stem ok', {
    status: process1.statusCode,
    fileName: processBody.data?.fileName,
    opusBytesReported,
    opusBytes,
  });

  const process2 = await processStemHandler(
    authEvent('POST', '/api/stems/process', token, {
      albumId: artist.albumId,
      trackId: artist.trackId,
      masterFileName,
    }),
    {} as never
  );
  console.log('✓ duplicate process-stem', {
    status: process2.statusCode,
    body: process2.body?.slice(0, 200),
  });

  const masterStillThere = await objectExists(masterPath);
  const opusThere = await objectExists(playbackPath);

  console.log('✓ storage state', {
    masterStillThere,
    opusThere,
    masterBytes,
    opusBytes,
    ratio: masterBytes > 0 ? (masterBytes / opusBytes).toFixed(2) : null,
  });

  if (masterStillThere) {
    console.error('FAIL: master should be deleted');
    process.exit(3);
  }
  if (!opusThere) {
    console.error('FAIL: opus missing');
    process.exit(4);
  }

  const manifestRes = await stemsManifestHandler(
    {
      httpMethod: 'GET',
      path: '/api/stems/manifest',
      headers: { authorization: `Bearer ${token}` },
      queryStringParameters: {
        artistUserId: artist.userId,
        albumId: artist.albumId,
        trackId: artist.trackId,
      },
      body: null,
      isBase64Encoded: false,
    } as HandlerEvent,
    {} as never
  );

  console.log('manifest status', manifestRes.statusCode);

  await supabase.storage.from(BUCKET).remove([playbackPath]);
  await rm(workDir, { recursive: true, force: true });

  console.log('\n=== SUMMARY ===');
  console.log(
    JSON.stringify({ masterBytes, opusBytes, opusBytesReported, masterDeleted: true }, null, 2)
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
