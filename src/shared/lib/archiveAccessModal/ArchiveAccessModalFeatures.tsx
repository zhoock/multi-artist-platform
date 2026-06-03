import {
  Download as DownloadIcon,
  FileText as FileTextIcon,
  Music as MusicIcon,
  SlidersHorizontal as SlidersHorizontalIcon,
  type LucideIcon,
} from 'lucide-react';

import type { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

const featureIconProps = (className: string) =>
  dashboardActionIconProps({ size: 22, strokeWidth: 1.5, className });

type Props = {
  lang: 'ru' | 'en';
  ui: ReturnType<typeof selectUiDictionaryFirst>;
};

export function ArchiveAccessModalFeatures({ lang, ui }: Props) {
  const fTracks =
    ui?.titles?.archiveAccessFeatureTracks ?? (lang === 'en' ? 'Locked tracks' : 'Закрытые треки');
  const fArticles =
    ui?.titles?.archiveAccessFeatureArticles ?? (lang === 'en' ? 'Articles' : 'Статьи');
  const fStems = ui?.titles?.archiveAccessFeatureStems ?? (lang === 'en' ? 'Stems' : 'Стемы');
  const fDownloads =
    ui?.titles?.archiveAccessFeatureDownloads ??
    (lang === 'en' ? 'Album downloads' : 'Скачивание альбомов');

  const features: { Icon: LucideIcon; label: string }[] = [
    { Icon: MusicIcon, label: fTracks },
    { Icon: FileTextIcon, label: fArticles },
    { Icon: SlidersHorizontalIcon, label: fStems },
    { Icon: DownloadIcon, label: fDownloads },
  ];

  return (
    <ul className="archive-access-modal__features">
      {features.map(({ Icon, label }) => (
        <li key={label} className="archive-access-modal__feature">
          <Icon {...featureIconProps('archive-access-modal__feature-icon')} />
          <span className="archive-access-modal__feature-label">{label}</span>
        </li>
      ))}
    </ul>
  );
}
