import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import type { IInterface } from '@models';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { buildPublicAlbumPagePath } from '@shared/lib/seo/publicPagePaths';
import {
  fetchAdminCopyrightClaim,
  patchAdminCopyrightClaim,
  type AdminCopyrightClaimActivity,
  type AdminCopyrightClaimDetail as AdminCopyrightClaimDetailRow,
  type AdminCopyrightClaimPatchAction,
  type CopyrightClaimAdminStatus,
} from '@shared/lib/adminCopyrightClaimsApi';

import { AdminPanelLayout } from './ui/AdminPanelLayout';

const CLAIMANT_TYPE_LABELS_EN: Record<string, string> = {
  copyright_owner: 'Copyright owner',
  authorized_representative: 'Authorized representative',
  other: 'Other',
};

const CLAIMANT_TYPE_LABELS_RU: Record<string, string> = {
  copyright_owner: 'Правообладатель',
  authorized_representative: 'Представитель',
  other: 'Другое',
};

function formatDateTime(iso: string, lang: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return iso;
  }
}

type AdminClaimsCopy = NonNullable<IInterface['adminCopyrightClaims']>;

function statusDisplay(s: string, copy: AdminClaimsCopy): string {
  switch (s) {
    case 'new':
      return copy.statusNew;
    case 'under_review':
      return copy.statusUnderReview;
    case 'resolved':
      return copy.statusResolved;
    case 'rejected':
      return copy.statusRejected;
    default:
      return s.toUpperCase();
  }
}

function parseAuditDetails(details: unknown): Record<string, unknown> | null {
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    return details as Record<string, unknown>;
  }
  return null;
}

