import {
  DEFAULT_SUPPORT_EMAIL,
  buildSupportMailtoHref,
  getSupportEmail,
  substituteSupportEmail,
  SUPPORT_EMAIL_PLACEHOLDER,
} from '../supportEmail';

describe('supportEmail', () => {
  const original = process.env.SUPPORT_EMAIL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.SUPPORT_EMAIL;
    } else {
      process.env.SUPPORT_EMAIL = original;
    }
  });

  it('returns SUPPORT_EMAIL when set', () => {
    process.env.SUPPORT_EMAIL = 'support@platform.example';
    expect(getSupportEmail()).toBe('support@platform.example');
  });

  it('falls back to placeholder address when SUPPORT_EMAIL is missing', () => {
    delete process.env.SUPPORT_EMAIL;
    expect(getSupportEmail()).toBe(DEFAULT_SUPPORT_EMAIL);
  });

  it('falls back when SUPPORT_EMAIL is blank', () => {
    process.env.SUPPORT_EMAIL = '   ';
    expect(getSupportEmail()).toBe(DEFAULT_SUPPORT_EMAIL);
  });

  it('buildSupportMailtoHref uses env override', () => {
    process.env.SUPPORT_EMAIL = 'help@platform.example';
    expect(buildSupportMailtoHref()).toBe('mailto:help@platform.example');
    expect(buildSupportMailtoHref({ subject: 'Hello' })).toBe(
      'mailto:help@platform.example?subject=Hello'
    );
  });

  it('substituteSupportEmail replaces placeholder', () => {
    process.env.SUPPORT_EMAIL = 'support@platform.example';
    expect(substituteSupportEmail(`Contact ${SUPPORT_EMAIL_PLACEHOLDER} today`)).toBe(
      'Contact support@platform.example today'
    );
  });
});
