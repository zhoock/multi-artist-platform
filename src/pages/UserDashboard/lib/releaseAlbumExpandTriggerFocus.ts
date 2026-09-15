/**
 * The album header is a focusable expand trigger that wraps inner action buttons.
 * Opening the album editor from those actions (or closing the dialog) can restore
 * focus onto the trigger with :focus-visible — a yellow outline around the whole header.
 */

function isAlbumExpandTrigger(element: Element | null): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    element.classList.contains('dashboard-expandable-row-trigger') &&
    Boolean(element.closest('.user-dashboard__album-card'))
  );
}

export function releaseAlbumExpandTriggerFocus(): void {
  const active = document.activeElement;
  if (!isAlbumExpandTrigger(active)) return;
  active.blur();
}

export function releaseAlbumExpandTriggerFocusAfterDialogClose(): void {
  releaseAlbumExpandTriggerFocus();
  queueMicrotask(releaseAlbumExpandTriggerFocus);
  requestAnimationFrame(() => {
    requestAnimationFrame(releaseAlbumExpandTriggerFocus);
  });
}
