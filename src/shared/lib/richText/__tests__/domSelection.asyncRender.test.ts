import { describe, test, expect } from '@jest/globals';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { act, waitFor } from '@testing-library/react';

import {
  getSelectionOffsets,
  markdownToRichText,
  renderRichText,
  restoreSelection,
} from '../index';

describe('async createRoot.render + restoreSelection race', () => {
  test('restoreSelection on stale DOM is lost after React commits new content', async () => {
    const host = document.createElement('div');
    host.contentEditable = 'true';
    host.textContent = 'abc';
    document.body.appendChild(host);

    const root = createRoot(host);
    root.render(renderRichText(markdownToRichText('ab')));
    restoreSelection(host, 2, 2);

    await waitFor(() => {
      expect(host.textContent).toBe('ab');
    });
    expect(getSelectionOffsets(host)).toEqual({ from: 0, to: 0 });

    root.unmount();
    host.remove();
  });

  test('flushSync before restoreSelection keeps caret at end after commit', () => {
    const host = document.createElement('div');
    host.contentEditable = 'true';
    host.textContent = 'abc';
    document.body.appendChild(host);

    const root = createRoot(host);
    flushSync(() => {
      root.render(renderRichText(markdownToRichText('ab')));
    });
    restoreSelection(host, 2, 2);

    expect(host.textContent).toBe('ab');
    expect(getSelectionOffsets(host)).toEqual({ from: 2, to: 2 });

    root.unmount();
    host.remove();
  });
});
