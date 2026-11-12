import { pluralizeReplyCount } from '../pluralizeReplyCount';

const enLabels = {
  one: 'Show {count} reply',
  few: 'Show {count} replies',
  many: 'Show {count} replies',
};

const ruLabels = {
  one: 'Показать {count} ответ',
  few: 'Показать {count} ответа',
  many: 'Показать {count} ответов',
};

describe('pluralizeReplyCount', () => {
  test('English singular vs plural', () => {
    expect(pluralizeReplyCount(1, 'en', enLabels)).toBe('Show 1 reply');
    expect(pluralizeReplyCount(2, 'en', enLabels)).toBe('Show 2 replies');
  });

  test('Russian plural forms', () => {
    expect(pluralizeReplyCount(1, 'ru', ruLabels)).toBe('Показать 1 ответ');
    expect(pluralizeReplyCount(3, 'ru', ruLabels)).toBe('Показать 3 ответа');
    expect(pluralizeReplyCount(5, 'ru', ruLabels)).toBe('Показать 5 ответов');
  });
});
