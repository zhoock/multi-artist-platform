import { fillEmailTemplate, getEmailCopy } from './email-copy';
import type { EmailLocale } from './email-locale';
import { escapeHtml, getSiteDisplayName } from './email-utils';

export interface PurchaseEmailContent {
  html: string;
  text: string;
  subject: string;
}

/**
 * Dark / gold atmospheric language aligned with the public app's auth and reset emails.
 * No ecommerce / receipt styling, no track tables, no download controls.
 */
const COLORS = {
  pageBg: '#050508',
  cardBg: '#0e0f12',
  cardBorder: 'rgba(201, 180, 88, 0.18)',
  innerBorder: 'rgba(255, 255, 255, 0.08)',
  title: '#ffffff',
  body: '#b5b6b8',
  bodyMuted: '#8a8c92',
  gold: '#c9b458',
  goldStrong: '#d4c76a',
  divider: 'rgba(255, 255, 255, 0.07)',
  coverFallback: '#15171b',
} as const;

const SITE_NAME_FALLBACK = 'Название сайта';

const SOUNDWAVE_LARGE_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3"  y="10" width="2" height="4"  rx="1" fill="${COLORS.gold}" opacity="0.7" />
    <rect x="7"  y="7"  width="2" height="10" rx="1" fill="${COLORS.gold}" opacity="0.85" />
    <rect x="11" y="4"  width="2" height="16" rx="1" fill="${COLORS.gold}" />
    <rect x="15" y="7"  width="2" height="10" rx="1" fill="${COLORS.gold}" opacity="0.85" />
    <rect x="19" y="10" width="2" height="4"  rx="1" fill="${COLORS.gold}" opacity="0.7" />
  </svg>
`.trim();

function albumArtistRow(artistNameHtml: string): string {
  if (!artistNameHtml) {
    return '';
  }

  return `<p class="sc-album-artist" style="margin:0 0 18px 0;color:${COLORS.bodyMuted};font-size:14px;line-height:1.45;font-weight:400;">
                      ${artistNameHtml}
                    </p>`;
}

function albumCoverCell(coverUrl: string | null, altText: string): string {
  const containerStyle = `width:240px;height:240px;border-radius:12px;border:1px solid ${COLORS.innerBorder};background-color:${COLORS.coverFallback};`;
  const imgStyle = `display:block;width:240px;height:240px;border-radius:12px;border:0;outline:none;text-decoration:none;background-color:${COLORS.coverFallback};object-fit:cover;`;

  if (coverUrl) {
    return `
      <td class="sc-cover-cell" valign="top" width="240" style="width:240px;padding:0 28px 0 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="240" style="${containerStyle}">
          <tr>
            <td align="center" valign="middle" width="240" height="240" style="${containerStyle}">
              <img src="${escapeHtml(coverUrl)}"
                   alt="${escapeHtml(altText)}"
                   width="240" height="240"
                   style="${imgStyle}" />
            </td>
          </tr>
        </table>
      </td>
    `.trim();
  }

  return `
    <td class="sc-cover-cell" valign="top" width="240" style="width:240px;padding:0 28px 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="240" style="${containerStyle}">
        <tr>
          <td align="center" valign="middle" width="240" height="240" style="${containerStyle}">
            ${SOUNDWAVE_LARGE_SVG}
          </td>
        </tr>
      </table>
    </td>
  `.trim();
}

export interface BuildPurchaseEmailOptions {
  locale: EmailLocale;
  customerName?: string;
  albumName: string;
  /** Artist display name; omitted from the card when blank after trim. */
  artistName?: string;
  /** Full URL pointing to the purchased album page (CTA target). */
  albumUrl: string;
  /** Pre-resolved public URL of the album cover. `null` triggers a graceful soundwave placeholder. */
  albumCoverUrl?: string | null;
  /** Order ID — kept on the options for backwards-compat; intentionally NOT rendered in the body. */
  orderId: string;
  /** Optional platform display name. Falls back to env / default placeholder. */
  siteName?: string;
}

export function buildPurchaseEmailContent(
  options: BuildPurchaseEmailOptions
): PurchaseEmailContent {
  const copy = getEmailCopy('purchase', options.locale);
  const siteName = (options.siteName || getSiteDisplayName() || SITE_NAME_FALLBACK).trim();

  const greetingTemplate = options.customerName ? copy.greetingNamed : copy.greetingGeneric;
  const greeting = escapeHtml(
    fillEmailTemplate(greetingTemplate, {
      name: options.customerName?.trim() ?? '',
    })
  );

  const albumName = escapeHtml(options.albumName);
  const artistNameRaw = (options.artistName ?? '').trim();
  const artistNameHtml = artistNameRaw ? escapeHtml(artistNameRaw) : '';
  const albumTitleMarginBottom = artistNameHtml ? '8px' : '18px';
  const coverAltText = artistNameRaw
    ? `${artistNameRaw} — ${options.albumName}`
    : options.albumName;
  const albumUrl = escapeHtml(options.albumUrl);
  const ctaLabel = escapeHtml(fillEmailTemplate(copy.ctaLabel, { siteName }));
  const siteNameEscaped = escapeHtml(siteName);
  const coverUrl = options.albumCoverUrl ?? null;

  const html = `
