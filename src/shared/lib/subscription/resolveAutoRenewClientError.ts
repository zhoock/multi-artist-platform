/**
 * Maps auto-renew API failures to user-facing copy; hides internal FEATURE_DISABLED text.
 */

import {
  pickSubscriptionClientErrorCopy,
  resolveSubscriptionClientError,
  type SubscriptionClientErrorSource,
} from './resolveSubscriptionClientError';

export type AutoRenewClientErrorSource = SubscriptionClientErrorSource;

export function resolveAutoRenewClientError(
  result: AutoRenewClientErrorSource,
  genericMessage: string,
  collection?: Parameters<typeof pickSubscriptionClientErrorCopy>[0]
): string {
  const localized = pickSubscriptionClientErrorCopy(collection);
  return resolveSubscriptionClientError(result, {
    ...localized,
    billingAutoRenewPatchError: genericMessage,
    billingCheckoutErrorGeneric: genericMessage,
    billingPlanChangeError: genericMessage,
    billingUnlinkPaymentError: genericMessage,
    billingAutoRenewDevResumeBlocked:
      localized.billingAutoRenewDevResumeBlocked ?? collection?.billingAutoRenewDevResumeBlocked,
  });
}
