import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

/** Section cards (albums, articles, about): was 28px, +~21%. */
export const ARTIST_PAGE_BUILDER_SECTION_ICON_SIZE = 34;

/** Hero cover slot: was 28px, +~21%. */
export const ARTIST_PAGE_BUILDER_HERO_IMAGE_ICON_SIZE = 34;

/** Horizontal bar blocks (payment, social): was 20px, +20%. */
export const ARTIST_PAGE_BUILDER_BAR_ICON_SIZE = 24;

export function artistPageBuilderSectionIconProps() {
  return dashboardActionIconProps({
    size: ARTIST_PAGE_BUILDER_SECTION_ICON_SIZE,
    strokeWidth: 1.5,
  });
}

export function artistPageBuilderHeroImageIconProps() {
  return dashboardActionIconProps({
    size: ARTIST_PAGE_BUILDER_HERO_IMAGE_ICON_SIZE,
    strokeWidth: 1.5,
  });
}

export function artistPageBuilderBarIconProps() {
  return dashboardActionIconProps({ size: ARTIST_PAGE_BUILDER_BAR_ICON_SIZE });
}
