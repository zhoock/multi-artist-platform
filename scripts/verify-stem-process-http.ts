#!/usr/bin/env npx tsx
/** Calls /api/stems/process through Netlify Dev (localhost:8888) like the browser UI. */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

import { generateToken } from '../netlify/functions/lib/jwt';
import { buildStemMasterStoragePath } from '../src/shared/lib/stems/stemStoragePaths';

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

async function main() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const r = await client.query(
    `SELECT u.id::text AS uid, u.email, a.album_id AS aslug, t.track_id AS tid
     FROM users u
     JOIN albums a ON a.user_id = u.id
     JOIN tracks t ON t.album_id = a.id
     WHERE u.account_type = 'artist' AND COALESCE(u.is_email_verified, false) = true
     LIMIT 1`
  );
  await client.end();

  const { uid, email, aslug, tid } = r.rows[0];
  const token = generateToken(uid, email, 'user', 'artist');
  const masterFileName = `stem-http-${Date.now()}.wav`;
  const masterPath = buildStemMasterStoragePath(uid, aslug, tid, masterFileName);

  const workDir = await mkdtemp(join(tmpdir(), 'stem-http-'));
  const wavPath = join(workDir, masterFileName);
  execSync(`ffmpeg -y -f lavfi -i "sine=frequency=440:duration=8" -ac 1 -ar 44100 "${wavPath}"`, {
    stdio: 'ignore',
  });

  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    { auth: { persistSession: false } }
  );
  const wav = readFileSync(wavPath);
  await supabase.storage.from('user-media').upload(masterPath, wav, {
    upsert: true,
    contentType: 'audio/wav',
  });

  const res = await fetch('http://localhost:8888/api/stems/process', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ albumId: aslug, trackId: tid, masterFileName }),
  });
  const text = await res.text();
  console.log('HTTP status:', res.status);
  console.log('HTTP body:', text.slice(0, 500));
  console.log('Master bytes:', (await stat(wavPath)).size);
  await rm(workDir, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
