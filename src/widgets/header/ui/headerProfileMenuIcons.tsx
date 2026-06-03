import {
  CircleStar as CircleStarIcon,
  LogOut as LogOutIcon,
  Music as MusicIcon,
  Settings as SettingsIcon,
  Sparkles as SparklesIcon,
} from 'lucide-react';

import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

type HeaderProfileMenuIconProps = {
  className?: string;
};

const headerProfileMenuIconProps = (className?: string) =>
  dashboardActionIconProps({ size: 20, className });

export function IconSettings({ className }: HeaderProfileMenuIconProps) {
  return <SettingsIcon {...headerProfileMenuIconProps(className)} />;
}

export function IconUpgradeSparkle({ className }: HeaderProfileMenuIconProps) {
  return <SparklesIcon {...headerProfileMenuIconProps(className)} />;
}

export function IconPremiumBadge({ className }: HeaderProfileMenuIconProps) {
  return <CircleStarIcon {...headerProfileMenuIconProps(className)} />;
}

export function IconArtistPage({ className }: HeaderProfileMenuIconProps) {
  return <MusicIcon {...headerProfileMenuIconProps(className)} />;
}

export function IconLogOut({ className }: HeaderProfileMenuIconProps) {
  return <LogOutIcon {...headerProfileMenuIconProps(className)} />;
}
