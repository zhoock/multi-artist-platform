/** @jest-environment jsdom */

import {
  releaseAlbumExpandTriggerFocus,
  releaseAlbumExpandTriggerFocusAfterDialogClose,
} from '../releaseAlbumExpandTriggerFocus';

function mountAlbumTrigger(): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'user-dashboard__album-card';
  const trigger = document.createElement('div');
  trigger.className = 'dashboard-expandable-row-trigger user-dashboard__album-header';
  trigger.tabIndex = 0;
  card.appendChild(trigger);
  document.body.appendChild(card);
  return trigger;
}

describe('releaseAlbumExpandTriggerFocus', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('blurs a focused album expand trigger', () => {
    const trigger = mountAlbumTrigger();
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    releaseAlbumExpandTriggerFocus();

    expect(document.activeElement).not.toBe(trigger);
  });

  it('does not blur article headers or unrelated controls', () => {
    const articleHeader = document.createElement('div');
    articleHeader.className = 'user-dashboard__album-header';
    articleHeader.tabIndex = 0;
    document.body.appendChild(articleHeader);
    articleHeader.focus();

    releaseAlbumExpandTriggerFocus();

    expect(document.activeElement).toBe(articleHeader);

    const button = document.createElement('button');
    button.type = 'button';
    document.body.appendChild(button);
    button.focus();

    releaseAlbumExpandTriggerFocus();

    expect(document.activeElement).toBe(button);
  });

  it('blurs the trigger again after dialog close restores focus asynchronously', async () => {
    const pending: FrameRequestCallback[] = [];
    const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      pending.push(cb);
      return pending.length;
    });

    const trigger = mountAlbumTrigger();
    trigger.focus();

    releaseAlbumExpandTriggerFocusAfterDialogClose();
    expect(document.activeElement).not.toBe(trigger);

    trigger.focus();
    await Promise.resolve();
    expect(document.activeElement).not.toBe(trigger);

    trigger.focus();
    pending.shift()?.(0);
    pending.shift()?.(0);
    expect(document.activeElement).not.toBe(trigger);

    raf.mockRestore();
  });
});
