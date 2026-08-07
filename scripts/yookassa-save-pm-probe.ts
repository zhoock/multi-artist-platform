import { config } from 'dotenv';
config();
import { buildInitialSubscriptionPaymentPayload } from '../netlify/functions/lib/subscription-yookassa';

async function main(): Promise<void> {
  for (const flag of ['true', 'false'] as const) {
    process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = flag;
    const payload = buildInitialSubscriptionPaymentPayload({
      amountValue: '290.00',
      description: 'Explorer plan',
      returnUrl: 'https://multi-artist-platform.netlify.app/dashboard/collection?payment=success',
      userId: '00000000-0000-0000-0000-000000000001',
      planSlug: 'explorer',
      customerEmail: 'prod-autorenew-probe@pr10-e2e.test',
    });

    const shopId = process.env.YOOKASSA_SHOP_ID?.trim();
    const secretKey = process.env.YOOKASSA_SECRET_KEY?.trim();
    if (!shopId || !secretKey) throw new Error('Missing YooKassa creds');

    const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
    const res = await fetch(process.env.YOOKASSA_API_URL || 'https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
        'Idempotence-Key': `probe-${flag}-${Date.now()}`,
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    console.log(
      JSON.stringify(
        {
          flag,
          status: res.status,
          save_payment_method: payload.save_payment_method ?? false,
          body: text.slice(0, 400),
        },
        null,
        2
      )
    );
  }
}

main();
