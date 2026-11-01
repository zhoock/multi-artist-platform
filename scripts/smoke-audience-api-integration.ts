#!/usr/bin/env npx tsx
/**
 * Local integration smoke for audience API handlers (uses DATABASE_URL + JWT_SECRET from .env).
 * Does not start HTTP server. One test play row is inserted then deleted.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import pg from 'pg';
import type { HandlerEvent } from '@netlify/functions';
import { generateToken } from '../netlify/functions/lib/jwt';
import { handler as audienceHandler } from '../netlify/functions/artist-audience';
import { handler as recordHandler } from '../netlify/functions/record-qualified-play';

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

const { Client } = pg;

async function pickArtist(): Promise<{ userId: string; email: string }> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const r = await client.query(
      `SELECT u.id::text AS user_id, COALESCE(u.email, 'artist@local.test') AS email
       FROM users u
       INNER JOIN albums al ON al.user_id = u.id
       INNER JOIN tracks tr ON tr.album_id = al.id
       WHERE u.account_type = 'artist'
       LIMIT 1`
    );
    if (!r.rows[0]) throw new Error('No artist user in DB');
    return { userId: r.rows[0].user_id, email: r.rows[0].email };
  } finally {
    await client.end();
  }
}

async function pickTrackForArtist(artistUserId: string) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const r = await client.query(
      `SELECT a.album_id AS album_slug, t.track_id AS logical_track_id, t.duration
       FROM tracks t
       INNER JOIN albums a ON a.id = t.album_id
       WHERE a.user_id = $1::uuid
       LIMIT 1`,
      [artistUserId]
    );
    if (!r.rows[0]) throw new Error('No track for artist smoke test');
    return r.rows[0] as { album_slug: string; logical_track_id: string; duration: number };
  } finally {
    await client.end();
  }
}

function authEvent(
  method: string,
  path: string,
  token: string,
  query?: Record<string, string>,
  body?: unknown
): HandlerEvent {
  return {
    httpMethod: method,
    path,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    queryStringParameters: query ?? null,
    body: body ? JSON.stringify(body) : null,
    isBase64Encoded: false,
  } as HandlerEvent;
}

async function main() {
  if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
    console.error('Need DATABASE_URL and JWT_SECRET');
    process.exit(1);
  }

  const artist = await pickArtist();
  const artistToken = generateToken(artist.userId, artist.email, 'user', 'artist');
  const listenerToken = generateToken(artist.userId, artist.email, 'user', 'listener');

  const periods = ['7d', '30d', '90d'] as const;
  for (const period of periods) {
    const res = await audienceHandler(
      authEvent('GET', '/api/artist-audience', artistToken, { period }),
      {} as never
    );
    if (res?.statusCode !== 200) {
      console.error(`FAIL artist-audience ${period}:`, res?.statusCode, res?.body);
      process.exit(2);
    }
    console.log(`GET artist-audience?period=${period}: 200`);
  }

  const denied = await audienceHandler(
    authEvent('GET', '/api/artist-audience', listenerToken, { period: '30d' }),
    {} as never
  );
  if (denied?.statusCode !== 403) {
    console.error('FAIL listener should get 403, got', denied?.statusCode);
    process.exit(3);
  }
  console.log('GET artist-audience as listener: 403');

  const track = await pickTrackForArtist(artist.userId);
  const sessionId = crypto.randomUUID();
  const anonId = '00000000-0000-4000-8000-000000000077';
  const recordBody = {
    albumId: track.album_slug,
    trackId: track.logical_track_id,
    playbackSessionId: sessionId,
    durationListenedSeconds: 30,
    listenerAnonId: anonId,
  };

  const recordRes = await recordHandler(
    {
      ...authEvent('POST', '/api/record-qualified-play', '', {}),
      headers: {
        'content-type': 'application/json',
        'x-listener-anon-id': anonId,
      },
      body: JSON.stringify(recordBody),
    } as HandlerEvent,
    {} as never
  );

  if (recordRes?.statusCode !== 200) {
    console.error('FAIL record-qualified-play:', recordRes?.statusCode, recordRes?.body);
    process.exit(4);
  }
  console.log('POST record-qualified-play:', recordRes?.statusCode, recordRes?.body);

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  await client.query(`DELETE FROM qualified_track_plays WHERE playback_session_id = $1::uuid`, [
    sessionId,
  ]);
  await client.end();
  console.log('Cleaned up test play row');

  console.log('Integration smoke OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
