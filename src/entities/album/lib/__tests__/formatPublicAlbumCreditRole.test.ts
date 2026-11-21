import { describe, expect, test } from '@jest/globals';
import {
  formatPublicCreditLineAfterEmDash,
  formatPublicCreditRoleFragment,
} from '../formatPublicAlbumCreditRole';

describe('formatPublicAlbumCreditRole', () => {
  test('lowercases first letter after em dash in a full credit line', () => {
    expect(formatPublicCreditLineAfterEmDash('Макс Горелов — Вокал, ритм-гитара, фронтмен.')).toBe(
      'Макс Горелов — вокал, ритм-гитара, фронтмен.'
    );
  });

  test('lowercases role in linked legacy segment', () => {
    expect(formatPublicCreditLineAfterEmDash(' — Вокал.')).toBe(' — вокал.');
  });

  test('leaves lines without em dash unchanged', () => {
    expect(formatPublicCreditLineAfterEmDash('Studio name')).toBe('Studio name');
  });

  test('lowercases standalone role fragment', () => {
    expect(formatPublicCreditRoleFragment('Фронтмен')).toBe('фронтмен');
    expect(formatPublicCreditRoleFragment('Producer')).toBe('producer');
  });
});
