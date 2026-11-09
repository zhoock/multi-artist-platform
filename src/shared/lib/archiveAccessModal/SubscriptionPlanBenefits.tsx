import type { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { getSubscriptionPlanFeatures } from './subscriptionPlanFeatures';

type Props = {
  lang: 'en' | 'ru';
  ui: ReturnType<typeof selectUiDictionaryFirst>;
};

export function SubscriptionPlanBenefits({ lang, ui }: Props) {
  const features = getSubscriptionPlanFeatures(lang, ui);
  const lead =
    ui?.titles?.subscriptionPlanBenefitsLead ??
    (lang === 'en' ? 'With a subscription you get:' : 'С подпиской вы получаете:');

  return (
    <section className="subscription-plan-modal__benefits" aria-label={lead}>
      <p className="subscription-plan-modal__benefits-lead">{lead}</p>
      <ul className="subscription-plan-modal__benefits-list">
        {features.map(({ key, label, Icon }) => (
          <li key={key} className="subscription-plan-modal__benefits-item">
            <Icon
              className="subscription-plan-modal__benefits-icon"
              size={16}
              strokeWidth={1.75}
              aria-hidden
            />
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
