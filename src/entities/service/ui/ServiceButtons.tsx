import { useLang } from '@app/providers/lang';
import { Download as DownloadIcon, ShoppingBag as ShoppingBagIcon } from 'lucide-react';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import type { String, IAlbums } from '@models';
import { useEffect, useState } from 'react';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { downloadOwnedAlbumZipByAuth } from '@shared/api/purchases';
import { getAlbumKeyForPaymentApis } from '@shared/lib/payment/albumPaymentKey';
import { useAuthSessionUser } from '@shared/lib/hooks/useAuthSessionUser';
import { isAuthenticated } from '@shared/lib/auth';
import { consumePendingAlbumCheckoutForKey } from '@shared/lib/authIntent';
import { AlertModal } from '@shared/ui/alertModal';
import { GetButton } from './GetButton';
import { AlbumCheckoutModal } from './AlbumCheckoutModal';
import {
  hasAlbumPurchaseSectionContent,
  hasAlbumStreamSectionContent,
  hasTruthyButtonUrl,
  isAlbumPaidSaleEnabled,
  isAlbumViewerOwner,
} from '../lib/albumPurchaseUtils';
import { useYooKassaShopAvailableForAlbum } from '../lib/useYooKassaShopAvailableForAlbum';
import { useAlbumOwnedByViewer } from '../lib/useAlbumOwnedByViewer';
import { useArtistArchiveStatus } from '@features/artistArchive/lib/useArtistArchiveStatus';
import { getAlbumPrice } from '../lib/getAlbumPrice';
import { getAlbumArchiveSizeLabel } from '../lib/getAlbumArchiveSizeLabel';
import { getAlbumDownloadOfferLabel } from '../lib/getAlbumDownloadFormatsLabel';
import './style.scss';

type ServiceButtonsProps = {
  album: IAlbums;
  section: string;
};

export {
  hasAlbumPurchaseSectionContent,
  hasAlbumStreamSectionContent,
  isAlbumPaidSaleEnabled,
  isAlbumViewerOwner,
} from '../lib/albumPurchaseUtils';

