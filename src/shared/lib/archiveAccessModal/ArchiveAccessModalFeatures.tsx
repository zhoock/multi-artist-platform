import type { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { getSubscriptionPlanFeatures } from './subscriptionPlanFeatures';

const featureIconProps = (className: string) =>
  dashboardActionIconProps({ size: 22, strokeWidth: 1.5, className });

type Props = {
  lang: 'ru' | 'en';
  ui: ReturnType<typeof selectUiDictionaryFirst>;
};

export function ArchiveAccessModalFeatures({ lang, ui }: Props) {
  const features = getSubscriptionPlanFeatures(lang, ui);

  return (
    <ul className="add-artist-to-archive-modal__features">
      {features.map(({ key, label, Icon }) => (
        <li key={key} className="add-artist-to-archive-modal__feature">
          <Icon {...featureIconProps('add-artist-to-archive-modal__feature-icon')} />
          <span className="add-artist-to-archive-modal__feature-label">{label}</span>
        </li>
      ))}
    </ul>
  );
}
