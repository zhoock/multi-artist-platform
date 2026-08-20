/**
 * Verifies article cover upload generates 8 canonical 3:2 variants in Storage.
 *
 * Usage: tsx scripts/verify-article-cover-upload.ts
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env
 */
import 'dotenv/config';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import {
  generateArticleCoverVariants,
  articleCoverHeightForWidth,
  ARTICLE_COVER_VARIANT_WIDTHS,
  ARTICLE_COVER_CACHE_CONTROL,
} from '../netlify/functions/lib/image-processor';

const BUCKET = 'user-media';

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = process.env.CURRENT_USER_ID || process.env.PAYMENT_SUCCESS_PREVIEW_USER_ID;

  if (!supabaseUrl || !serviceKey || !userId) {
    console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or CURRENT_USER_ID in .env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const baseName = `article_cover_${randomUUID()}_verify_upload`;
  const portraitSource = await sharp({
    create: { width: 900, height: 1400, channels: 3, background: { r: 30, g: 120, b: 200 } },
  })
    .jpeg()
    .toBuffer();

  console.log('Source: portrait 900×1400 (not 3:2)');
  console.log('Cache policy:', ARTICLE_COVER_CACHE_CONTROL);

  const variants = await generateArticleCoverVariants(portraitSource, baseName);
  console.log('Generated keys:', Object.keys(variants).sort().join(', '));

  const uploaded: string[] = [];
  for (const [fileName, buffer] of Object.entries(variants)) {
    const path = `users/${userId}/articles/${fileName}`;
    const contentType = fileName.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType,
      upsert: true,
      cacheControl: ARTICLE_COVER_CACHE_CONTROL,
    });
    if (error) {
      console.error('Upload failed', fileName, error.message);
      process.exit(1);
    }
    uploaded.push(path);
  }

  console.log('\nReal Storage dimensions:');
  for (const width of ARTICLE_COVER_VARIANT_WIDTHS) {
    for (const ext of ['webp', 'jpg'] as const) {
      const key = `${baseName}-${width}.${ext}`;
      const path = `users/${userId}/articles/${key}`;
      const { data, error } = await supabase.storage.from(BUCKET).download(path);
      if (error || !data) {
        console.error('Download failed', key, error?.message);
        continue;
      }
      const buf = Buffer.from(await data.arrayBuffer());
      const meta = await sharp(buf).metadata();
      const expectedH = articleCoverHeightForWidth(width);
      console.log(
        `  ${key}: ${meta.width}×${meta.height} (${buf.length} B) expected ${width}×${expectedH}`
      );
    }
  }

  console.log('\nCleanup uploaded verify files...');
  await supabase.storage.from(BUCKET).remove(uploaded);
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
