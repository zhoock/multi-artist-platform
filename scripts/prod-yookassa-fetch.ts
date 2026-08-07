/**
 * Fetch YooKassa payment object for production checkout trace.
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

async function main(): Promise<void> {
  const paymentId = process.argv[2] ?? '32079156-000f-5000-b000-15557e11a197';
  const { getYooKassaEnvCredentials } = await import('../netlify/functions/lib/yookassa-env');
  const { fetchPaymentFromYooKassaApi } = await import(
    '../netlify/functions/lib/yookassa-webhook-verify'
  );
  const { mapYooKassaPaymentToProviderPayment } = await import(
    '../netlify/functions/lib/subscription-provider-payment'
  );
  const {
    resolvePaymentMethodIdFromProviderPayment,
    resolvePaymentMethodTitleFromProviderPayment,
  } = await import('../netlify/functions/lib/subscription-fulfillment');
  const { extractSavedPaymentMethodId } = await import(
    '../netlify/functions/lib/subscription-yookassa'
  );
  const { isSubscriptionAutoRenewEnabled } = await import(
    '../netlify/functions/lib/subscription-feature-flag'
  );

  const creds = getYooKassaEnvCredentials();
  if (!creds) {
    console.error('No YooKassa credentials');
    process.exit(1);
  }

  const savedFlag = process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;
  delete process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;

  const apiResult = await fetchPaymentFromYooKassaApi(paymentId, creds.shopId, creds.secretKey);
  if (!apiResult.ok) {
    console.error('YooKassa fetch failed', apiResult);
    process.exit(1);
  }

  const api = apiResult.payment;
  const providerPayment = mapYooKassaPaymentToProviderPayment(api);
  const pmIdProd = providerPayment
    ? resolvePaymentMethodIdFromProviderPayment(providerPayment, {})
    : null;

  process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';
  const pmIdFlagOn = providerPayment
    ? resolvePaymentMethodIdFromProviderPayment(providerPayment, {})
    : null;
  const extractFlagOn = extractSavedPaymentMethodId({
    id: api.id,
    payment_method: api.payment_method as never,
  });

  if (savedFlag === undefined) delete process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;
  else process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = savedFlag;

  console.log(
    JSON.stringify(
      {
        paymentId,
        productionAutoRenewFlag: isSubscriptionAutoRenewEnabled(),
        yookassaStatus: api.status,
        yookassaMetadata: api.metadata,
        yookassaPaymentMethod: api.payment_method ?? null,
        mappedPaymentMethod: providerPayment?.paymentMethod ?? null,
        resolvePmId_productionRuntime: pmIdProd,
        resolvePmId_ifFlagTrue: pmIdFlagOn,
        extractSavedPaymentMethodId_ifFlagTrue: extractFlagOn,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
