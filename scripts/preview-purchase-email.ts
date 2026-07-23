#!/usr/bin/env tsx
/**
 * Renders the purchase confirmation email to standalone HTML files for local review.
 *
 * Usage:
 *   npm run preview:purchase-email
 *   open dist/email-previews/purchase-email.ru.html
 *
 * Output (dist/email-previews/):
 *   purchase-email.en.html — EN
 *   purchase-email.ru.html — RU
 */

import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { buildPurchaseEmailContent } from '../netlify/functions/lib/purchase-email-template';

const OUT_DIR = path.resolve(__dirname, '..', 'dist', 'email-previews');
const LOCAL_COVER_PATH = path.resolve(__dirname, '..', 'src', 'images', 'album-placeholder.png');

const SAMPLE = {
  albumName: 'Rubber Soul',
  orderId: 'abcdef1234567890',
  siteName: 'Название сайта',
  albumCoverUrl: process.env.PREVIEW_COVER_URL || `file://${LOCAL_COVER_PATH}`,
};

const PREVIEW_VARIANTS = {
  en: {
    customerName: 'Alex',
    artistName: 'The Beatles',
    albumUrl: 'https://smolyanoechuchelko.ru/en/albums/rubber-soul',
  },
  ru: {
    customerName: 'Алексей',
    artistName: 'Смоляное Чучелко',
    albumUrl: 'https://smolyanoechuchelko.ru/albums/rubber-soul',
  },
} as const;

function assertArtistPresent(html: string, artistName: string, filename: string): void {
  if (!html.includes(artistName)) {
    throw new Error(
      `Preview ${filename} is missing artist text "${artistName}". Check artistName in preview mock data.`
    );
  }
  if (!html.includes('class="sc-album-artist"')) {
    throw new Error(`Preview ${filename} is missing sc-album-artist markup.`);
  }
}

function writeHtml(filename: string, html: string): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const fullPath = path.join(OUT_DIR, filename);
  writeFileSync(fullPath, html, 'utf-8');
  console.log(`✓ wrote ${path.relative(process.cwd(), fullPath)}`);
}

function removeStalePreview(filename: string): void {
  const fullPath = path.join(OUT_DIR, filename);
  try {
    unlinkSync(fullPath);
    console.log(`✓ removed stale ${path.relative(process.cwd(), fullPath)}`);
  } catch {
    // File did not exist — nothing to clean up.
  }
}

function main(): void {
  for (const stale of [
    'purchase-email.before.html',
    'purchase-email.after.html',
    'purchase-email.after-ru.html',
    'purchase-email.after-no-cover.html',
    'purchase-email.no-cover.html',
  ]) {
    removeStalePreview(stale);
  }

  const en = buildPurchaseEmailContent({
    locale: 'en',
    customerName: PREVIEW_VARIANTS.en.customerName,
    albumName: SAMPLE.albumName,
    artistName: PREVIEW_VARIANTS.en.artistName,
    orderId: SAMPLE.orderId,
    albumUrl: PREVIEW_VARIANTS.en.albumUrl,
    albumCoverUrl: SAMPLE.albumCoverUrl,
    siteName: SAMPLE.siteName,
  });
  assertArtistPresent(en.html, PREVIEW_VARIANTS.en.artistName, 'purchase-email.en.html');
  writeHtml('purchase-email.en.html', en.html);

  const ru = buildPurchaseEmailContent({
    locale: 'ru',
    customerName: PREVIEW_VARIANTS.ru.customerName,
    albumName: SAMPLE.albumName,
    artistName: PREVIEW_VARIANTS.ru.artistName,
    orderId: SAMPLE.orderId,
    albumUrl: PREVIEW_VARIANTS.ru.albumUrl,
    albumCoverUrl: SAMPLE.albumCoverUrl,
    siteName: SAMPLE.siteName,
  });
  assertArtistPresent(ru.html, PREVIEW_VARIANTS.ru.artistName, 'purchase-email.ru.html');
  writeHtml('purchase-email.ru.html', ru.html);

  console.log(
    `\nArtist preview: EN → "${PREVIEW_VARIANTS.en.artistName}", RU → "${PREVIEW_VARIANTS.ru.artistName}"`
  );

  console.log('\nOpen dist/email-previews/purchase-email.ru.html in a browser.');
}

main();