function ServiceButtonsContent({
  album,
  section,
  labels,
}: {
  album: IAlbums;
  section: string;
  labels: {
    purchase: string;
    stream: string;
    buyAlbum: string;
    buyAlbumPurchased: string;
    buyAlbumViaSupport: string;
    downloadAlbum: string;
    downloadAlbumLoading: string;
    downloadAlbumPreparing: string;
    errorDownloadingAlbum: string;
    errorTitle: string;
  };
}) {
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [downloadErrorOpen, setDownloadErrorOpen] = useState(false);
  const [albumDownloadState, setAlbumDownloadState] = useState<{
    active: boolean;
    percent: number | null;
  }>({ active: false, percent: null });
  const isDownloadingAlbum = albumDownloadState.active;
  const downloadProgress = albumDownloadState.percent;
  const buttons = album?.buttons as String;
  const viewer = useAuthSessionUser();
  const isAlbumOwnerView = isAlbumViewerOwner(album, viewer?.id);

  const isPaidSaleEnabled = isAlbumPaidSaleEnabled(album);
  const hasPurchaseLinks = hasTruthyButtonUrl(buttons, ['itunes', 'bandcamp', 'amazon']);

  const yookassaCheckEnabled = section === 'Купить' && isPaidSaleEnabled && !isAlbumOwnerView;
  const { loading: yookassaLoading, available: yookassaAvailable } =
    useYooKassaShopAvailableForAlbum(album, yookassaCheckEnabled);

  const downloadButtonEnabled =
    section === 'Купить' &&
    isPaidSaleEnabled &&
    !yookassaLoading &&
    yookassaAvailable &&
    !isAlbumOwnerView;
  const { isOwned, ownedPurchase } = useAlbumOwnedByViewer(album, downloadButtonEnabled);
  const artistUserId = album?.userId?.trim() || null;
  const { buttonState: archiveButtonState } = useArtistArchiveStatus(
    downloadButtonEnabled ? artistUserId : null
  );
  /** Активная подписка + артист в коллекции (та же модель, что Hero «В коллекции»). */
  const hasPremiumAccess = archiveButtonState === 'in_collection_active';
  const canDownload = isOwned || hasPremiumAccess;

  const albumKey = getAlbumKeyForPaymentApis(album);

  // Resume after auth: если гость зашёл в auth-gate, залогинился и его вернули
  // на эту страницу, resume-контроллер положил pending-key с этим albumKey.
  // Открываем checkout-модал автоматически, чтобы пользователь не нажимал
  // Buy Album ещё раз. Эффект должен быть до early-return — иначе порядок
  // хуков сломается при F5 на странице без paid sale.
  useEffect(() => {
    if (!downloadButtonEnabled) return;
    if (!albumKey) return;
    if (!isAuthenticated()) return;
    if (consumePendingAlbumCheckoutForKey(albumKey)) {
      setIsCheckoutOpen(true);
    }
  }, [albumKey, downloadButtonEnabled]);

  if (section === 'Купить' && !hasAlbumPurchaseSectionContent(album)) {
    return null;
  }
  if (section === 'Слушать' && !hasAlbumStreamSectionContent(album)) {
    return null;
  }

  if (section === 'Купить' && !hasPurchaseLinks && isPaidSaleEnabled && !isAlbumOwnerView) {
    if (yookassaLoading) {
      return null;
    }
    if (!yookassaAvailable) {
      return null;
    }
  }

  const showDownloadButton = downloadButtonEnabled;
  const albumPrice = showDownloadButton ? getAlbumPrice(album).formatted : '';

  const handlePurchaseButtonClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();

    if (canDownload) {
      if (isDownloadingAlbum || !albumKey) {
        return;
      }

      const downloadTracks =
        album.tracks?.length > 0
          ? album.tracks.map((track) => ({
              trackId: String(track.id),
              title: track.title,
            }))
          : (ownedPurchase?.tracks ?? []);

      if (downloadTracks.length === 0) {
        setDownloadErrorOpen(true);
        return;
      }

      void (async () => {
        setAlbumDownloadState({ active: true, percent: null });

        try {
          await downloadOwnedAlbumZipByAuth(
            {
              albumId: albumKey,
              artist: album.artist,
              album: album.album,
              tracks: downloadTracks,
            },
            {
              onProgress: ({ percent }) => {
                setAlbumDownloadState({ active: true, percent });
              },
            }
          );
        } catch (error) {
          console.error('Error downloading album:', error);
          setDownloadErrorOpen(true);
        } finally {
          setAlbumDownloadState({ active: false, percent: null });
        }
      })();
      return;
    }

    setIsCheckoutOpen(true);
  };

  const purchaseTitle = isDownloadingAlbum
    ? labels.downloadAlbumLoading
    : canDownload
      ? labels.downloadAlbum
      : labels.buyAlbum;
  const downloadOfferLabel = getAlbumDownloadOfferLabel(album);
  const purchaseSubtitle = isDownloadingAlbum
    ? downloadProgress !== null
      ? `${downloadProgress}%`
      : labels.downloadAlbumPreparing
    : isOwned
      ? downloadOfferLabel || labels.buyAlbumPurchased
      : hasPremiumAccess
        ? labels.buyAlbumViaSupport
        : downloadOfferLabel;
  // Size is already in the offer subtitle when known — right side is price (buy) or empty (download).
  const archiveSizeLabel = getAlbumArchiveSizeLabel(album);
  const purchaseRightLabel = canDownload || isDownloadingAlbum ? '' : albumPrice;
  const showRightMeta = Boolean(purchaseRightLabel);
  const progressBarValue = downloadProgress ?? 0;

  return (
    <div className="service-buttons">
      {section === 'Купить' && (
        <>
          <h3>{labels.purchase}</h3>
          <ul
            className="service-buttons__list"
            aria-label="Блок со ссылками на платные музыкальные агрегаторы"
          >
            {showDownloadButton && (
              <li className="service-buttons__list-item service-buttons__list-item--buy-album">
                <a
                  href="#"
                  className={`service-buttons__link service-buttons__link--download${
                    isDownloadingAlbum ? ' service-buttons__link--downloading' : ''
                  }${
                    isDownloadingAlbum && downloadProgress === null
                      ? ' service-buttons__link--download-preparing'
                      : ''
                  }`}
                  aria-label={
                    isDownloadingAlbum
                      ? [
                          labels.downloadAlbumLoading,
                          purchaseSubtitle,
                          archiveSizeLabel || undefined,
                        ]
                          .filter(Boolean)
                          .join(', ')
                      : canDownload
                        ? [labels.downloadAlbum, purchaseSubtitle].filter(Boolean).join(', ')
                        : [labels.buyAlbum, downloadOfferLabel || undefined, albumPrice]
                            .filter(Boolean)
                            .join(', ')
                  }
                  aria-disabled={isDownloadingAlbum}
                  aria-busy={isDownloadingAlbum}
                  tabIndex={isDownloadingAlbum ? -1 : 0}
                  onClick={handlePurchaseButtonClick}
                >
                  <span className="service-buttons__download-icon" aria-hidden="true">
                    {canDownload || isDownloadingAlbum ? (
                      <DownloadIcon {...dashboardActionIconProps({ size: 18 })} />
                    ) : (
                      <ShoppingBagIcon {...dashboardActionIconProps({ size: 18 })} />
                    )}
                  </span>
                  <span className="service-buttons__download-copy">
                    <span className="service-buttons__download-title">{purchaseTitle}</span>
                    {purchaseSubtitle ? (
                      <span className="service-buttons__download-subtitle">{purchaseSubtitle}</span>
                    ) : null}
                  </span>
                  {showRightMeta && (
                    <>
                      <span className="service-buttons__download-divider" aria-hidden="true" />
                      <span className="service-buttons__download-price">{purchaseRightLabel}</span>
                    </>
                  )}
                  {isDownloadingAlbum && (
                    <span
                      className="service-buttons__download-progress"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={downloadProgress ?? 0}
                      aria-label={purchaseSubtitle}
                    >
                      <span
                        className="service-buttons__download-progress-fill"
                        style={
                          downloadProgress !== null
                            ? {
                                inlineSize: `${progressBarValue}%`,
                                width: `${progressBarValue}%`,
                              }
                            : undefined
                        }
                      />
                    </span>
                  )}
                </a>
              </li>
            )}
            <GetButton
              buttonClass="icon-applemusic"
              buttonUrl={buttons?.itunes}
              buttonText="iTunes"
            />
            <GetButton
              buttonClass="icon-bandcamp"
              buttonUrl={buttons?.bandcamp}
              buttonText="Bandcamp"
            />
            <GetButton buttonClass="icon-amazon" buttonUrl={buttons?.amazon} buttonText="Amazon" />
          </ul>
        </>
      )}

      {section === 'Слушать' && (
        <>
          <h3>{labels.stream}</h3>
          <ul
            className="service-buttons__list"
            aria-label="Блок со ссылками на бесплатные музыкальные агрегаторы"
          >
            <GetButton
              buttonClass="icon-apple"
              buttonUrl={buttons?.apple}
              buttonText="Apple Music"
            />
            <GetButton buttonClass="icon-vk" buttonUrl={buttons?.vk} buttonText="ВКонтакте" />
            <GetButton
              buttonClass="icon-youtube1"
              buttonUrl={buttons?.youtube}
              buttonText="YouTube"
            />
            <GetButton
              buttonClass="icon-spotify"
              buttonUrl={buttons?.spotify}
              buttonText="Spotify"
            />
            <GetButton buttonClass="icon-yandex" buttonUrl={buttons?.yandex} buttonText="Yandex" />
            <GetButton buttonClass="icon-deezer" buttonUrl={buttons?.deezer} buttonText="Deezer" />
            <GetButton buttonClass="icon-tidal" buttonUrl={buttons?.tidal} buttonText="Tidal" />
          </ul>
        </>
      )}

      {section === 'Купить' && showDownloadButton && (
        <AlbumCheckoutModal
          isOpen={isCheckoutOpen}
          album={album}
          onClose={() => setIsCheckoutOpen(false)}
        />
      )}

      <AlertModal
        isOpen={downloadErrorOpen}
        title={labels.errorTitle}
        message={labels.errorDownloadingAlbum}
        variant="error"
        onClose={() => setDownloadErrorOpen(false)}
      />
    </div>
  );
}

