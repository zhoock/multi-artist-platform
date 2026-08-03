import { formatLegalPageDate } from '../formatLegalPageDate';

describe('formatLegalPageDate', () => {
  const fixedDate = new Date(2026, 7, 2); // 2 Aug 2026 local

  test('formats ru with ru-RU locale', () => {
    expect(formatLegalPageDate('ru', fixedDate)).toMatch(/02[./]08[./]2026/);
  });

  test('formats en with en-GB locale (not ru-RU)', () => {
    const formatted = formatLegalPageDate('en', fixedDate);
    expect(formatted).not.toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
    expect(formatted).toMatch(/02[./]08[./]2026/);
  });
});
