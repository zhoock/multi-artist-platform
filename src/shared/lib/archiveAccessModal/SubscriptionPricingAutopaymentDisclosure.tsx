import { Info } from 'lucide-react';
import { useMemo } from 'react';

import type { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import {
  DEFAULT_SUBSCRIPTION_PLAN,
  getPlanDefinition,
} from '@shared/lib/payment/subscriptionPlans';

type Props = {
  lang: 'ru' | 'en';
  ui: ReturnType<typeof selectUiDictionaryFirst>;
};

function replaceTemplate(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template
  );
}

export function SubscriptionPricingAutopaymentDisclosure({ lang, ui }: Props) {
  const t = ui?.titles;
  const durationDays = getPlanDefinition(DEFAULT_SUBSCRIPTION_PLAN).durationDays;

  const copy = useMemo(
    () => ({
      body: replaceTemplate(
        t?.subscriptionPricingAutopaymentBodyLine ??
          (lang === 'en'
            ? 'Auto-renewal: when you pay for the selected plan, your payment method will be saved for automatic subscription renewal. The next charge will be at the selected plan price every {durationDays} days. You can turn off auto-renewal or unlink your card in Dashboard → Collection → Payment method.'
            : 'Автопродление: при оплате выбранного тарифа способ оплаты будет сохранён для автоматического продления подписки. Следующее списание — по цене выбранного тарифа каждые {durationDays} дней. Автопродление можно отключить или изменить в Кабинет → Подписка.'),
        { durationDays }
      ),
      yookassaNote:
        t?.subscriptionPricingAutopaymentYookassaNote ??
        (lang === 'en'
          ? 'On the YooKassa page you will separately confirm saving your payment method.'
          : 'На странице YooKassa вы отдельно подтвердите сохранение способа оплаты.'),
    }),
    [durationDays, lang, t]
  );

  return (
    <div className="subscription-plan-modal__autopayment-note" role="note">
      <p className="subscription-plan-modal__autopayment-note-main">
        <Info
          className="subscription-plan-modal__autopayment-note-icon"
          size={14}
          strokeWidth={1.75}
          aria-hidden
        />
        <span>{copy.body}</span>
      </p>
      <p className="subscription-plan-modal__autopayment-note-yookassa">{copy.yookassaNote}</p>
    </div>
  );
}
