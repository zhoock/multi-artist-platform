// src/pages/UserDashboard/components/purchases/MyPurchasesContent.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Download as DownloadIcon, Music as MusicIcon, Trash2 as Trash2Icon } from 'lucide-react';
import { useLang } from '@app/providers/lang';
import { AlbumCoverImage } from '@entities/album';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import type { SupportedLang } from '@shared/model/lang';
import { DashboardButton, DashboardCard, DashboardLoadingState } from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
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

function formatTracksCount(
  count: number,
  lang: SupportedLang,
  labels: { one?: string; few?: string; many?: string }
): string {
  const one = labels.one ?? '{count} track';
  const few = labels.few ?? '{count} tracks';
  const many = labels.many ?? '{count} tracks';

  let template = many;
  if (lang === 'ru') {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) template = one;
    else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) template = few;
  } else if (count === 1) {
    template = one;
  }

  return template.replace('{count}', String(count));
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
              {purchases.map((purchase) => {
                const trackCount = purchase.tracks.length;
                const isDownloading = downloadingAlbums.has(purchase.id);

                return (
                  <DashboardCard key={purchase.id} className="my-purchases__card">
                    <div className="my-purchases__row">
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

                      <div className="my-purchases__meta">
                        <h3 className="my-purchases__title">
                          {purchase.artist} — {purchase.album}
                        </h3>
                        <p className="my-purchases__meta-line">
                          {copy?.purchased ?? 'Purchased:'} {formatDate(purchase.purchasedAt)}
                        </p>
                        <p className="my-purchases__tracks-count">
                          <MusicIcon
                            {...dashboardActionIconProps({ size: 14, strokeWidth: 1.75 })}
                          />
                          <span>
                            {formatTracksCount(trackCount, lang, {
                              one: copy?.tracksCountOne,
                              few: copy?.tracksCountFew,
                              many: copy?.tracksCountMany,
                            })}
                          </span>
                        </p>
                      </div>

                      <div className="my-purchases__actions">
                        <DashboardButton
                          className="my-purchases__download"
                          variant="icon"
                          aria-label={copy?.download ?? 'Download'}
                          disabled={isDownloading || trackCount === 0}
                          onClick={() => void handleDownloadAlbum(purchase)}
                        >
                          <DownloadIcon {...dashboardActionIconProps()} />
                        </DashboardButton>
                        <DashboardButton
                          className="my-purchases__remove"
                          variant="icon"
                          destructive
                          aria-label={copy?.removePurchase ?? 'Remove'}
                          disabled={isRemoving && purchaseToRemove?.id === purchase.id}
                          onClick={() => setPurchaseToRemove(purchase)}
                        >
                          <Trash2Icon {...dashboardActionIconProps()} />
                        </DashboardButton>
                      </div>
                    </div>
                  </DashboardCard>
                );
              })}
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
