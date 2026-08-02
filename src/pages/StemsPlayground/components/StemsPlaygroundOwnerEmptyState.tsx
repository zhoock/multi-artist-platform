import { SlidersHorizontal as SlidersHorizontalIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import type { AlbumData } from '@entities/album/lib/transformEditableAlbumData';
import type { IInterface } from '@models';
import { useEffectiveLocation } from '@shared/lib/hooks/useEffectiveLocation';
import { preloadUserDashboardModule } from '@shared/lib/preloadUserDashboard';
import {
  ArtistPageBuilderBlock,
  artistPageBuilderSectionIconProps,
} from '@shared/ui/artistPageBuilder';

type StemsPlaygroundOwnerEmptyStateProps = {
  ui: IInterface | null | undefined;
  dashboardAlbums: AlbumData[];
};

export function buildStemsOwnerDashboardMixerUrl(albums: AlbumData[]): string {
  const firstAlbumWithTracks = albums.find((album) => album.tracks.length > 0);
  if (firstAlbumWithTracks) {
    const params = new URLSearchParams({
      focusAlbum: firstAlbumWithTracks.id,
      focusTrack: firstAlbumWithTracks.tracks[0].id,
    });
    return `/dashboard/mixer?${params.toString()}`;
  }

  const firstAlbum = albums[0];
  if (firstAlbum) {
    const params = new URLSearchParams({ focusAlbum: firstAlbum.id });
    return `/dashboard/mixer?${params.toString()}`;
  }

  return '/dashboard/mixer';
}

export function StemsPlaygroundOwnerEmptyState({
  ui,
  dashboardAlbums,
}: StemsPlaygroundOwnerEmptyStateProps) {
  const navigate = useNavigate();
  const location = useEffectiveLocation();
  const stemsCopy = ui?.stems as Record<string, string | undefined> | undefined;

  const handleOpenMixerEditor = () => {
    preloadUserDashboardModule();
    navigate(buildStemsOwnerDashboardMixerUrl(dashboardAlbums), {
      state: { backgroundLocation: location },
    });
  };

  return (
    <div className="stems-page__builder">
      <ArtistPageBuilderBlock
        layout="section"
        className="artist-page-builder-block--compact"
        icon={<SlidersHorizontalIcon {...artistPageBuilderSectionIconProps()} />}
        title={stemsCopy?.ownerEmptyTitle ?? 'Set up the mixer'}
        description={stemsCopy?.ownerEmptyDescription ?? 'Add and configure stems for your tracks.'}
        actionLabel={stemsCopy?.ownerEmptyAction ?? 'Set up the mixer'}
        onAction={handleOpenMixerEditor}
      />
    </div>
  );
}
