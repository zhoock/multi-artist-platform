import { describe, expect, test } from '@jest/globals';
import {
  hasPublicManagerContacts,
  mergeSocialLinksJsonForSave,
  parseManagerEmailFromSocialLinks,
} from '../managerContactsFromSocialLinks';

describe('parseManagerEmailFromSocialLinks', () => {
  test('reads managerEmail from social_links', () => {
    expect(parseManagerEmailFromSocialLinks({ managerEmail: 'manager@test.com' })).toBe(
      'manager@test.com'
    );
  });
});

describe('hasPublicManagerContacts', () => {
  test('is true when either contact is set', () => {
    expect(hasPublicManagerContacts({ managerEmail: 'a@b.c', managerTelegramUrl: null })).toBe(
      true
    );
    expect(
      hasPublicManagerContacts({ managerEmail: null, managerTelegramUrl: 'https://t.me/x' })
    ).toBe(true);
    expect(hasPublicManagerContacts({ managerEmail: null, managerTelegramUrl: null })).toBe(false);
  });
});

describe('mergeSocialLinksJsonForSave', () => {
  test('keeps manager fields when saving platform links only', () => {
    const merged = mergeSocialLinksJsonForSave(
      {
        instagram: 'https://instagram.com/a',
        managerEmail: 'mgr@test.com',
        telegram: 'https://t.me/m',
      },
      { instagram: 'https://instagram.com/b' }
    );

    expect(merged.instagram).toBe('https://instagram.com/b');
    expect(merged.managerEmail).toBe('mgr@test.com');
    expect(merged.telegram).toBe('https://t.me/m');
  });

  test('normalizes @username telegram on save', () => {
    const merged = mergeSocialLinksJsonForSave({}, { telegram: '@ShnapK' });

    expect(merged.telegram).toBe('https://t.me/ShnapK');
  });

  test('keeps platform links when saving manager contacts only', () => {
    const merged = mergeSocialLinksJsonForSave(
      { instagram: 'https://instagram.com/a', vk: 'https://vk.com/a' },
      { managerEmail: 'mgr@test.com', telegram: 'https://t.me/m' }
    );

    expect(merged.instagram).toBe('https://instagram.com/a');
    expect(merged.vk).toBe('https://vk.com/a');
    expect(merged.managerEmail).toBe('mgr@test.com');
    expect(merged.telegram).toBe('https://t.me/m');
  });

  test('clears manager fields when explicitly set empty', () => {
    const merged = mergeSocialLinksJsonForSave(
      { managerEmail: 'mgr@test.com', telegram: 'https://t.me/m' },
      { managerEmail: '', telegram: '' }
    );

    expect(merged.managerEmail).toBeUndefined();
    expect(merged.telegram).toBeUndefined();
  });
});
