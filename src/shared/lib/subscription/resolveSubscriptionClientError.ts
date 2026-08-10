/**
 * Maps subscription billing API failures to localized user-facing copy.
 * Prefer `code` over raw English `error` from the backend.
 */

export type SubscriptionClientErrorSource = {
  error?: string;
  code?: string;
};

export type SubscriptionClientErrorCopy = {
  billingPlanChangeError?: string;
  billingCheckoutErrorGeneric?: string;
  billingCheckoutUpgradeIntentRequired?: string;
  billingCheckoutInProgress?: string;
  billingCheckoutNoSubscription?: string;
  billingCheckoutEmailNotVerified?: string;
  billingCheckoutNotAnUpgrade?: string;
  billingCheckoutInvalidStatus?: string;
  billingCheckoutInvalidPlan?: string;
  billingCheckoutProviderUnavailable?: string;
  billingCheckoutPaymentMethodRequired?: string;
  billingAutoRenewPatchError?: string;
  billingUnlinkPaymentError?: string;
};

const CODE_TO_COPY_KEY: Partial<Record<string, keyof SubscriptionClientErrorCopy>> = {
  UPGRADE_INTENT_REQUIRED: 'billingCheckoutUpgradeIntentRequired',
  CHECKOUT_IN_PROGRESS: 'billingCheckoutInProgress',
  NO_SUBSCRIPTION: 'billingCheckoutNoSubscription',
  EMAIL_NOT_VERIFIED: 'billingCheckoutEmailNotVerified',
  UNAUTHORIZED: 'billingCheckoutEmailNotVerified',
  NOT_AN_UPGRADE: 'billingCheckoutNotAnUpgrade',
  INVALID_STATUS: 'billingCheckoutInvalidStatus',
  NO_PREMIUM_ACCESS: 'billingCheckoutInvalidStatus',
  INVALID_PLAN: 'billingCheckoutInvalidPlan',
  NOT_A_DOWNGRADE: 'billingCheckoutInvalidPlan',
  YOOKASSA_NOT_CONFIGURED: 'billingCheckoutProviderUnavailable',
  PAYMENT_METHOD_REQUIRED: 'billingCheckoutPaymentMethodRequired',
};

function resolveGenericMessage(copy: SubscriptionClientErrorCopy): string {
  return (
    copy.billingCheckoutErrorGeneric ??
    copy.billingPlanChangeError ??
    copy.billingAutoRenewPatchError ??
    copy.billingUnlinkPaymentError ??
    'Could not complete the request'
  );
}

export function resolveSubscriptionClientError(
  result: SubscriptionClientErrorSource,
  copy: SubscriptionClientErrorCopy
): string {
  const generic = resolveGenericMessage(copy);

  if (result.code === 'FEATURE_DISABLED') {
    return generic;
  }

  if (result.code) {
    const copyKey = CODE_TO_COPY_KEY[result.code];
    if (copyKey) {
      const localized = copy[copyKey];
      if (localized) {
        return localized;
      }
    }
    return generic;
  }

  return result.error ?? generic;
}

export function pickSubscriptionClientErrorCopy(
  collection:
    | {
        billingPlanChangeError?: string;
        billingCheckoutErrorGeneric?: string;
        billingCheckoutUpgradeIntentRequired?: string;
        billingCheckoutInProgress?: string;
        billingCheckoutNoSubscription?: string;
        billingCheckoutEmailNotVerified?: string;
        billingCheckoutNotAnUpgrade?: string;
        billingCheckoutInvalidStatus?: string;
        billingCheckoutInvalidPlan?: string;
        billingCheckoutProviderUnavailable?: string;
        billingCheckoutPaymentMethodRequired?: string;
        billingAutoRenewPatchError?: string;
        billingUnlinkPaymentError?: string;
      }
    | undefined
): SubscriptionClientErrorCopy {
  if (!collection) {
    return {};
  }

  return {
    billingPlanChangeError: collection.billingPlanChangeError,
    billingCheckoutErrorGeneric: collection.billingCheckoutErrorGeneric,
    billingCheckoutUpgradeIntentRequired: collection.billingCheckoutUpgradeIntentRequired,
    billingCheckoutInProgress: collection.billingCheckoutInProgress,
    billingCheckoutNoSubscription: collection.billingCheckoutNoSubscription,
    billingCheckoutEmailNotVerified: collection.billingCheckoutEmailNotVerified,
    billingCheckoutNotAnUpgrade: collection.billingCheckoutNotAnUpgrade,
    billingCheckoutInvalidStatus: collection.billingCheckoutInvalidStatus,
    billingCheckoutInvalidPlan: collection.billingCheckoutInvalidPlan,
    billingCheckoutProviderUnavailable: collection.billingCheckoutProviderUnavailable,
    billingCheckoutPaymentMethodRequired: collection.billingCheckoutPaymentMethodRequired,
    billingAutoRenewPatchError: collection.billingAutoRenewPatchError,
    billingUnlinkPaymentError: collection.billingUnlinkPaymentError,
  };
}
