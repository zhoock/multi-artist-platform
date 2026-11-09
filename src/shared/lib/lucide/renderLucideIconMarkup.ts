import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { LucideIcon, LucideProps } from 'lucide-react';

let iconMarkupContainer: HTMLDivElement | null = null;
let iconMarkupRoot: Root | null = null;

function getLucideIconMarkupSink(): HTMLDivElement {
  if (!iconMarkupContainer) {
    iconMarkupContainer = document.createElement('div');
    iconMarkupRoot = createRoot(iconMarkupContainer);
  }
  return iconMarkupContainer;
}

/** Render a Lucide icon to an HTML string for non-React DOM (e.g. Universe3D overlays). */
export function renderLucideIconMarkup(Icon: LucideIcon, props: LucideProps): string {
  const container = getLucideIconMarkupSink();
  flushSync(() => {
    iconMarkupRoot!.render(createElement(Icon, props));
  });
  return container.innerHTML;
}
