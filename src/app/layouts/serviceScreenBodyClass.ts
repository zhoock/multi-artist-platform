/** Whether Layout should apply `page--service-screen` on document.body. */
export function isServiceScreenBodyClassActive(input: {
  isPaymentRoute: boolean;
  shouldHideChrome: boolean;
  isMinimalLayoutRoute: boolean;
}): boolean {
  const { isPaymentRoute, shouldHideChrome, isMinimalLayoutRoute } = input;
  return isPaymentRoute || shouldHideChrome || isMinimalLayoutRoute;
}
