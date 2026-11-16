import { describe, expect, test } from '@jest/globals';
import {
  formatManagerTelegramForSettingsDisplay,
  normalizeManagerTelegramForStorage,
  normalizeTelegramContactHref,
  parseTelegramFromSocialLinks,
} from '../parseTelegramFromSocialLinks';

describe('normalizeManagerTelegramForStorage', () => {
  test('@username → https://t.me/username', () => {
    expect(normalizeManagerTelegramForStorage('@ShnapK')).toBe('https://t.me/ShnapK');
  });

  test('plain username → https://t.me/username', () => {
    expect(normalizeManagerTelegramForStorage('ShnapK')).toBe('https://t.me/ShnapK');
  });

  test('keeps existing https://t.me/username', () => {
    expect(normalizeManagerTelegramForStorage('https://t.me/ShnapK')).toBe('https://t.me/ShnapK');
  });

  test('supports https://username.t.me personal domain links', () => {
    expect(normalizeManagerTelegramForStorage('https://ShnapK.t.me')).toBe('https://shnapk.t.me');
    expect(normalizeManagerTelegramForStorage('https://shnapk.t.me/profile')).toBe(
      'https://shnapk.t.me/profile'
    );
  });

  test('supports t.me/ shorthand', () => {
    expect(normalizeManagerTelegramForStorage('t.me/manager')).toBe('https://t.me/manager');
  });

  test('keeps invite links on t.me', () => {
    expect(normalizeManagerTelegramForStorage('https://t.me/+InviteHash')).toBe(
      'https://t.me/+InviteHash'
    );
  });

  test('rejects invalid values', () => {
    expect(normalizeManagerTelegramForStorage('')).toBeNull();
    expect(normalizeManagerTelegramForStorage('ab')).toBeNull();
    expect(normalizeManagerTelegramForStorage('not a telegram link')).toBeNull();
  });
});

describe('formatManagerTelegramForSettingsDisplay', () => {
  test('shows @username for t.me profile URLs', () => {
    expect(formatManagerTelegramForSettingsDisplay('https://t.me/ShnapK')).toBe('@ShnapK');
    expect(formatManagerTelegramForSettingsDisplay('@ShnapK')).toBe('@ShnapK');
  });

  test('keeps personal-domain and invite URLs as-is', () => {
    expect(formatManagerTelegramForSettingsDisplay('https://shnapk.t.me')).toBe(
      'https://shnapk.t.me'
    );
    expect(formatManagerTelegramForSettingsDisplay('https://t.me/+InviteHash')).toBe(
      'https://t.me/+InviteHash'
    );
  });
});

describe('parseTelegramFromSocialLinks', () => {
  test('reads and normalizes telegram from social_links', () => {
    expect(
      parseTelegramFromSocialLinks({
        instagram: 'https://instagram.com/a',
        telegram: 'https://t.me/manager',
      })
    ).toBe('https://t.me/manager');

    expect(parseTelegramFromSocialLinks({ telegram: '@ShnapK' })).toBe('https://t.me/ShnapK');
  });

  test('returns null when telegram is missing, empty, or invalid', () => {
    expect(parseTelegramFromSocialLinks({})).toBeNull();
    expect(parseTelegramFromSocialLinks({ telegram: '  ' })).toBeNull();
    expect(parseTelegramFromSocialLinks(null)).toBeNull();
    expect(parseTelegramFromSocialLinks({ telegram: '???' })).toBeNull();
  });
});

describe('normalizeTelegramContactHref', () => {
  test('resolves stored and legacy values to https href', () => {
    expect(normalizeTelegramContactHref('https://t.me/manager')).toBe('https://t.me/manager');
    expect(normalizeTelegramContactHref('@ShnapK')).toBe('https://t.me/ShnapK');
    expect(normalizeTelegramContactHref('ShnapK')).toBe('https://t.me/ShnapK');
    expect(normalizeTelegramContactHref('t.me/manager')).toBe('https://t.me/manager');
    expect(normalizeTelegramContactHref('https://artist.t.me')).toBe('https://artist.t.me');
  });
});
