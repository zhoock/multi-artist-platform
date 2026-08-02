/**
 * Browser regression: Dashboard → Public Surface sync (no page.reload assertions).
 */
import { chromium } from 'playwright';
import jwt from 'jsonwebtoken';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.E2E_BASE_URL || 'http://localhost:8080';
const SLUG = 'smolyanoe-chuchelko';
const ALBUM_ID = '23';
const USER = {
  id: 'af97f741-8dae-410b-94a6-3f828f9140a4',
  email: 'zhoock@zhoock.ru',
  name: 'Смоляное чучелко',
  role: 'admin',
  accountType: 'artist',
  isEmailVerified: true,
  preferredLanguage: 'ru',
};

const results = [];
const suffix = ` __e2e${Date.now()}`;

function report(scenario, status, evidence = '', syncPath = '') {
  results.push({ scenario, status, evidence, syncPath });
  console.log(`\n=== ${scenario}: ${status} ===`);
  if (evidence) console.log(evidence);
  if (syncPath) console.log('syncPath:', syncPath);
}

function makeToken() {
  const secret = (process.env.JWT_SECRET || '').trim();
  if (!secret) throw new Error('JWT_SECRET missing');
  return jwt.sign(
    {
      userId: USER.id,
      email: USER.email,
      role: USER.role,
      accountType: USER.accountType,
    },
    secret,
    { expiresIn: '7d' }
  );
}

async function injectAuth(page, token) {
  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
    },
    { token, user: USER }
  );
}

