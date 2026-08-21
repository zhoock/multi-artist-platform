import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type UseModalDraftSessionArgs<T> = {
  isOpen: boolean;
  baseline: T;
  isEqual?: (draft: T, baseline: T) => boolean;
};

/**
 * Separates persisted baseline from in-modal draft while open.
 * Baseline resets when the modal opens or when `baseline` changes during an open session.
 */
export function useModalDraftSession<T>({
  isOpen,
  baseline,
  isEqual,
}: UseModalDraftSessionArgs<T>) {
  const [draft, setDraft] = useState(baseline);
  const baselineRef = useRef(baseline);
  const equals = isEqual ?? Object.is;

  useEffect(() => {
    if (!isOpen) return;
    baselineRef.current = baseline;
    setDraft(baseline);
  }, [isOpen, baseline]);

  const hasChanges = useMemo(() => !equals(draft, baselineRef.current), [draft, equals]);

  const discardDraft = useCallback(() => {
    setDraft(baselineRef.current);
  }, []);

  const commitDraft = useCallback((next: T) => {
    baselineRef.current = next;
    setDraft(next);
  }, []);

  return {
    draft,
    setDraft,
    hasChanges,
    discardDraft,
    commitDraft,
  };
}
