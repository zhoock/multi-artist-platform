import { describe, expect, test } from '@jest/globals';

import { formatRenewalAccessRemainingLabel } from '../formatRenewalAccessRemainingLabel';

describe('formatRenewalAccessRemainingLabel', () => {
  test('formats relative support remaining label', () => {
    const result = formatRenewalAccessRemainingLabel({
      countdown: {
        label: 'через 4 минуты',
        title: '7 августа 2026 г., 18:36',
        source: 'expiresAt',
        isRelative: true,
        isOverdue: false,
      },
      targetIso: '2026-08-07T12:36:00.000Z',
      lang: 'ru',
      now: new Date('2026-08-07T12:32:00.000Z'),
      templates: {
        relative: 'Поддержка сохранится ещё {remaining} (до {until})',
        absolute: 'Поддержка сохранится до {date}',
      },
    });

    expect(result.label).toMatch(/Поддержка сохранится ещё 4 минуты/);
    expect(result.label).toMatch(/\(до .+\)/);
  });

  test('formats absolute support remaining label', () => {
    const result = formatRenewalAccessRemainingLabel({
      countdown: {
        label: '7 авг. 2026 г.',
        title: '7 августа 2026 г., 18:36',
        source: 'expiresAt',
        isRelative: false,
        isOverdue: false,
      },
      targetIso: '2026-08-07T12:36:00.000Z',
      lang: 'ru',
      now: new Date('2026-08-01T12:00:00.000Z'),
      templates: {
        relative: 'Поддержка сохранится ещё {remaining} (до {until})',
        absolute: 'Поддержка сохранится до {date}',
      },
    });

    expect(result.label).toBe('Поддержка сохранится до 7 авг. 2026 г.');
  });

  test('formats absolute support remaining label when period ended', () => {
    const result = formatRenewalAccessRemainingLabel({
      countdown: {
        label: 'обновляется...',
        title: '7 августа 2026 г., 18:36',
        source: 'expiresAt',
        isRelative: false,
        isOverdue: true,
      },
      targetIso: '2026-08-07T12:36:00.000Z',
      lang: 'ru',
      now: new Date('2026-08-07T12:40:00.000Z'),
      templates: {
        relative: 'Поддержка сохранится ещё {remaining} (до {until})',
        absolute: 'Поддержка сохранится до {date}',
      },
    });

    expect(result.label).toBe('Поддержка сохранится до 7 авг. 2026 г.');
  });
});
