/**
 * Compare our payload vs official YooKassa doc example (minimal + ours).
 */
import { config } from 'dotenv';
config();
import {
  buildInitialSubscriptionPaymentPayload,
  buildRenewalSubscriptionPaymentPayload,
} from '../netlify/functions/lib/subscription-yookassa';
import { getPlanAmountRub } from '../netlify/functions/lib/subscription-billing';

async function postPayment(label: string, payload: Record<string, unknown>): Promise<void> {
  const shopId = process.env.YOOKASSA_SHOP_ID?.trim();
  const secretKey = process.env.YOOKASSA_SECRET_KEY?.trim();
  if (!shopId || !secretKey) throw new Error('Missing creds');

  const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
  const res = await fetch('https://api.yookassa.ru/v3/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
      'Idempotence-Key': `${label}-${Date.now()}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  console.log(
    JSON.stringify(
      {
        label,
        httpStatus: res.status,
        payloadKeys: Object.keys(payload).sort(),
        save_payment_method: payload.save_payment_method ?? null,
        has_payment_method_data: 'payment_method_data' in payload,
        has_confirmation: 'confirmation' in payload,
        response: JSON.parse(text),
      },
      null,
      2
    )
  );
}

async function main(): Promise<void> {
  process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';

  // Official doc example (Умный платеж + безусловное сохранение)
  // https://yookassa.ru/developers/.../save-during-payment
  const officialMinimal = {
    amount: { value: '2.00', currency: 'RUB' },
    confirmation: {
      type: 'redirect',
      return_url: 'https://www.example.com/return_url',
    },
    capture: true,
    description: 'Заказ №72',
    save_payment_method: true,
  };

  const amount = getPlanAmountRub('explorer').toFixed(2);
  const ours = buildInitialSubscriptionPaymentPayload({
    amountValue: amount,
    description: 'Explorer plan',
    returnUrl: 'https://multi-artist-platform.netlify.app/dashboard/collection?payment=success',
    userId: 'e92baead-77d8-402a-a7d1-0cfecd16645e',
    planSlug: 'explorer',
    customerEmail: 'prod-autorenew@pr10-e2e.test',
  });

  // Invalid per self-integration: both save_payment_method AND payment_method_data
  const invalidCombo = {
    ...officialMinimal,
    payment_method_data: { type: 'bank_card' },
  };

  await postPayment('official-minimal', officialMinimal);
  await postPayment('ours-full', ours as Record<string, unknown>);
  await postPayment('invalid-save-plus-pmd', invalidCombo);

  // Malformed request (missing amount) — expect validation error, not shop forbidden
  await postPayment('malformed-missing-amount', {
    capture: true,
    save_payment_method: true,
    confirmation: { type: 'redirect', return_url: 'https://example.com' },
  });

  // Official renewal shape with fake payment_method_id
  const renewal = buildRenewalSubscriptionPaymentPayload({
    amountValue: amount,
    description: 'Explorer renewal',
    userId: 'e92baead-77d8-402a-a7d1-0cfecd16645e',
    planSlug: 'explorer',
    customerEmail: 'prod-autorenew@pr10-e2e.test',
    paymentMethodId: '00000000-0000-0000-0000-000000000099',
  });
  await postPayment('renewal-fake-pm-id', renewal as Record<string, unknown>);
}

main();
