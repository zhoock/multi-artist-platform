/**
 * Maps auto-renew API failures to user-facing copy; hides internal FEATURE_DISABLED text.
 */

import {
  resolveSubscriptionClientError,
  type SubscriptionClientErrorSource,
} from './resolveSubscriptionClientError';

export type AutoRenewClientErrorSource = SubscriptionClientErrorSource;

export function resolveAutoRenewClientError(
  result: AutoRenewClientErrorSource,
  genericMessage: string
): string {
  return resolveSubscriptionClientError(result, {
    billingAutoRenewPatchError: genericMessage,
    billingCheckoutErrorGeneric: genericMessage,
    billingPlanChangeError: genericMessage,
    billingUnlinkPaymentError: genericMessage,
  });
}
