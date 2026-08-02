import { computePasswordStrength } from '@shared/lib/auth/passwordStrength';

describe('computePasswordStrength', () => {
  it('returns score 0 for empty password', () => {
    expect(computePasswordStrength('')).toEqual({ score: 0, meetsMinLength: false });
  });

  it('returns score 1 for short password', () => {
    const r = computePasswordStrength('abc12');
    expect(r.score).toBe(1);
    expect(r.meetsMinLength).toBe(false);
  });

  it('returns score 2 for min-length single-class password', () => {
    const r = computePasswordStrength('aaaaaaaa');
    expect(r.score).toBe(2);
    expect(r.meetsMinLength).toBe(true);
  });

  it('returns score 3 for two-class password of normal length', () => {
    const r = computePasswordStrength('abcdefgh1234');
    expect(r.score).toBe(3);
    expect(r.meetsMinLength).toBe(true);
  });

  it('returns score 4 for a 3-class password of normal length', () => {
    const r = computePasswordStrength('AbcdEfg1');
    expect(r.score).toBe(4);
    expect(r.meetsMinLength).toBe(true);
  });

  it('returns score 5 for a 4-class password of 16+ chars', () => {
    const r = computePasswordStrength('AbcdEfgh1234!@#$');
    expect(r.score).toBe(5);
    expect(r.meetsMinLength).toBe(true);
  });

  it('meetsMinLength is true at exactly 8 chars', () => {
    expect(computePasswordStrength('12345678').meetsMinLength).toBe(true);
  });
});
