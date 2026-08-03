import { useCallback, useEffect, useRef, useState } from 'react';

import { getHelpArticleHeadings } from './getHelpArticleHeadings';
import {
  HELP_SECTION_ACTIVATION_BUFFER_PX,
  resolveActiveHelpSectionIndex,
  resolvePinnedHelpSectionIndex,
} from './resolveActiveHelpSectionIndex';

function getHelpReadingLineOffset(): number {
  const helpCenter = document.querySelector('.help-center');
  if (helpCenter) {
    const offset = parseFloat(
      getComputedStyle(helpCenter).getPropertyValue('--help-sticky-offset')
    );
    if (!Number.isNaN(offset) && offset > 0) {
      return offset;
    }
  }

  const headerEl = document.querySelector('.header');
  const headerHeight = headerEl?.getBoundingClientRect().height ?? 0;
  const ms01 =
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ms-01')) || 0;
  return headerHeight + ms01;
}

function isAtPageBottom(): boolean {
  const scrollBottom = window.scrollY + window.innerHeight;
  const pageHeight = document.documentElement.scrollHeight;
  return scrollBottom >= pageHeight - 16;
}

export function useHelpArticleActiveSection(sectionCount: number) {
  const [activeSectionIndex, setActiveSectionIndex] = useState<number>(sectionCount > 0 ? 0 : -1);
  const pinnedIndexRef = useRef<number | null>(null);

  const updateActiveSection = useCallback(() => {
    if (sectionCount === 0) {
      return;
    }

    const headings = getHelpArticleHeadings().slice(0, sectionCount);
    if (headings.length === 0) {
      return;
    }

    const readingLine = getHelpReadingLineOffset();
    const positions = headings.map((heading) => ({
      top: heading.getBoundingClientRect().top,
    }));

    const computedIndex = resolveActiveHelpSectionIndex(positions, readingLine, {
      atPageBottom: pinnedIndexRef.current == null && isAtPageBottom(),
      activationBufferPx: HELP_SECTION_ACTIVATION_BUFFER_PX,
    });

    const pinnedIndex = pinnedIndexRef.current;
    if (pinnedIndex != null) {
      const resolvedPin = resolvePinnedHelpSectionIndex(
        pinnedIndex,
        positions,
        readingLine,
        computedIndex,
        { activationBufferPx: HELP_SECTION_ACTIVATION_BUFFER_PX }
      );

      if (resolvedPin != null) {
        setActiveSectionIndex(resolvedPin);
        return;
      }

      pinnedIndexRef.current = null;
    }

    setActiveSectionIndex((current) => (current === computedIndex ? current : computedIndex));
  }, [sectionCount]);

  useEffect(() => {
    setActiveSectionIndex(sectionCount > 0 ? 0 : -1);
    pinnedIndexRef.current = null;
  }, [sectionCount]);

  useEffect(() => {
    if (sectionCount === 0) {
      return undefined;
    }

    const headings = getHelpArticleHeadings().slice(0, sectionCount);
    if (headings.length === 0) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      () => {
        updateActiveSection();
      },
      {
        root: null,
        threshold: 0,
      }
    );

    headings.forEach((heading) => observer.observe(heading));
    updateActiveSection();

    return () => {
      observer.disconnect();
    };
  }, [sectionCount, updateActiveSection]);

  const notifySectionNavigate = useCallback((sectionIndex: number) => {
    pinnedIndexRef.current = sectionIndex;
    setActiveSectionIndex(sectionIndex);
  }, []);

  return { activeSectionIndex, notifySectionNavigate };
}
