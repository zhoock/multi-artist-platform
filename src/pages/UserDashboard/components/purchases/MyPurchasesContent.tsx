// src/pages/UserDashboard/components/purchases/MyPurchasesContent.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Download as DownloadIcon } from 'lucide-react';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import {
  downloadAlbumZip,
  getMyPurchases,
  getTrackDownloadUrl,
  revokePurchase,
  type Purchase,
} from '@shared/api/purchases';
import { getUserImageUrl } from '@shared/api/albums';
import { ConfirmationModal } from '@shared/ui/confirmationModal';
import { MyPurchasesEmptyState } from './MyPurchasesEmptyState';
import '../../UserDashboard.style.scss';

function triggerBlobDownload(blob: Blob, filename: string) {
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
}

export function MyPurchasesContent() {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const copy = ui?.dashboard?.myPurchases;
  const dashboardCopy = ui?.dashboard;

  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingTracks, setDownloadingTracks] = useState<Set<string>>(new Set());
  const [downloadedItems, setDownloadedItems] = useState<Set<string>>(new Set());
  const [downloadingAlbums, setDownloadingAlbums] = useState<Set<string>>(new Set());
  const [purchaseToRemove, setPurchaseToRemove] = useState<Purchase | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const loadPurchases = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getMyPurchases();
      setPurchases(data);
    } catch (err) {
      console.error('Error fetching purchases:', err);
      setError(
        err instanceof Error ? err.message : (copy?.loadFailed ?? 'Failed to load purchases')
      );
      setPurchases([]);
    } finally {
      setLoading(false);
    }
  }, [copy?.loadFailed]);

  useEffect(() => {
    void loadPurchases();
  }, [loadPurchases]);

  const handleDownloadTrack = async (purchaseToken: string, trackId: string) => {
    const downloadKey = `${purchaseToken}-${trackId}`;

    if (downloadingTracks.has(downloadKey)) {
      return;
    }

    try {
      setDownloadingTracks((prev) => new Set(prev).add(downloadKey));
      setDownloadedItems((prev) => {
        const next = new Set(prev);
        next.delete(downloadKey);
        return next;
      });

      const url = getTrackDownloadUrl(purchaseToken, trackId);
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to download: ${response.statusText}`);
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `track-${trackId}.wav`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename\*=UTF-8''(.+)/);
        if (filenameMatch) {
          filename = decodeURIComponent(filenameMatch[1]);
        } else {
          const filenameMatch2 = contentDisposition.match(/filename="(.+)"/);
          if (filenameMatch2) {
            filename = filenameMatch2[1];
          }
        }
      }

      triggerBlobDownload(blob, filename);

      setDownloadedItems((prev) => new Set(prev).add(downloadKey));
      setTimeout(() => {
        setDownloadedItems((prev) => {
          const next = new Set(prev);
          next.delete(downloadKey);
          return next;
        });
      }, 2000);
    } catch (err) {
      console.error('Error downloading track:', err);
      alert(copy?.errorDownloadingTrack ?? 'Error downloading track. Please try again.');
    } finally {
      setDownloadingTracks((prev) => {
        const next = new Set(prev);
        next.delete(downloadKey);
        return next;
      });
    }
  };

  const handleDownloadAlbum = async (purchase: Purchase) => {
    if (downloadingAlbums.has(purchase.id)) {
      return;
    }

    try {
      setDownloadingAlbums((prev) => new Set(prev).add(purchase.id));
      const { blob, filename } = await downloadAlbumZip(purchase);
      triggerBlobDownload(blob, filename);
    } catch (err) {
      console.error('Error downloading album:', err);
      alert(copy?.errorDownloadingAlbum ?? 'Error downloading album. Please try again.');
    } finally {
      setDownloadingAlbums((prev) => {
        const next = new Set(prev);
        next.delete(purchase.id);
        return next;
      });
    }
  };

  const handleConfirmRemove = async () => {
    if (!purchaseToRemove || isRemoving) {
      return;
    }

    const purchaseId = purchaseToRemove.id;

    try {
      setIsRemoving(true);
      await revokePurchase(purchaseId);
      setPurchases((prev) => prev.filter((purchase) => purchase.id !== purchaseId));
      setPurchaseToRemove(null);
    } catch (err) {
      console.error('Error removing purchase:', err);
      alert(copy?.removePurchaseFailed ?? 'Failed to remove purchase. Please try again.');
    } finally {
      setIsRemoving(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <>
      {!loading && !error && purchases.length === 0 ? (
        <MyPurchasesEmptyState ui={ui} />
      ) : (
        <div className="user-dashboard__my-purchases">
          {loading && (
            <p className="user-dashboard__my-purchases-loading">
              {copy?.loadingPurchases ?? 'Loading purchases...'}
            </p>
          )}

          {error && !loading && <div className="user-dashboard__my-purchases-error">{error}</div>}

          {!loading && !error && purchases.length > 0 && (
            <div className="user-dashboard__my-purchases-list">
              {purchases.map((purchase) => (
                <div key={purchase.id} className="user-dashboard__my-purchases-purchase">
                  <div className="user-dashboard__my-purchases-purchase-header">
                    {purchase.cover && (
                      <div className="user-dashboard__my-purchases-purchase-cover">
                        <img
                          src={(() => {
                            const ownerId = purchase.albumUserId ?? undefined;
                            const imageUrl = getUserImageUrl(
                              purchase.cover,
                              'albums',
                              '.jpg',
                              true,
                              ownerId
                            );
                            if (imageUrl == null) {
                              return '/images/album-placeholder.png';
                            }
                            return imageUrl;
                          })()}
                          alt={`${purchase.artist} — ${purchase.album}`}
                          className="user-dashboard__my-purchases-purchase-cover-image"
                        />
                      </div>
                    )}
                    <div className="user-dashboard__my-purchases-purchase-info">
                      <h4 className="user-dashboard__my-purchases-purchase-title">
                        {purchase.artist} — {purchase.album}
                      </h4>
                      <p className="user-dashboard__my-purchases-purchase-date">
                        {copy?.purchased ?? 'Purchased:'} {formatDate(purchase.purchasedAt)}
                      </p>
                      {purchase.downloadCount > 0 && (
                        <p className="user-dashboard__my-purchases-purchase-downloads">
                          {copy?.downloads ?? 'Downloads:'} {purchase.downloadCount}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="user-dashboard__my-purchases-tracks">
                    <div className="user-dashboard__my-purchases-tracks-grid">
                      <h5 className="user-dashboard__my-purchases-tracks-title">
                        {copy?.tracks ?? 'Tracks'}
                      </h5>
                      <button
                        type="button"
                        className="user-dashboard__my-purchases-download-all"
                        aria-label={copy?.downloadAll ?? 'Download all'}
                        disabled={
                          downloadingAlbums.has(purchase.id) || purchase.tracks.length === 0
                        }
                        onClick={() => void handleDownloadAlbum(purchase)}
                      >
                        {downloadingAlbums.has(purchase.id) ? (
                          <>
                            <svg
                              className="user-dashboard__download-spinner"
                              width="14"
                              height="14"
                              viewBox="0 0 14 14"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                              aria-hidden
                            >
                              <circle
                                cx="7"
                                cy="7"
                                r="6"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeOpacity="0.3"
                              />
                              <path
                                d="M 7 1 A 6 6 0 0 1 13 7"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                              />
                            </svg>
                            {copy?.preparingDownload ?? 'Preparing download...'}
                          </>
                        ) : (
                          <>
                            <DownloadIcon
                              {...dashboardActionIconProps({ size: 14, strokeWidth: 1.5 })}
                            />
                            {copy?.downloadAll ?? 'Download all'}
                          </>
                        )}
                      </button>

                      {purchase.tracks.map((track, index) => {
                        const downloadKey = `${purchase.purchaseToken}-${track.trackId}`;
                        const isDownloading = downloadingTracks.has(downloadKey);
                        const isDownloaded = downloadedItems.has(downloadKey);

                        return (
                          <React.Fragment key={track.trackId}>
                            <div className="user-dashboard__my-purchases-track">
                              <span className="user-dashboard__my-purchases-track-number">
                                {index + 1}.
                              </span>
                              <span className="user-dashboard__my-purchases-track-title">
                                {track.title}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="user-dashboard__my-purchases-track-download"
                              onClick={() =>
                                handleDownloadTrack(purchase.purchaseToken, track.trackId)
                              }
                              title={copy?.downloadTrack ?? 'Download track'}
                              disabled={isDownloading}
                            >
                              {isDownloading ? (
                                <>
                                  <svg
                                    className="user-dashboard__download-spinner"
                                    width="14"
                                    height="14"
                                    viewBox="0 0 14 14"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                    aria-hidden
                                  >
                                    <circle
                                      cx="7"
                                      cy="7"
                                      r="6"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeOpacity="0.3"
                                    />
                                    <path
                                      d="M 7 1 A 6 6 0 0 1 13 7"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                    />
                                  </svg>
                                  {copy?.downloading ?? 'Downloading...'}
                                </>
                              ) : isDownloaded ? (
                                (copy?.downloaded ?? 'Downloaded')
                              ) : (
                                (copy?.download ?? 'Download')
                              )}
                            </button>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>

                  <div className="user-dashboard__my-purchases-purchase-footer">
                    <button
                      type="button"
                      className="user-dashboard__my-purchases-remove"
                      aria-label={copy?.removePurchase ?? 'Remove purchase'}
                      disabled={isRemoving && purchaseToRemove?.id === purchase.id}
                      onClick={() => setPurchaseToRemove(purchase)}
                    >
                      {copy?.removePurchase ?? 'Remove purchase'}
                    </button>
                    <p className="user-dashboard__my-purchases-remove-hint">
                      {copy?.removePurchaseHint ??
                        'You will lose access to this album and all downloads.'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmationModal
        isOpen={purchaseToRemove !== null}
        title={copy?.removePurchaseConfirmTitle ?? 'Remove purchase?'}
        message={
          copy?.removePurchaseHint ?? 'You will lose access to this album and all downloads.'
        }
        irreversibleHint={null}
        variant="danger"
        confirmText={copy?.removePurchaseConfirm ?? 'Remove'}
        cancelText={dashboardCopy?.cancel ?? 'Cancel'}
        closeLabel={dashboardCopy?.close ?? 'Close'}
        onCancel={() => {
          if (!isRemoving) {
            setPurchaseToRemove(null);
          }
        }}
        onConfirm={() => void handleConfirmRemove()}
      />
    </>
  );
}