<!DOCTYPE html>
<html lang="${options.locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${escapeHtml(copy.documentTitle)}</title>
  <style>
    @media (max-width: 540px) {
      .sc-card { padding: 36px 24px !important; }
      .sc-hero-title { font-size: 34px !important; }
      .sc-album-row td.sc-cover-cell { display: block !important; width: 100% !important; padding: 0 0 24px 0 !important; }
      .sc-album-row td.sc-cover-cell table,
      .sc-album-row td.sc-cover-cell img { width: 100% !important; max-width: 360px !important; height: auto !important; }
      .sc-album-row td.sc-info-cell { display: block !important; width: 100% !important; padding: 0 !important; }
      .sc-cta a { display: block !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.pageBg};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.pageBg};">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background-color:${COLORS.cardBg};border-radius:22px;border:1px solid ${COLORS.cardBorder};">
          <tr>
            <td class="sc-card" style="padding:56px 56px 48px 56px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">

              <!-- Hero -->
              <h1 class="sc-hero-title" style="margin:0 0 24px 0;padding:0;color:${COLORS.title};font-size:42px;line-height:1.1;font-weight:700;letter-spacing:-0.015em;">
                ${escapeHtml(copy.heroTitleLine1)}<br>
                <span style="color:${COLORS.gold};">${escapeHtml(copy.heroTitleLine2)}</span>
              </h1>

              <p style="margin:0 0 6px 0;color:${COLORS.body};font-size:15px;line-height:1.55;">
                ${greeting}
              </p>
              <p style="margin:0 0 40px 0;color:${COLORS.body};font-size:15px;line-height:1.55;">
                ${escapeHtml(copy.heroSubtitle)}
              </p>

              <!-- Album block -->
              <table role="presentation" class="sc-album-row" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 36px 0;">
                <tr>
                  ${albumCoverCell(coverUrl, coverAltText)}
                  <td class="sc-info-cell" valign="top" style="padding:6px 0 0 0;">
                    <h2 style="margin:0 0 ${albumTitleMarginBottom} 0;padding:0;color:${COLORS.title};font-size:30px;line-height:1.15;font-weight:700;letter-spacing:-0.01em;">
                      ${albumName}
                    </h2>
                    ${albumArtistRow(artistNameHtml)}

                    <table role="presentation" width="48" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;">
                      <tr>
                        <td style="height:1px;background-color:${COLORS.gold};border-radius:999px;font-size:0;line-height:0;">&nbsp;</td>
                      </tr>
                    </table>

                    <p style="margin:0;color:${COLORS.body};font-size:15px;line-height:1.65;">
                      ${escapeHtml(copy.albumDescription)}
                    </p>

                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table role="presentation" class="sc-cta" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 36px 0;">
                <tr>
                  <td align="center" style="border:1px solid ${COLORS.gold};border-radius:999px;">
                    <a href="${albumUrl}"
                       style="display:block;padding:15px 28px;color:${COLORS.goldStrong};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.2;font-weight:600;text-decoration:none;letter-spacing:0.01em;white-space:nowrap;">
                      ${ctaLabel}
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px 0;">
                <tr>
                  <td style="border-top:1px solid ${COLORS.divider};font-size:0;line-height:0;height:1px;">&nbsp;</td>
                </tr>
              </table>

              <!-- Closing -->
              <p style="margin:0 0 28px 0;color:${COLORS.body};font-size:15px;line-height:1.7;text-align:center;">
                ${escapeHtml(copy.closingLine1)}<br>
                ${escapeHtml(copy.closingLine2)}
              </p>

              <p style="margin:0;color:${COLORS.bodyMuted};font-size:13px;line-height:1.4;text-align:center;letter-spacing:0.04em;">
                ${siteNameEscaped}
              </p>

            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  const textGreeting = fillEmailTemplate(greetingTemplate, {
    name: options.customerName?.trim() ?? '',
  });

  const albumLine = artistNameRaw ? `${artistNameRaw} — ${options.albumName}` : options.albumName;
  const subjectAlbumLine = albumLine;

  const text = `${copy.textThanks}

${textGreeting}
${copy.heroSubtitle}

${albumLine}

${copy.albumDescription}

${copy.textCtaLabel}: ${options.albumUrl}

${copy.closingLine1}
${copy.closingLine2}

— ${siteName}`;

  return {
    html,
    text,
    subject: `${copy.subjectPrefix}: ${subjectAlbumLine}`,
  };
}
