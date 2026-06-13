import {
  blockFromCarouselSave,
  blocksToDetails,
  buildArticlePublicPath,
  createListItem,
  createListItemFromRichText,
  generateId,
  isSavedCarousel,
  mergeListItemContents,
  normalizeDetailsToBlocks,
} from '../EditArticleModalV2.utils';
import { markdownToRichText, richTextToPlainText } from '@shared/lib/richText';

describe('EditArticleModalV2.utils stable ids', () => {
  it('persists blockId and list item ids through save/load roundtrip', () => {
    const blockId = generateId();
    const itemA = createListItem('First');
    const itemB = createListItem('Second');
    itemA.id = 'item-a';
    itemB.id = 'item-b';

    const blocks = [
      { id: blockId, type: 'title' as const, content: markdownToRichText('Section title') },
      { id: generateId(), type: 'list' as const, items: [itemA, itemB] },
    ];

    const details = blocksToDetails(blocks);
    expect(details[0].blockId).toBe(blockId);
    expect(details[0].blockKind).toBe('title');
    expect(details[0].title).toBe('Section title');
    expect(details[1].blockKind).toBe('list');
    expect(details[1].content).toEqual([
      { id: 'item-a', text: 'First' },
      { id: 'item-b', text: 'Second' },
    ]);

    const loaded = normalizeDetailsToBlocks(details);
    expect(loaded[0].id).toBe(blockId);
    if (loaded[0].type !== 'title') throw new Error('expected title block');
    expect(richTextToPlainText(loaded[0].content)).toBe('Section title');
    expect(loaded[1].type).toBe('list');
    if (loaded[1].type === 'list') {
      expect(loaded[1].items.map((item) => item.id)).toEqual(['item-a', 'item-b']);
      expect(loaded[1].items.map((item) => richTextToPlainText(item.content))).toEqual([
        'First',
        'Second',
      ]);
    }
  });

  it('migrates legacy string list items to stable ids on load', () => {
    const listBlockId = generateId();
    const loaded = normalizeDetailsToBlocks([
      {
        type: 'text',
        blockId: listBlockId,
        blockKind: 'list',
        content: ['Alpha', 'Beta'],
      },
    ]);

    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(listBlockId);
    if (loaded[0].type !== 'list') throw new Error('expected list block');
    expect(loaded[0].items).toHaveLength(2);
    expect(richTextToPlainText(loaded[0].items[0].content)).toBe('Alpha');
    expect(richTextToPlainText(loaded[0].items[1].content)).toBe('Beta');
    expect(loaded[0].items[0].id).toEqual(expect.any(String));
    expect(loaded[0].items[1].id).toEqual(expect.any(String));
  });

  it('stores one details row per block with blockId', () => {
    const paragraphId = generateId();
    const quoteId = generateId();
    const details = blocksToDetails([
      { id: paragraphId, type: 'paragraph', content: markdownToRichText('Body') },
      { id: quoteId, type: 'quote', content: markdownToRichText('Quote text') },
    ]);

    expect(details).toHaveLength(2);
    expect(details[0]).toMatchObject({
      blockId: paragraphId,
      blockKind: 'paragraph',
      content: 'Body',
    });
    expect(details[1]).toMatchObject({
      blockId: quoteId,
      blockKind: 'quote',
      content: 'Quote text',
    });
  });

  it('preserves inline markdown through the content round-trip', () => {
    const blockId = generateId();
    const details = blocksToDetails([
      { id: blockId, type: 'paragraph', content: markdownToRichText('**bold** and _italic_') },
    ]);
    expect(details[0].content).toBe('**bold** and _italic_');

    const loaded = normalizeDetailsToBlocks(details);
    if (loaded[0].type !== 'paragraph') throw new Error('expected paragraph block');
    expect(richTextToPlainText(loaded[0].content)).toBe('bold and italic');
  });

  it('mergeListItemContents concatenates rich text nodes', () => {
    const first = markdownToRichText('Hello');
    const second = markdownToRichText(' world');
    const merged = mergeListItemContents(first, second);
    expect(richTextToPlainText(merged)).toBe('Hello world');
  });

  it('createListItemFromRichText clones content with new id', () => {
    const content = markdownToRichText('**bold**');
    const item = createListItemFromRichText(content);
    expect(item.id).toEqual(expect.any(String));
    expect(richTextToPlainText(item.content)).toBe('bold');
    expect(item.content).not.toBe(content);
  });

  it('treats carousel as existing only with at least two images', () => {
    expect(isSavedCarousel([{ imageKey: 'a' }])).toBe(false);
    expect(isSavedCarousel([{ imageKey: 'a' }, { imageKey: 'b' }])).toBe(true);

    const blockId = generateId();
    expect(blockFromCarouselSave(blockId, [{ imageKey: 'a' }])).toMatchObject({
      id: blockId,
      type: 'image',
      imageKey: 'a',
    });
    expect(blockFromCarouselSave(blockId, [{ imageKey: 'a' }, { imageKey: 'b' }])).toMatchObject({
      id: blockId,
      type: 'carousel',
      images: [{ imageKey: 'a' }, { imageKey: 'b' }],
    });
    expect(blockFromCarouselSave(blockId, [])).toMatchObject({
      id: blockId,
      type: 'image',
      imageKey: '',
    });
  });

  it('normalizes persisted carousel with one image to image block', () => {
    const blockId = generateId();
    const loaded = normalizeDetailsToBlocks([
      {
        type: 'carousel',
        blockId,
        images: ['solo.jpg'],
        caption: 'caption',
      },
    ]);

    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({
      id: blockId,
      type: 'image',
      imageKey: 'solo.jpg',
      caption: 'caption',
    });
  });

  it('loads legacy alt as caption on first carousel image', () => {
    const blockId = generateId();
    const loaded = normalizeDetailsToBlocks([
      {
        type: 'carousel',
        blockId,
        images: ['a.jpg', 'b.jpg'],
        alt: 'Legacy caption',
      },
    ]);

    expect(loaded[0]).toMatchObject({
      type: 'carousel',
      images: [{ imageKey: 'a.jpg', caption: 'Legacy caption' }, { imageKey: 'b.jpg' }],
    });
  });

  it('serializes carousel with one image as image detail', () => {
    const blockId = generateId();
    const details = blocksToDetails([
      { id: blockId, type: 'carousel', images: [{ imageKey: 'solo.jpg', caption: 'caption' }] },
    ]);

    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({
      type: 'image',
      blockId,
      img: 'solo.jpg',
      caption: 'caption',
    });
    expect(details[0]).not.toHaveProperty('alt');
  });

  it('serializes saved carousel with per-image captions', () => {
    const blockId = generateId();
    const details = blocksToDetails([
      {
        id: blockId,
        type: 'carousel',
        images: [
          { imageKey: 'a.jpg', caption: 'First' },
          { imageKey: 'b.jpg', caption: 'Second' },
        ],
      },
    ]);

    expect(details[0]).toMatchObject({
      type: 'carousel',
      blockId,
      images: [
        { imageKey: 'a.jpg', caption: 'First' },
        { imageKey: 'b.jpg', caption: 'Second' },
      ],
    });
    expect(details[0]).not.toHaveProperty('caption');
    expect(details[0]).not.toHaveProperty('alt');
  });

  it('assigns ids to pasted list lines', () => {
    const details = blocksToDetails([
      {
        id: generateId(),
        type: 'list',
        items: ['One', 'Two', 'Three'].map((text) => createListItem(text)),
      },
    ]);

    const content = details[0].content;
    expect(Array.isArray(content)).toBe(true);
    if (!Array.isArray(content)) return;
    expect(content).toHaveLength(3);
    for (const item of content) {
      expect(typeof item).toBe('object');
      if (typeof item === 'string') throw new Error('expected object item');
      expect(item.id).toEqual(expect.any(String));
    }
  });
});

describe('buildArticlePublicPath', () => {
  it('uses /articles route without language prefix', () => {
    expect(buildArticlePublicPath('my-article')).toBe('/articles/my-article');
  });

  it('appends artist query when slug is provided', () => {
    expect(buildArticlePublicPath('my-article', 'the-beatles')).toBe(
      '/articles/my-article?artist=the-beatles'
    );
  });
});