export function ServiceButtons({ album, section }: ServiceButtonsProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));

  const fallbackLabels =
    lang === 'en'
      ? {
          purchase: 'Purchase',
          stream: 'Stream',
          buyAlbum: 'Buy Album',
          buyAlbumPurchased: 'Purchased',
          buyAlbumViaSupport: 'Included with support',
          downloadAlbum: 'Download Album',
          downloadAlbumLoading: 'Downloading...',
          downloadAlbumPreparing: 'Preparing archive...',
          errorDownloadingAlbum: 'Error downloading album. Please try again.',
          errorTitle: 'Error',
        }
      : {
          purchase: 'Купить',
          stream: 'Слушать',
          buyAlbum: 'Купить альбом',
          buyAlbumPurchased: 'Куплено',
          buyAlbumViaSupport: 'Входит в поддержку',
          downloadAlbum: 'Скачать альбом',
          downloadAlbumLoading: 'Скачивание...',
          downloadAlbumPreparing: 'Подготовка архива...',
          errorDownloadingAlbum: 'Ошибка при скачивании альбома. Попробуйте ещё раз.',
          errorTitle: 'Ошибка',
        };
  const buttons = ui?.buttons ?? {};
  const labels = {
    purchase: buttons.purchase ?? fallbackLabels.purchase,
    stream: buttons.stream ?? fallbackLabels.stream,
    buyAlbum: buttons.buyAlbum ?? fallbackLabels.buyAlbum,
    buyAlbumPurchased: buttons.buyAlbumPurchased ?? fallbackLabels.buyAlbumPurchased,
    buyAlbumViaSupport: buttons.buyAlbumViaSupport ?? fallbackLabels.buyAlbumViaSupport,
    downloadAlbum: buttons.downloadAlbum ?? fallbackLabels.downloadAlbum,
    downloadAlbumLoading: buttons.downloadAlbumLoading ?? fallbackLabels.downloadAlbumLoading,
    downloadAlbumPreparing: buttons.downloadAlbumPreparing ?? fallbackLabels.downloadAlbumPreparing,
    errorDownloadingAlbum: buttons.errorDownloadingAlbum ?? fallbackLabels.errorDownloadingAlbum,
    errorTitle: ui?.titles?.error ?? ui?.dashboard?.error ?? fallbackLabels.errorTitle,
  };

  return <ServiceButtonsContent album={album} section={section} labels={labels} />;
}

export default ServiceButtons;
