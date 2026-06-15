import { DEFAULT_EMAIL_FROM, getEmailFrom } from '../email-utils';

describe('getEmailFrom', () => {
  const original = process.env.EMAIL_FROM;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.EMAIL_FROM;
    } else {
      process.env.EMAIL_FROM = original;
    }
  });

  it('returns EMAIL_FROM when set', () => {
    process.env.EMAIL_FROM = 'Platform <noreply@example.com>';
    expect(getEmailFrom()).toBe('Platform <noreply@example.com>');
  });

  it('falls back to legacy sender when EMAIL_FROM is missing or blank', () => {
    delete process.env.EMAIL_FROM;
    expect(getEmailFrom()).toBe(DEFAULT_EMAIL_FROM);

    process.env.EMAIL_FROM = '   ';
    expect(getEmailFrom()).toBe(DEFAULT_EMAIL_FROM);
  });
});
