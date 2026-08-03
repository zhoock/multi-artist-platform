import type { LucideIcon } from 'lucide-react';
import { CreditCard, FolderOpen, Headphones, HelpCircle, Shield, User, Wrench } from 'lucide-react';

import type { HelpCategorySlug } from '../model/types';

const HELP_CATEGORY_ICONS: Record<string, LucideIcon> = {
  payments: CreditCard,
  publishing: FolderOpen,
  listeners: Headphones,
  'profile-settings': User,
  technical: Wrench,
  'rules-policy': Shield,
};

export function resolveHelpCategoryIcon(slug: HelpCategorySlug): LucideIcon {
  return HELP_CATEGORY_ICONS[slug] ?? HelpCircle;
}
