import { applySupportEmailToOffer } from '../applySupportEmailToOffer';
import { DEFAULT_SUPPORT_EMAIL, SUPPORT_EMAIL_PLACEHOLDER } from '../supportEmail';

describe('applySupportEmailToOffer', () => {
  const original = process.env.SUPPORT_EMAIL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.SUPPORT_EMAIL;
    } else {
      process.env.SUPPORT_EMAIL = original;
    }
  });

  const baseOffer = {
    title: 'Offer',
    subtitle: 'Subtitle',
    meta: { dateLabel: 'Date:', websiteLabel: 'Site:', website: 'example.com' },
    intro: 'Intro',
    terms: [],
    sections: [
      {
        title: 'Claims',
        paragraphs: [`Contact ${SUPPORT_EMAIL_PLACEHOLDER} for help.`],
      },
    ],
    sellerInfo: {
      sellerLabel: 'Seller:',
      seller: 'Seller',
      innLabel: 'INN:',
      inn: '123',
      emailLabel: 'Email:',
      email: SUPPORT_EMAIL_PLACEHOLDER,
      hoursLabel: 'Hours:',
      hours: '9-5',
    },
  };

  it('substitutes support email from env in offer copy', () => {
    process.env.SUPPORT_EMAIL = 'support@platform.example';
    const result = applySupportEmailToOffer(baseOffer);

    expect(result.sections[0].paragraphs[0]).toBe('Contact support@platform.example for help.');
    expect(result.sellerInfo.email).toBe('support@platform.example');
  });

  it('uses fallback email when env is unset', () => {
    delete process.env.SUPPORT_EMAIL;
    const result = applySupportEmailToOffer(baseOffer);

    expect(result.sellerInfo.email).toBe(DEFAULT_SUPPORT_EMAIL);
  });
});
