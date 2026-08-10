import { useMemo } from 'react';

import type { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import {
  getPlanDefinition,
  getPlanDisplayName,
  getPlanPriceCurrencyDisplay,
  getPlanPriceDisplayAmount,
  type SubscriptionPlanSlug,
} from '@shared/lib/payment/subscriptionPlans';

type Props = {
  planSlug: SubscriptionPlanSlug;
  lang: 'ru' | 'en';
  ui: ReturnType<typeof selectUiDictionaryFirst>;
  className?: string;
};

function replaceTemplate(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template
  );
}

export function SubscriptionCheckoutAutopaymentDisclosure({
  planSlug,
  lang,
  ui,
  className = 'billing-modal__checkout-autopayment',
}: Props) {
  const t = ui?.titles;
  const planName = getPlanDisplayName(planSlug);
  const price = getPlanPriceDisplayAmount(planSlug);
  const currency = getPlanPriceCurrencyDisplay();
  const durationDays = getPlanDefinition(planSlug).durationDays;

  const copy = useMemo(() => {
    const values = { planName, price, currency, durationDays };

    return {
      title:
        t?.subscriptionCheckoutAutopaymentTitle ??
        (lang === 'en'
          ? 'Auto-renewal and saved payment method'
          : 'Автопродление и сохранение способа оплаты'),
      saveLine: replaceTemplate(
        t?.subscriptionCheckoutAutopaymentSaveLine ??
          (lang === 'en'
            ? 'When you pay for the {planName} plan, your payment method will be saved for automatic subscription renewal.'
            : 'При оплате тарифа {planName} ваш способ оплаты будет сохранён для автоматического продления подписки.'),
        values
      ),
      nextChargeLine: replaceTemplate(
        t?.subscriptionCheckoutAutopaymentNextChargeLine ??
          (lang === 'en'
            ? 'Next charge: {price} {currency} every {durationDays} days.'
            : 'Следующее списание: {price} {currency} каждые {durationDays} дней.'),
        values
      ),
      frequencyLine: replaceTemplate(
        t?.subscriptionCheckoutAutopaymentFrequencyLine ??
          (lang === 'en'
            ? 'Auto-renewal will occur every {durationDays} days while it is enabled.'
            : 'Автопродление будет выполняться каждые {durationDays} дней, пока оно включено.'),
        values
      ),
      manageLine:
        t?.subscriptionCheckoutAutopaymentManageLine ??
        (lang === 'en'
          ? 'You can turn off auto-renewal or unlink your card at any time in Dashboard → Collection → Payment method. Access continues until the end of the period already paid for.'
          : 'Вы можете в любой момент отключить автопродление или отвязать карту в разделе Кабинет → Коллекция → Способ оплаты. Доступ сохранится до конца уже оплаченного периода.'),
      yookassaNote:
        t?.subscriptionCheckoutAutopaymentYookassaNote ??
        (lang === 'en'
          ? 'On the YooKassa page you will separately confirm saving your payment method.'
          : 'На странице YooKassa вы отдельно подтвердите сохранение способа оплаты.'),
    };
  }, [currency, durationDays, lang, planName, price, t]);

  return (
    <aside className={className} aria-label={copy.title}>
      <p className={`${className}__title`}>{copy.title}</p>
      <p className={`${className}__text`}>{copy.saveLine}</p>
      <p className={`${className}__text`}>{copy.nextChargeLine}</p>
      <p className={`${className}__text`}>{copy.frequencyLine}</p>
      <p className={`${className}__text`}>{copy.manageLine}</p>
      <p className={`${className}__text ${className}__text--note`}>{copy.yookassaNote}</p>
    </aside>
  );
}
