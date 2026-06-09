import { markdownToRichText } from '@shared/lib/richText';
import { getFormatMenuActiveState } from '../formatMenuSelection';

function md(markdown: string) {
  return markdownToRichText(markdown);
}

describe('getFormatMenuActiveState', () => {
  it('marks bold active for bold selection in one run', () => {
    const localMarkdown = '**abc**';
    const content = md(localMarkdown);
    const state = getFormatMenuActiveState(content, localMarkdown, 2, 5);
    expect(state.isBoldActive).toBe(true);
    expect(state.isItalicActive).toBe(false);
    expect(state.isLinkActive).toBe(false);
  });

  it('marks nothing active when selection spans incompatible runs', () => {
    const localMarkdown = '**ab**_cd_';
    const content = md(localMarkdown);
    const state = getFormatMenuActiveState(content, localMarkdown, 0, localMarkdown.length);
    expect(state.isBoldActive).toBe(false);
    expect(state.isItalicActive).toBe(false);
    expect(state.isStrikeActive).toBe(false);
    expect(state.isLinkActive).toBe(false);
  });

  it('marks bold and italic active for nested selection', () => {
    const localMarkdown = '**_abc_**';
    const content = md(localMarkdown);
    const state = getFormatMenuActiveState(content, localMarkdown, 3, 6);
    expect(state.isBoldActive).toBe(true);
    expect(state.isItalicActive).toBe(true);
  });

  it('marks link active and exposes href for linked selection', () => {
    const localMarkdown = '[abc](https://x.dev)';
    const content = md(localMarkdown);
    const state = getFormatMenuActiveState(content, localMarkdown, 1, 4);
    expect(state.isLinkActive).toBe(true);
    expect(state.linkHref).toBe('https://x.dev');
  });

  it('does not mark link active when selection spans different hrefs', () => {
    const content = [
      { text: 'a', marks: [{ type: 'link' as const, href: 'https://a.dev' }] },
      { text: 'bc', marks: [{ type: 'link' as const, href: 'https://bc.dev' }] },
    ];
    const localMarkdown = '[a](https://a.dev)[bc](https://bc.dev)';
    const state = getFormatMenuActiveState(content, localMarkdown, 0, localMarkdown.length);
    expect(state.isLinkActive).toBe(false);
    expect(state.linkHref).toBeNull();
  });
});
