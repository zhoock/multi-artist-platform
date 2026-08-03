export type HelpSectionPosition = {
  top: number;
};

export const HELP_SECTION_ACTIVATION_BUFFER_PX = 4;

/**
 * Active section = the last heading whose top edge has reached the reading line.
 * The next section is not activated until its heading crosses the line, even if it
 * is already visible lower in the viewport.
 */
export function resolveActiveHelpSectionIndex(
  sections: ReadonlyArray<HelpSectionPosition>,
  readingLineOffset: number,
  options?: { atPageBottom?: boolean; activationBufferPx?: number }
): number {
  if (sections.length === 0) {
    return -1;
  }

  const bufferPx = options?.activationBufferPx ?? HELP_SECTION_ACTIVATION_BUFFER_PX;
  const activationLine = readingLineOffset + bufferPx;
  let activeIndex = 0;

  for (let index = 0; index < sections.length; index += 1) {
    if (sections[index].top <= activationLine) {
      activeIndex = index;
    } else {
      break;
    }
  }

  if (options?.atPageBottom) {
    const lastIndex = sections.length - 1;
    if (sections[lastIndex].top > activationLine) {
      return lastIndex;
    }
  }

  return activeIndex;
}

/**
 * Keeps a TOC click pinned until the next section's heading crosses the reading line,
 * or the user scrolls back above the pinned section.
 */
export function resolvePinnedHelpSectionIndex(
  pinnedIndex: number,
  sections: ReadonlyArray<HelpSectionPosition>,
  readingLineOffset: number,
  computedIndex: number,
  options?: { activationBufferPx?: number }
): number | null {
  const bufferPx = options?.activationBufferPx ?? HELP_SECTION_ACTIVATION_BUFFER_PX;
  const activationLine = readingLineOffset + bufferPx;
  const nextIndex = pinnedIndex + 1;

  if (nextIndex < sections.length) {
    if (sections[nextIndex].top > activationLine) {
      return pinnedIndex;
    }

    return null;
  }

  if (computedIndex < pinnedIndex) {
    return null;
  }

  return pinnedIndex;
}
