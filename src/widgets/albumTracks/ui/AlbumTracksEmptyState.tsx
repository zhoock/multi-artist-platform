import { Music2 as Music2Icon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import type { IInterface } from '@models';
import { resolveAlbumNoTracksOwnerDescription } from '@entities/album/lib/resolveAlbumNoTracksOwnerDescription';
import { useLang } from '@app/providers/lang';
import { useArtistInPublicCatalog } from '@shared/lib/hooks/useArtistInPublicCatalog';
import {
  ArtistPageBuilderBlock,
  artistPageBuilderSectionIconProps,
} from '@shared/ui/artistPageBuilder';

type AlbumTracksEmptyStateProps = {
  ui: IInterface | null | undefined;
  isOwner: boolean;
  ownerDashboardAlbumId?: string | null;
};

export function AlbumTracksEmptyState({
  ui,
  isOwner,
  ownerDashboardAlbumId,
}: AlbumTracksEmptyStateProps) {
  const navigate = useNavigate();
  const { lang } = useLang();
  const dashboardCopy = ui?.dashboard;
  const artistInCatalog = useArtistInPublicCatalog(isOwner);

  const title = isOwner
    ? (dashboardCopy?.albumNoTracksOwnerTitle ?? 'Add your first track')
    : (dashboardCopy?.albumNoTracksVisitorTitle ?? 'No tracks have been published yet.');

  const description = isOwner
    ? resolveAlbumNoTracksOwnerDescription(ui, { artistInCatalog, lang })
    : (dashboardCopy?.albumNoTracksVisitorDescription ??
      "The artist hasn't added any published tracks to this album yet.");

  const handleGoToAlbum = () => {
    if (!ownerDashboardAlbumId) {
      navigate('/dashboard-new/albums');
      return;
    }
    navigate(`/dashboard-new/albums?focusAlbum=${encodeURIComponent(ownerDashboardAlbumId)}`);
  };

  return (
    <div className="tracks album-tracks__builder">
      <ArtistPageBuilderBlock
        layout="section"
        className="artist-page-builder-block--compact"
        interactive={isOwner}
        icon={<Music2Icon {...artistPageBuilderSectionIconProps()} />}
        title={title}
        description={description}
        actionLabel={dashboardCopy?.mixer?.noTracksAction ?? 'Go to album'}
        onAction={handleGoToAlbum}
      />
    </div>
  );
}
