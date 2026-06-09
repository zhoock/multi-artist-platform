import type { RichText } from '@shared/lib/richText';
import { getActiveMarks, getLinkAtSelection, mapMarkdownOffsetToPlain } from '@shared/lib/richText';

export type FormatMenuActiveState = {
  isBoldActive: boolean;
  isItalicActive: boolean;
  isUnderlineActive: boolean;
  isStrikeActive: boolean;
  isLinkActive: boolean;
  linkHref: string | null;
};

const EMPTY_ACTIVE_STATE: FormatMenuActiveState = {
  isBoldActive: false,
  isItalicActive: false,
  isUnderlineActive: false,
  isStrikeActive: false,
  isLinkActive: false,
  linkHref: null,
};

/**
 * Активность кнопок FormatMenu по канонической RichText-модели блока.
 * selectionStart/End — markdown-offsets из textarea (localMarkdown).
 */
export function getFormatMenuActiveState(
  content: RichText,
  localMarkdown: string,
  selectionStart: number,
  selectionEnd: number
): FormatMenuActiveState {
  const plainFrom = mapMarkdownOffsetToPlain(localMarkdown, selectionStart);
  const plainTo = mapMarkdownOffsetToPlain(localMarkdown, selectionEnd);
  return getFormatMenuActiveStateByPlain(content, plainFrom, plainTo);
}

/** Активность кнопок по plain offsets (rich mode). */
export function getFormatMenuActiveStateByPlain(
  content: RichText,
  plainFrom: number,
  plainTo: number
): FormatMenuActiveState {
  const activeMarks = getActiveMarks(content, plainFrom, plainTo);
  const linkHref = getLinkAtSelection(content, plainFrom, plainTo);

  return {
    isBoldActive: activeMarks.has('bold'),
    isItalicActive: activeMarks.has('italic'),
    isUnderlineActive: activeMarks.has('underline'),
    isStrikeActive: activeMarks.has('strike'),
    isLinkActive: activeMarks.has('link'),
    linkHref,
  };
}

export function emptyFormatMenuActiveState(): FormatMenuActiveState {
  return { ...EMPTY_ACTIVE_STATE };
}
