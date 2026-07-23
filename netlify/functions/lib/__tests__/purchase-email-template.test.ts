import { buildPurchaseEmailContent } from '../purchase-email-template';

describe('purchase-email-template', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.SITE_DISPLAY_NAME;
    delete process.env.SUPPORT_EMAIL;
  });

  afterAll(() => {
    process.env = env;
  });

  const baseOptions = {
    locale: 'en' as const,
    customerName: 'Alex',
    albumName: 'Rubber Soul',
    artistName: 'The Beatles',
    orderId: 'abcdef1234567890',
    albumUrl: 'https://smolyanoechuchelko.ru/albums/rubber-soul',
    albumCoverUrl: 'https://example.com/proxy?path=cover.jpg',
    siteName: 'Название сайта',
  };

  it('renders artist name under album title with muted styling', () => {
    const { html } = buildPurchaseEmailContent(baseOptions);

    expect(html).toContain('Rubber Soul');
    expect(html).toContain('class="sc-album-artist"');
    expect(html).toContain('The Beatles');
    expect(html).toContain('font-size:14px');
    expect(html).toContain('font-weight:400');
    expect(html).toMatch(
      /<h2[^>]*>[\s\S]*Rubber Soul[\s\S]*<\/h2>[\s\S]*sc-album-artist[\s\S]*The Beatles/
    );
  });

  it('omits artist row when artist name is blank', () => {
    const { html, text, subject } = buildPurchaseEmailContent({
      ...baseOptions,
      artistName: '   ',
    });

    expect(html).not.toContain('sc-album-artist');
    expect(html).not.toContain('The Beatles');
    expect(subject).toBe('Thank you for your purchase: Rubber Soul');
    expect(text).toContain('\nRubber Soul\n');
  });

  it('renders the atmospheric thank-you hero + album block in English', () => {
    const { html, text, subject } = buildPurchaseEmailContent(baseOptions);

    expect(subject).toBe('Thank you for your purchase: The Beatles — Rubber Soul');
    expect(html).toContain('Thank you');
    expect(html).toContain('for your purchase!');
    expect(html).toContain('Hello, Alex!');
    expect(html).toContain('Your purchase was successful.');
    expect(html).toContain('Rubber Soul');
    expect(html).toContain('The Beatles');
    expect(html).toContain(
      'The album is now available in My Purchases. You can stream, download and enjoy it whenever you want.'
    );
    expect(html).toContain('Open in Название сайта');
    expect(html).toContain('https://smolyanoechuchelko.ru/albums/rubber-soul');
    expect(html).toContain('https://example.com/proxy?path=cover.jpg');
    expect(text).toContain('Thank you for your purchase.');
    expect(text).toContain('Open album: https://smolyanoechuchelko.ru/albums/rubber-soul');
  });

  it('renders the localized Russian variant', () => {
    const { html, text, subject } = buildPurchaseEmailContent({
      ...baseOptions,
      locale: 'ru',
      customerName: 'Алексей',
    });

    expect(subject).toBe('Спасибо за покупку: The Beatles — Rubber Soul');
    expect(html).toContain('Спасибо');
    expect(html).toContain('за покупку!');
    expect(html).toContain('Здравствуйте, Алексей!');
    expect(html).toContain('Альбом доступен в разделе «Мои покупки»');
    expect(html).toContain('Открыть в Название сайта');
    expect(html).toContain('Спасибо, что поддерживаете артистов.');
    expect(text).toContain('Спасибо за покупку.');
  });

  it('uses the generic greeting when no customer name is provided', () => {
    const { html } = buildPurchaseEmailContent({ ...baseOptions, customerName: undefined });
    expect(html).toContain('Hello!');
    expect(html).not.toContain('Hello, !');
  });

  it('renders a graceful SVG soundwave placeholder when the cover is missing', () => {
    const { html } = buildPurchaseEmailContent({ ...baseOptions, albumCoverUrl: null });
    expect(html).not.toContain('<img');
    // Cover placeholder uses the soundwave glyph.
    expect(html).toMatch(/<svg[\s\S]*?<rect/);
  });

  it('escapes user-controlled values into the HTML body', () => {
    const { html } = buildPurchaseEmailContent({
      ...baseOptions,
      customerName: '<script>alert(1)</script>',
      albumName: 'Album <evil>',
      artistName: 'Artist & Co',
      albumUrl: 'https://example.com/?x=<>&y="z"',
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Album &lt;evil&gt;');
    expect(html).toContain('Artist &amp; Co');
    expect(html).toContain('?x=&lt;&gt;&amp;y=&quot;z&quot;');
  });

  it('uses the dark / gold visual language and stays free of ecommerce remnants', () => {
    const { html } = buildPurchaseEmailContent(baseOptions);

    expect(html).toContain('background-color:#050508');
    expect(html).toContain('#c9b458');

    // No bright ecommerce green anywhere.
    expect(html).not.toContain('#4CAF50');
    // No track / receipt table.
    expect(html).not.toMatch(/<th[^>]*>\s*Track\s*<\/th>/i);
    expect(html).not.toMatch(/Download\s*▼/);
    // No download links into the API surface.
    expect(html).not.toContain('/api/download?token=');
    // No giant green success emoji.
    expect(html).not.toMatch(/✅/);
  });

  it('omits the metadata pill row and the order/support footer (reference design)', () => {
    const { html } = buildPurchaseEmailContent(baseOptions);
    // No "Digital album" pill (uppercase / pill styling was the old design).
    expect(html).not.toMatch(/Digital album/);
    expect(html).not.toMatch(/Permanent access/);
    // No "Order #abcd…" footer line and no support mailto: line.
    expect(html).not.toMatch(/Order\s*#/);
    expect(html).not.toMatch(/mailto:/i);
    expect(html).not.toMatch(/text-transform:\s*uppercase/);
  });

  it('keeps the CTA text-only without decorative icons', () => {
    const { html } = buildPurchaseEmailContent(baseOptions);
    expect(html).toContain('Open in Название сайта');
    expect(html).not.toContain('&rsaquo;');
    expect(html).not.toMatch(/M4 14v3/);
    expect(html).not.toMatch(/M12 20s-7-4\.35/);
    expect(html).not.toMatch(/M12 1 C12\.4 7\.8/);
  });

  it('respects SITE_DISPLAY_NAME from env when no siteName is passed', () => {
    process.env.SITE_DISPLAY_NAME = 'Custom Label';
    const { html } = buildPurchaseEmailContent({ ...baseOptions, siteName: undefined });
    expect(html).toContain('Open in Custom Label');
  });
});