async function gotoPublicAlbum(page) {
  await page.goto(`${BASE}/albums/${ALBUM_ID}?artist=${SLUG}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await dismissDevOverlays(page);
  await page.waitForSelector('.album-title', { timeout: 45000 });
  await page.waitForSelector('.tracks__title-text', { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

async function gotoPublicHome(page) {
  await page.goto(`${BASE}/?artist=${SLUG}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await dismissDevOverlays(page);
  await page.waitForTimeout(1500);
}

async function dismissDevOverlays(page) {
  await page.evaluate(() => {
    document.getElementById('react-refresh-overlay')?.remove();
    document.querySelectorAll('iframe#react-refresh-overlay').forEach((el) => el.remove());
  }).catch(() => {});
}

async function openDashboardOverlay(page, tab = 'albums') {
  await dismissDevOverlays(page);
  const bg = await page.evaluate(() => ({
    pathname: location.pathname,
    search: location.search,
    hash: location.hash || '',
  }));
  // Seed modal background so /dashboard opens as overlay over current public page
  await page.evaluate((bg) => {
    sessionStorage.setItem('sc-dashboard-modal-bg', JSON.stringify(bg));
  }, bg);
  await page.goto(`${BASE}/dashboard/${tab}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await dismissDevOverlays(page);
  await page.waitForSelector('.user-dashboard__sidebar', { timeout: 45000 });
  await page.waitForTimeout(800);
}

async function closeDashboard(page) {
  await dismissDevOverlays(page);
  const closeBtn = page.locator('button.user-dashboard__close').first();
  if (await closeBtn.count()) {
    await closeBtn.click({ timeout: 10000, force: true });
  } else {
    await page.keyboard.press('Escape');
  }
  await page.waitForSelector('.user-dashboard__sidebar', { state: 'hidden', timeout: 20000 }).catch(() => {});
  // Ensure we are back on public surface URL if close navigated
  await page.waitForTimeout(1200);
  await dismissDevOverlays(page);
}

async function openEditAlbumModal(page) {
  // Expand album row if needed, click edit
  const row = page.locator('#dashboard-album-row-23, [id*="dashboard-album-row"]').filter({ hasText: /^23$|23 / }).first();
  // Prefer edit button near album title "23"
  const albumBlock = page.locator('.user-dashboard__album-item, .user-dashboard__album-row, [id^="dashboard-album-row"]').filter({ hasText: '23' }).first();
  await albumBlock.waitFor({ timeout: 20000 });
  // Click edit album (pencil) in actions
  const editBtn = albumBlock.locator('button[aria-label*="Edit Album"], button[aria-label*="Edit album"], button[aria-label*="Редактир"]').first();
  if (await editBtn.count()) {
    await editBtn.click();
  } else {
    // fallback: any edit in albums tab matching this album
    await page.locator('button[aria-label*="Edit Album"], button[aria-label*="Edit album"]').first().click();
  }
  await page.waitForSelector('input[name="album-title"]', { timeout: 20000 });
}

async function clickNextUntilSave(page) {
  for (let i = 0; i < 6; i++) {
    const save = page.locator('button.edit-album-modal__button--primary', {
      hasText: /Save changes|Сохранить|Saving/i,
    });
    if (await save.count()) {
      await save.first().click();
      await page.waitForSelector('input[name="album-title"]', { state: 'hidden', timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(1500);
      return;
    }
    const next = page.locator('button.edit-album-modal__button--primary', { hasText: /Next|Далее/i });
    await next.first().click({ timeout: 10000 });
    await page.waitForTimeout(500);
    // If validation error on step 4 designer, fill it
    const designer = page.locator('input[name="album-cover-designer"]');
    if (await designer.count()) {
      const v = await designer.inputValue();
      if (!v.trim()) {
        await designer.fill('E2E Designer');
      }
    }
  }
  throw new Error('Could not reach Save changes');
}

async function saveAlbumField(page, mutate) {
  await openEditAlbumModal(page);
  await mutate(page);
  await clickNextUntilSave(page);
}

async function readAlbumTitle(page) {
  return (await page.locator('.album-title').first().innerText()).trim();
}

async function readTrackTitles(page) {
  return page.locator('.tracks__title-text').allInnerTexts().then((xs) => xs.map((t) => t.trim()));
}

async function readReleaseDate(page) {
  const el = page.locator('.album-details__released-time').first();
  if (!(await el.count())) return '';
  return ((await el.getAttribute('dateTime')) || (await el.innerText())).trim();
}

async function readDescriptionFromHome(page) {
  // description for album 23 card
  const cards = page.locator('.albums__description');
  const texts = await cards.allInnerTexts();
  return texts.map((t) => t.trim());
}

async function readPhotographer(page) {
  const el = page.locator('.album-details__artwork-photographer').first();
  if (!(await el.count())) return '';
  return (await el.innerText()).trim();
}

async function waitForTextChange(getter, expectedIncludes, timeoutMs = 20000) {
  const start = Date.now();
  let last = '';
  while (Date.now() - start < timeoutMs) {
    last = typeof expectedIncludes === 'function' ? await getter() : await getter();
    if (typeof expectedIncludes === 'function') {
      if (expectedIncludes(last)) return last;
    } else if (String(last).includes(expectedIncludes)) {
      return last;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timeout waiting for public update. last=${JSON.stringify(last)}`);
}

async function main() {
  const token = makeToken();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  await injectAuth(page, token);

  // Warm auth
  await page.goto(`${BASE}/?artist=${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  const authed = await page.evaluate(() => !!localStorage.getItem('auth_token'));
  if (!authed) throw new Error('Auth injection failed');

  let baselineTitle = '';
  let baselineTracks = [];
  let baselineDate = '';
  let baselinePhoto = '';

  // ---------- album title ----------
  try {
    await gotoPublicAlbum(page);
    baselineTitle = await readAlbumTitle(page);
    const before = baselineTitle;
    await openDashboardOverlay(page, 'albums');
    const newTitle = `${before}${suffix}`.slice(0, 80);
    await saveAlbumField(page, async (p) => {
      await p.fill('input[name="album-title"]', newTitle);
    });
    await closeDashboard(page);
    // URL may change after rename — wait for title text without reload
    const after = await waitForTextChange(async () => {
      // if navigated, album-title still present under overlay close
      if (await page.locator('.album-title').count()) return readAlbumTitle(page);
      return '';
    }, newTitle, 25000);
    report('album title change', 'PASS', `before="${before}" after="${after}"`);
    // revert
    await openDashboardOverlay(page, 'albums');
    await saveAlbumField(page, async (p) => {
      await p.fill('input[name="album-title"]', before);
    });
    await closeDashboard(page);
    await waitForTextChange(readAlbumTitle.bind(null, page), before, 25000).catch(() => {});
  } catch (e) {
    report('album title change', 'FAIL', String(e), 'album title → EditAlbumModal save → notifyPublicSurfaceChanged/albumDetails');
  }

  // ---------- album description ----------
  try {
    await gotoPublicHome(page);
    const descsBefore = await readDescriptionFromHome(page);
    const beforeJoined = descsBefore.join(' | ');
    await openDashboardOverlay(page, 'albums');
    let oldDesc = '';
    const newDesc = `E2E desc${suffix}`;
    await saveAlbumField(page, async (p) => {
      oldDesc = await p.locator('textarea[name="description"]').inputValue();
      await p.fill('textarea[name="description"]', newDesc);
    });
    await closeDashboard(page);
    const afterJoined = await waitForTextChange(
      async () => (await readDescriptionFromHome(page)).join(' | '),
      newDesc,
      25000
    );
    report('album description change', 'PASS', `before~="${beforeJoined.slice(0,120)}" after~="${afterJoined.slice(0,120)}"`);
    // revert
    await openDashboardOverlay(page, 'albums');
    await saveAlbumField(page, async (p) => {
      await p.fill('textarea[name="description"]', oldDesc || descsBefore[0] || 'Альбом Смоляного Чучелка 23');
    });
    await closeDashboard(page);
  } catch (e) {
    report('album description change', 'FAIL', String(e), 'description → EditAlbumModal → home albums__description sync');
  }

  // ---------- cover change ----------
  report('cover change', 'SKIP', 'No dedicated test image fixture provided; skipping invasive cover upload');

  // ---------- release date ----------
  try {
    await gotoPublicAlbum(page);
    // ensure we're on album 23 (title rename may have moved URL)
    if (!page.url().includes('/albums/')) {
      await gotoPublicAlbum(page);
    }
    baselineDate = await readReleaseDate(page);
    const before = baselineDate;
    await openDashboardOverlay(page, 'albums');
    let oldDateInput = '';
    // Use a nearby different date then revert
    const newIso = '2022-01-24';
    const newDisplay = '24/01/2022';
    await saveAlbumField(page, async (p) => {
      oldDateInput = await p.locator('input[name="release-date"]').inputValue();
      await p.fill('input[name="release-date"]', newDisplay);
    });
    await closeDashboard(page);
    const after = await waitForTextChange(
      () => readReleaseDate(page),
      (v) => String(v).includes('2022-01-24') || String(v).includes('24'),
      25000
    );
    report('release date change', 'PASS', `before="${before}" after="${after}" (form ${oldDateInput}→${newDisplay})`);
    await openDashboardOverlay(page, 'albums');
    await saveAlbumField(page, async (p) => {
      await p.fill('input[name="release-date"]', oldDateInput || '23/01/2022');
    });
    await closeDashboard(page);
  } catch (e) {
    report('release date change', 'FAIL', String(e), 'release.date → EditAlbumModal → album-details__released-time');
  }

  // ---------- track title ----------
  try {
    await gotoPublicAlbum(page);
    baselineTracks = await readTrackTitles(page);
    const before = baselineTracks[0] || '';
    if (!before) throw new Error('No tracks on public album page');
    const newTrackTitle = `${before}${suffix}`.slice(0, 80);
    await openDashboardOverlay(page, 'albums');
    // Expand album 23
    const albumRow = page.locator('[id^="dashboard-album-row"]').filter({ hasText: '23' }).first();
    await albumRow.click({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(500);
    const trackTitle = page.locator('.user-dashboard__expanded-track-title', { hasText: before }).first();
    await trackTitle.waitFor({ timeout: 15000 });
    const trackCard = trackTitle.locator('xpath=ancestor::*[contains(@class,"expanded-track")][1]');
    await trackCard.locator('button[aria-label*="Edit track"], button[aria-label*="Edit Track"], button[aria-label*="Редактир"]').first().click();
    const input = page.locator('input.user-dashboard__expanded-track-title-input').first();
    await input.waitFor({ timeout: 10000 });
    await input.fill(newTrackTitle);
    await input.press('Enter');
    await page.waitForTimeout(1500);
    await closeDashboard(page);
    const afterTracks = await waitForTextChange(
      async () => (await readTrackTitles(page)).join(' | '),
      newTrackTitle,
      25000
    );
    report('track title change', 'PASS', `before="${before}" afterTracks="${afterTracks}"`);
    // revert
    await openDashboardOverlay(page, 'albums');
    await albumRow.click().catch(() => {});
    const trackTitle2 = page.locator('.user-dashboard__expanded-track-title', { hasText: newTrackTitle }).first();
    await trackTitle2.waitFor({ timeout: 15000 });
    const trackCard2 = trackTitle2.locator('xpath=ancestor::*[contains(@class,"expanded-track")][1]');
    await trackCard2.locator('button[aria-label*="Edit track"], button[aria-label*="Edit Track"], button[aria-label*="Редактир"]').first().click();
    const input2 = page.locator('input.user-dashboard__expanded-track-title-input').first();
    await input2.fill(before);
    await input2.press('Enter');
    await page.waitForTimeout(1000);
    await closeDashboard(page);
  } catch (e) {
    report('track title change', 'FAIL', String(e), 'update-track-title → AlbumTracks/TrackList sync');
  }

  // ---------- track reorder ----------
  try {
    await gotoPublicAlbum(page);
    const before = await readTrackTitles(page);
    if (before.length < 2) throw new Error('Need ≥2 tracks to reorder');
    await openDashboardOverlay(page, 'albums');
    const albumRow = page.locator('[id^="dashboard-album-row"]').filter({ hasText: '23' }).first();
    await albumRow.click().catch(() => {});
    await page.waitForTimeout(600);
    const handles = page.locator('.user-dashboard__track-drag-handle');
    const count = await handles.count();
    if (count < 2) throw new Error('Drag handles not found');
    const box1 = await handles.nth(0).boundingBox();
    const box2 = await handles.nth(1).boundingBox();
    if (!box1 || !box2) throw new Error('No bounding boxes for drag');
    await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2);
    await page.mouse.down();
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2 + 10, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(2000);
    await closeDashboard(page);
    const after = await waitForTextChange(
      async () => (await readTrackTitles(page)).join('||'),
      (v) => v.split('||')[0] === before[1] || v !== before.join('||'),
      20000
    );
    const afterArr = after.split('||');
    const reordered = afterArr[0] !== before[0];
    if (reordered) {
      report('track reorder', 'PASS', `before=${JSON.stringify(before)} after=${JSON.stringify(afterArr)}`);
      // try restore
      await openDashboardOverlay(page, 'albums');
      await albumRow.click().catch(() => {});
      await page.waitForTimeout(500);
      const handles2 = page.locator('.user-dashboard__track-drag-handle');
      const b1 = await handles2.nth(0).boundingBox();
      const b2 = await handles2.nth(1).boundingBox();
      if (b1 && b2) {
        await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2);
        await page.mouse.down();
        await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2 + 10, { steps: 12 });
        await page.mouse.up();
        await page.waitForTimeout(1500);
      }
      await closeDashboard(page);
    } else {
      report('track reorder', 'FAIL', `Order unchanged: ${JSON.stringify(before)}`, 'dnd-kit reorder → public TrackList order');
    }
  } catch (e) {
    report('track reorder', 'FAIL', String(e), 'dnd-kit reorder → public TrackList order');
  }

  // ---------- track upload ----------
  report('track upload', 'SKIP', 'No audio fixture available');

  // ---------- track visibility ----------
  try {
    await gotoPublicAlbum(page);
    const before = await readTrackTitles(page);
    const target = before[before.length - 1];
    if (!target) throw new Error('No track to hide');
    await openDashboardOverlay(page, 'albums');
    const albumRow = page.locator('[id^="dashboard-album-row"]').filter({ hasText: '23' }).first();
    await albumRow.click().catch(() => {});
    await page.waitForTimeout(500);
    const trackTitle = page.locator('.user-dashboard__expanded-track-title', { hasText: target }).first();
    await trackTitle.waitFor({ timeout: 15000 });
    const trackCard = trackTitle.locator('xpath=ancestor::*[contains(@class,"expanded-track")][1]');
    await trackCard.locator('button.user-dashboard__track-access-button').click();
    await page.locator('.user-dashboard__track-access-menu-item', { hasText: /Hidden|Скрыт/i }).first().click();
    await page.waitForTimeout(1500);
    await closeDashboard(page);
    const after = await waitForTextChange(
      async () => (await readTrackTitles(page)).join(' | '),
      (v) => !v.includes(target),
      20000
    );
    report('track visibility', 'PASS', `hid "${target}"; before=${JSON.stringify(before)} after="${after}"`);
    // restore public
    await openDashboardOverlay(page, 'albums');
    await albumRow.click().catch(() => {});
    await page.waitForTimeout(500);
    const trackTitle2 = page.locator('.user-dashboard__expanded-track-title', { hasText: target }).first();
    await trackTitle2.waitFor({ timeout: 15000 });
    const trackCard2 = trackTitle2.locator('xpath=ancestor::*[contains(@class,"expanded-track")][1]');
    await trackCard2.locator('button.user-dashboard__track-access-button').click();
    await page.locator('.user-dashboard__track-access-menu-item', { hasText: /Open to everyone|Открыт для всех|Public/i }).first().click();
    await page.waitForTimeout(1500);
    await closeDashboard(page);
  } catch (e) {
    report('track visibility', 'FAIL', String(e), 'update-track-visibility → AlbumTracks filter hidden');
  }

  // ---------- album visibility ----------
  try {
    await gotoPublicAlbum(page);
    const titleBefore = await readAlbumTitle(page);
    await openDashboardOverlay(page, 'albums');
    const albumRow = page.locator('[id^="dashboard-album-row"]').filter({ hasText: '23' }).first();
    await albumRow.waitFor({ timeout: 15000 });
    // Open album access control
    const access = albumRow.locator('button').filter({ has: page.locator('svg') }).first();
    // Prefer AlbumAccessControl button
    const accessBtn = page.locator(`[id="dashboard-album-row-23"] button[aria-haspopup="menu"], [id^="dashboard-album-row"] button[aria-haspopup="menu"]`).first();
    await accessBtn.click({ timeout: 10000 });
    await page.waitForTimeout(400);
    const hideOpt = page.locator('[role="menuitem"], button').filter({ hasText: /Hidden|Скрыт|Private|Приват/i }).first();
    if (!(await hideOpt.count())) {
      report('album visibility', 'SKIP', 'Could not find hide/private option in album access menu (UI labels differ)');
      await page.keyboard.press('Escape');
      await closeDashboard(page);
    } else {
      await hideOpt.click();
      await page.waitForTimeout(1500);
      await closeDashboard(page);
      // Public album page should reflect hide (error/empty/redirect) without reload
      const changed = await waitForTextChange(
        async () => {
          const t = (await page.locator('.album-title').count()) ? await readAlbumTitle(page) : '';
          const body = await page.locator('body').innerText();
          return `${t} :: ${body.slice(0, 200)}`;
        },
        (v) => !v.includes(titleBefore) || /not found|не найден|скрыт|unavailable|404/i.test(v),
        20000
      ).catch((err) => {
        throw err;
      });
      report('album visibility', 'PASS', `before title="${titleBefore}" afterSignal="${changed.slice(0,160)}"`);
      // restore
      await openDashboardOverlay(page, 'albums');
      await accessBtn.click().catch(async () => {
        await page.locator('[id^="dashboard-album-row"]').filter({ hasText: '23' }).first().locator('button[aria-haspopup="menu"]').click();
      });
      await page.locator('[role="menuitem"], button').filter({ hasText: /Open|Открыт|Public|Всем/i }).first().click();
      await page.waitForTimeout(1500);
      await closeDashboard(page);
    }
  } catch (e) {
    report('album visibility', 'FAIL', String(e), 'update-album-visibility → public album/home catalog');
    // best-effort restore via API
    try {
      await page.evaluate(async ({ token, albumId }) => {
        await fetch('/.netlify/functions/update-album-visibility', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ albumId, isPublic: true, visibility: 'public' }),
        });
      }, { token, albumId: ALBUM_ID });
    } catch {}
  }

  // ---------- publish album ----------
  report('publish album', 'SKIP', 'No draft album available for artist (all albums published)');

  // ---------- delete track ----------
  report('delete track', 'SKIP', 'No disposable track; refusing destructive delete on real catalog tracks');

  // ---------- delete album ----------
  report('delete album', 'SKIP', 'No disposable test album (e2e/test); refusing destructive delete');

  // ---------- credits change ----------
  try {
    await gotoPublicAlbum(page);
    baselinePhoto = await readPhotographer(page);
    const before = baselinePhoto;
    const newPhoto = `E2E Photo${suffix}`.slice(0, 40);
    await openDashboardOverlay(page, 'albums');
    await openEditAlbumModal(page);
    // walk to step 4
    for (let s = 0; s < 3; s++) {
      await page.locator('button.edit-album-modal__button--primary', { hasText: /Next|Далее/i }).first().click();
      await page.waitForTimeout(400);
    }
    await page.waitForSelector('input[name="album-cover-photographer"]', { timeout: 15000 });
    const oldPhoto = await page.locator('input[name="album-cover-photographer"]').inputValue();
    await page.fill('input[name="album-cover-photographer"]', newPhoto);
    const designer = page.locator('input[name="album-cover-designer"]');
    if ((await designer.inputValue()).trim() === '') await designer.fill('E2E Designer');
    // step 5 + save
    await page.locator('button.edit-album-modal__button--primary', { hasText: /Next|Далее/i }).first().click();
    await page.waitForTimeout(400);
    await page.locator('button.edit-album-modal__button--primary', { hasText: /Save changes|Сохранить/i }).first().click();
    await page.waitForSelector('input[name="album-title"]', { state: 'hidden', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await closeDashboard(page);
    const after = await waitForTextChange(() => readPhotographer(page), newPhoto, 25000);
    report('credits change', 'PASS', `before="${before || oldPhoto}" after="${after}"`);
    // revert
    await openDashboardOverlay(page, 'albums');
    await openEditAlbumModal(page);
    for (let s = 0; s < 3; s++) {
      await page.locator('button.edit-album-modal__button--primary', { hasText: /Next|Далее/i }).first().click();
      await page.waitForTimeout(400);
    }
    await page.fill('input[name="album-cover-photographer"]', oldPhoto);
    await page.locator('button.edit-album-modal__button--primary', { hasText: /Next|Далее/i }).first().click();
    await page.waitForTimeout(400);
    await page.locator('button.edit-album-modal__button--primary', { hasText: /Save changes|Сохранить/i }).first().click();
    await page.waitForTimeout(1500);
    await closeDashboard(page);
  } catch (e) {
    report('credits change', 'FAIL', String(e), 'cover photographer credits → AlbumDetailsArtwork sync');
  }

  // ---------- links change ----------
  try {
    await gotoPublicHome(page);
    await page.waitForSelector('.footer', { timeout: 20000 });
    const beforeHref = await page.locator('a.social-networks__link.icon-instagram').first().getAttribute('href').catch(() => null);
    await openDashboardOverlay(page, 'social-links');
    await page.waitForSelector('#social-link-instagram', { timeout: 20000 });
    const oldVal = await page.locator('#social-link-instagram').inputValue();
    const marker = `e2e${Date.now()}`;
    const newVal = oldVal.includes('instagram.com')
      ? oldVal.replace(/\/?$/, '') + (oldVal.includes('?') ? '&' : '?') + `e2e=${marker}`
      : `https://instagram.com/e2e_${marker}`;
    await page.fill('#social-link-instagram', newVal);
    await page.locator('footer.social-links__footer button, .social-links__footer button, button', { hasText: /Save|Сохранить/i }).first().click();
    await page.waitForTimeout(1500);
    await closeDashboard(page);
    const afterHref = await waitForTextChange(
      async () =>
        (await page.locator('a.social-networks__link.icon-instagram').first().getAttribute('href')) || '',
      marker,
      20000
    );
    report('links change', 'PASS', `before="${beforeHref}" after="${afterHref}"`);
    // revert
    await openDashboardOverlay(page, 'social-links');
    await page.fill('#social-link-instagram', oldVal);
    await page.locator('button', { hasText: /Save|Сохранить/i }).first().click();
    await page.waitForTimeout(1000);
    await closeDashboard(page);
  } catch (e) {
    report('links change', 'FAIL', String(e), 'socialLinksChanged → Footer social-networks list');
  }

  await browser.close();

  const outPath = path.join(__dirname, 'e2e-public-surface-sync-report.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log('\n\n========== FINAL REPORT ==========');
  for (const r of results) {
    console.log(`${r.status.padEnd(4)} | ${r.scenario}`);
    console.log(`       evidence: ${r.evidence}`);
    if (r.status === 'FAIL' && r.syncPath) console.log(`       broke: ${r.syncPath}`);
  }
  console.log('==================================');
  console.log('Wrote', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
