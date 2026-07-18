// src/pages/UserDashboard/components/purchases/MyPurchasesContent.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { useLang } from '@app/providers/lang';
import { AlbumCoverImage } from '@entities/album';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import {
  DashboardButton,
  DashboardCard,
  DashboardRow,
  DashboardRowValue,
  DashboardLoadingState,
} from '@shared/ui/dashboard';
import {
  downloadAlbumZip,
  getMyPurchases,
  revokePurchase,
  type Purchase,
} from '@shared/api/purchases';
import { ConfirmationModal } from '@shared/ui/confirmationModal';
import { MyPurchasesEmptyState } from './MyPurchasesEmptyState';
import './MyPurchasesContent.scss';

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
      ) : loading ? (
        <DashboardLoadingState className="my-purchases__loading" />
      ) : (
        <div className="user-dashboard__section">
          {error && <div className="my-purchases__error">{error}</div>}

          {!error && purchases.length > 0 && (
            <div className="my-purchases__list">
              {purchases.map((purchase) => (
                <DashboardCard key={purchase.id} className="my-purchases__card">
                  <div className="my-purchases__header">
                    {purchase.cover ? (
                      <div className="my-purchases__cover">
                        <AlbumCoverImage
                          cover={purchase.cover}
                          userId={purchase.albumUserId ?? undefined}
                          alt={`${purchase.artist} — ${purchase.album}`}
                          contextAlbumId={purchase.albumId}
                          loading="lazy"
                          decoding="async"
                          className="my-purchases__cover-image"
                        />
                      </div>
                    ) : null}
                    <div className="my-purchases__header-meta">
                      <h3 className="my-purchases__title">
                        {purchase.artist} — {purchase.album}
                      </h3>
                      <p className="my-purchases__meta-line">
                        {copy?.purchased ?? 'Purchased:'} {formatDate(purchase.purchasedAt)}
                      </p>
                    </div>
                  </div>

                  <div className="my-purchases__tracks">
                    {purchase.tracks.map((track, index) => (
                      <DashboardRow
                        key={track.trackId}
                        className="my-purchases__track-row"
                        label={
                          <span className="my-purchases__track-label">
                            <span className="my-purchases__track-number">{index + 1}.</span>
                            <span className="my-purchases__track-title">{track.title}</span>
                          </span>
                        }
                      >
                        <DashboardRowValue aria-hidden="true" />
                      </DashboardRow>
                    ))}
                  </div>

                  <div className="my-purchases__footer">
                    <DashboardButton
                      variant="outline"
                      destructive
                      aria-label={copy?.removePurchase ?? 'Remove'}
                      disabled={isRemoving && purchaseToRemove?.id === purchase.id}
                      onClick={() => setPurchaseToRemove(purchase)}
                    >
                      {copy?.removePurchase ?? 'Remove'}
                    </DashboardButton>
                    <DashboardButton
                      className="my-purchases__download"
                      variant="primary"
                      aria-label={copy?.download ?? 'Download'}
                      loading={downloadingAlbums.has(purchase.id)}
                      disabled={downloadingAlbums.has(purchase.id) || purchase.tracks.length === 0}
                      onClick={() => void handleDownloadAlbum(purchase)}
                    >
                      {copy?.download ?? 'Download'}
                    </DashboardButton>
                  </div>
                </DashboardCard>
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
