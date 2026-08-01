/** Pointer/focus hooks to warm lazy dashboard chunks before the user clicks. */
export function bindDashboardPreloadIntentHandlers(onPreload?: () => void) {
  if (!onPreload) {
    return {};
  }

  return {
    onMouseEnter: onPreload,
    onFocus: onPreload,
  };
}
