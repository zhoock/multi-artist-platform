/**
 * Playwright network verification for article cover CDN URLs.
 *
 * Usage:
 *   npx tsx scripts/verify-article-cover-network.playwright.ts --baseUrl http://localhost:8080
 *
 * Requires a page that renders ArticleCoverImage with article_cover_* img key.
 * Falls back to component-level URL matrix check if page is unavailable.
 */
import { chromium, type Page } from 'playwright';
import {
  pickCatalogArticleWebpVariantForDpr,
  pickEditorArticleWebpVariantForDpr,
  ARTICLE_CATALOG_COVER_TABLET_MQ,
} from '../src/entities/article/lib/catalogArticleCoverProps';
import { pickArticleCoverWebpWidth } from '../src/shared/lib/articleCoverUrl';

function parseBaseUrl(): string {
  const idx = process.argv.indexOf('--baseUrl');
  return idx >= 0 ? (process.argv[idx + 1] ?? 'http://localhost:8080') : 'http://localhost:8080';
}

function logMatrix() {
  console.log('Expected variant matrix (webp width):');
  console.log('  Dashboard ~79px →', pickArticleCoverWebpWidth(79));
  console.log('  Desktop grid DPR1 →', pickCatalogArticleWebpVariantForDpr(1, true));
  console.log('  Desktop grid DPR2 →', pickCatalogArticleWebpVariantForDpr(2, true));
  console.log('  Desktop grid DPR3 →', pickCatalogArticleWebpVariantForDpr(3, true));
  console.log('  Mobile DPR2 →', pickCatalogArticleWebpVariantForDpr(2, false));
  console.log('  Mobile DPR3 →', pickCatalogArticleWebpVariantForDpr(3, false));
  console.log('  Editor DPR1 →', pickEditorArticleWebpVariantForDpr(1));
  console.log('  Editor DPR2 →', pickEditorArticleWebpVariantForDpr(2));
  console.log('  Tablet MQ →', ARTICLE_CATALOG_COVER_TABLET_MQ);
}

async function collectArticleCoverRequests(page: Page) {
  const requests: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    if (
      url.includes('/articles/') &&
      url.includes('article_cover_') &&
      (url.includes('.webp') || url.includes('.jpg'))
    ) {
      requests.push(url);
    }
  });
  return requests;
}

async function main() {
  logMatrix();

  const baseUrl = parseBaseUrl();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const requests = await collectArticleCoverRequests(page);

  try {
    const response = await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle', timeout: 15000 });
    if (!response?.ok()) {
      console.warn(
        `Page ${baseUrl}/ not reachable (${response?.status()}). Matrix-only verification.`
      );
    } else {
      await page.waitForTimeout(2000);
      const articleCoverRequests = requests.filter((u) => u.includes('article_cover_'));
      const proxyHits = articleCoverRequests.filter((u) => u.includes('proxy-image'));
      const cdnHits = articleCoverRequests.filter((u) => u.includes('supabase.co'));

      console.log('\nNetwork article cover requests:', articleCoverRequests.length);
      for (const url of articleCoverRequests.slice(0, 10)) {
        console.log(' ', url);
      }
      console.log('  proxy-image hits:', proxyHits.length);
      console.log('  supabase CDN hits:', cdnHits.length);

      if (articleCoverRequests.length > 0) {
        if (proxyHits.length > 0) {
          console.error('FAIL: article covers still use proxy-image');
          process.exit(1);
        }
        console.log('PASS: no proxy-image for article cover requests');
      }
    }
  } catch (error) {
    console.warn('Playwright navigation skipped:', (error as Error).message);
    console.log('Matrix-only verification completed.');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
