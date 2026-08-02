import { MIN_PASSWORD_LENGTH, validatePassword } from '../password-policy';

describe('validatePassword', () => {
  it('rejects missing or empty passwords', () => {
    expect(validatePassword('')?.code).toBe('PASSWORD_REQUIRED');
    expect(validatePassword(undefined)?.code).toBe('PASSWORD_REQUIRED');
    expect(validatePassword(null)?.code).toBe('PASSWORD_REQUIRED');
    expect(validatePassword(42 as unknown as string)?.code).toBe('PASSWORD_REQUIRED');
  });

  it(`rejects passwords shorter than ${MIN_PASSWORD_LENGTH} chars`, () => {
    expect(validatePassword('abc')?.code).toBe('PASSWORD_TOO_SHORT');
    expect(validatePassword('1234567')?.code).toBe('PASSWORD_TOO_SHORT');
  });

  it('rejects passwords longer than 200 chars', () => {
    expect(validatePassword('a'.repeat(201))?.code).toBe('PASSWORD_TOO_LONG');
  });

  it(`accepts passwords in [${MIN_PASSWORD_LENGTH}, 200] chars`, () => {
    expect(validatePassword('12345678')).toBeNull();
    expect(validatePassword('a'.repeat(200))).toBeNull();
  });
});