export default function AdminCopyrightClaimDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const copy = ui?.adminCopyrightClaims;
  const [claim, setClaim] = useState<AdminCopyrightClaimDetailRow | null>(null);
  const [activity, setActivity] = useState<AdminCopyrightClaimActivity[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    setActionError(null);
    try {
      const data = await fetchAdminCopyrightClaim(id);
      setClaim(data.claim);
      setActivity(data.activity);
      setNoteDraft(data.claim.adminNote ?? '');
    } catch {
      setError(copy?.notFound ?? 'Not found.');
      setClaim(null);
      setActivity([]);
    }
  }, [id, copy?.notFound]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyPatch = async (body: {
    status?: CopyrightClaimAdminStatus;
    adminNote?: string;
    action?: AdminCopyrightClaimPatchAction;
  }) => {
    if (!id || !claim) return;
    setBusy(true);
    setActionError(null);
    try {
      const data = await patchAdminCopyrightClaim(id, body);
      setClaim(data.claim);
      setActivity(data.activity);
      setNoteDraft(data.claim.adminNote ?? '');
    } catch (e) {
      setActionError(copy?.actionError ?? (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const typeLabels = lang === 'ru' ? CLAIMANT_TYPE_LABELS_RU : CLAIMANT_TYPE_LABELS_EN;
  const claimantTypeLabel = typeLabels[claim?.claimantType ?? ''] ?? claim?.claimantType ?? '';

  const contentTypeLabel =
    claim?.contentType === 'album'
      ? (ui?.copyrightReport?.contentTypeAlbum ?? 'Album')
      : (ui?.copyrightReport?.contentTypeTrack ?? 'Track');

  const albumPath =
    claim?.artistSlug && claim?.albumSlug
      ? buildPublicAlbumPagePath(lang, claim.albumSlug, claim.artistSlug)
      : null;

  const activityLines = useMemo(() => {
    if (!copy) return [];
    return activity.map((row) => {
      const d = parseAuditDetails(row.details);
      const when = formatDateTime(row.createdAt, lang);
      if (row.action === 'claim_submitted') {
        const st = typeof d?.status === 'string' ? d.status : 'new';
        return { key: row.id, when, line1: copy.auditSubmitted, line2: statusDisplay(st, copy) };
      }
      if (row.action === 'claim_status_changed') {
        const from = typeof d?.from === 'string' ? d.from : '';
        const to = typeof d?.to === 'string' ? d.to : '';
        return {
          key: row.id,
          when,
          line1: copy.auditStatusChanged,
          line2: `${statusDisplay(from, copy)} → ${statusDisplay(to, copy)}`,
        };
      }
      if (row.action === 'claim_note_updated') {
        return { key: row.id, when, line1: copy.auditNoteUpdated, line2: null as string | null };
      }
      if (row.action === 'claim_album_copyright_restricted') {
        return {
          key: row.id,
          when,
          line1: copy.auditAlbumRestricted,
          line2: null as string | null,
        };
      }
      if (row.action === 'claim_album_copyright_released') {
        return {
          key: row.id,
          when,
          line1: copy.auditAlbumReleased,
          line2: null as string | null,
        };
      }
      return { key: row.id, when, line1: row.action, line2: null as string | null };
    });
  }, [activity, copy, lang]);

  const status = claim?.status;

  return (
    <AdminPanelLayout title={copy?.detailTitle ?? 'Copyright Claim'}>
      {error ? (
        <p className="admin-panel__placeholder">{error}</p>
      ) : !claim ? (
        <p className="admin-panel__placeholder">…</p>
      ) : (
        <div className="admin-claim-detail">
          <dl className="admin-claim-detail__block">
            <dt>{copy?.statusLabel ?? 'Status'}</dt>
            <dd>{copy ? statusDisplay(claim.status, copy) : claim.status.toUpperCase()}</dd>
          </dl>

          <h2 className="admin-claim-detail__h2">{copy?.actionsTitle ?? 'Actions'}</h2>
          {actionError ? (
            <p className="admin-panel__placeholder admin-panel__placeholder--error">
              {actionError}
            </p>
          ) : null}
          <div className="admin-claim-detail__actions">
            {claim.albumCopyrightRestricted ? (
              <p className="admin-claim-detail__muted admin-claim-detail__muted--inline">
                {copy?.albumRestrictedHint}
              </p>
            ) : null}
            {status === 'new' ? (
              <>
                <button
                  type="button"
                  className="admin-claim-detail__btn"
                  disabled={busy}
                  onClick={() => void applyPatch({ status: 'under_review' })}
                >
                  {copy?.startReview ?? 'Start review'}
                </button>
                <button
                  type="button"
                  className="admin-claim-detail__btn admin-claim-detail__btn--secondary"
                  disabled={busy}
                  onClick={() => void applyPatch({ status: 'rejected' })}
                >
                  {copy?.rejectClaim ?? 'Reject claim'}
                </button>
              </>
            ) : null}
            {status === 'under_review' ? (
              <>
                {!claim.albumCopyrightRestricted ? (
                  <button
                    type="button"
                    className="admin-claim-detail__btn"
                    disabled={busy}
                    onClick={() => void applyPatch({ action: 'temporarilyHideAlbum' })}
                  >
                    {copy?.temporarilyHideAlbum ?? 'Temporarily hide album'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="admin-claim-detail__btn"
                    disabled={busy}
                    onClick={() => void applyPatch({ action: 'restoreAlbumPublication' })}
                  >
                    {copy?.restoreAlbumPublication ?? 'Restore album publication'}
                  </button>
                )}
                <button
                  type="button"
                  className="admin-claim-detail__btn"
                  disabled={busy}
                  onClick={() => void applyPatch({ status: 'resolved' })}
                >
                  {copy?.resolveClaim ?? 'Complete review'}
                </button>
                <button
                  type="button"
                  className="admin-claim-detail__btn admin-claim-detail__btn--secondary"
                  disabled={busy}
                  onClick={() => void applyPatch({ status: 'rejected' })}
                >
                  {copy?.rejectClaim ?? 'Reject claim'}
                </button>
              </>
            ) : null}
            {status === 'resolved' || status === 'rejected' ? (
              <p className="admin-claim-detail__muted admin-claim-detail__muted--inline">
                {copy?.statusLabel ?? 'Status'}: {copy ? statusDisplay(status, copy) : status}
              </p>
            ) : null}
          </div>

          <h2 className="admin-claim-detail__h2">{copy?.reportedSection ?? 'Reported content'}</h2>
          <div className="admin-claim-detail__card">
            <div className="admin-claim-detail__strong">
              {claim.contentTitle || claim.contentId}
            </div>
            <div className="admin-claim-detail__muted">{claim.artistDisplay}</div>
            <div className="admin-claim-detail__type">{contentTypeLabel}</div>
            {albumPath ? (
              <Link
                to={albumPath}
                className="admin-claim-detail__link"
                target="_blank"
                rel="noreferrer"
              >
                {copy?.openContent ?? 'Open reported content'}
              </Link>
            ) : null}
          </div>

          <h2 className="admin-claim-detail__h2">{copy?.claimantSection ?? 'Claimant'}</h2>
          <dl className="admin-claim-detail__block">
            <dt>{copy?.claimantSection ?? 'Name'}</dt>
            <dd>{claim.claimantName}</dd>
            <dt>{copy?.emailLabel ?? 'Email'}</dt>
            <dd>{claim.claimantEmail}</dd>
            <dt>{copy?.typeLabel ?? 'Claimant type'}</dt>
            <dd>{claimantTypeLabel}</dd>
          </dl>

          <h2 className="admin-claim-detail__h2">{copy?.descriptionLabel ?? 'Description'}</h2>
          <pre className="admin-claim-detail__desc">{claim.description}</pre>

          <dl className="admin-claim-detail__block">
            <dt>{copy?.submittedLabel ?? 'Submitted'}</dt>
            <dd>{formatDateTime(claim.createdAt, lang)}</dd>
          </dl>

          <h2 className="admin-claim-detail__h2">{copy?.internalNoteTitle ?? 'Internal note'}</h2>
          <textarea
            className="admin-claim-detail__note"
            rows={4}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            disabled={busy}
            aria-label={copy?.internalNoteTitle ?? 'Internal note'}
          />
          <button
            type="button"
            className="admin-claim-detail__btn admin-claim-detail__btn--note"
            disabled={busy || noteDraft.trim() === (claim.adminNote ?? '').trim()}
            onClick={() => void applyPatch({ adminNote: noteDraft })}
          >
            {busy ? (copy?.savingNote ?? 'Saving…') : (copy?.saveNote ?? 'Save note')}
          </button>
          <p className="admin-claim-detail__hint">{copy?.internalNoteHint}</p>

          <h2 className="admin-claim-detail__h2">{copy?.activityTitle ?? 'Activity'}</h2>
          <ul className="admin-claim-detail__activity">
            {activityLines.map((a) => (
              <li key={a.key}>
                <div className="admin-claim-detail__activity-when">{a.when}</div>
                <div className="admin-claim-detail__activity-line1">{a.line1}</div>
                {a.line2 ? (
                  <div className="admin-claim-detail__activity-line2">{a.line2}</div>
                ) : null}
              </li>
            ))}
          </ul>

          <Link to="/admin/copyright/claims" className="admin-claim-detail__back">
            {copy?.backToList ?? 'Back to list'}
          </Link>
        </div>
      )}
    </AdminPanelLayout>
  );
}
