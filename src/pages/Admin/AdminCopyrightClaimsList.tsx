import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import {
  fetchAdminCopyrightClaimsList,
  type AdminCopyrightClaimSummary,
  type CopyrightClaimAdminStatus,
} from '@shared/lib/adminCopyrightClaimsApi';

import { AdminPanelLayout } from './ui/AdminPanelLayout';

function formatAdminDate(iso: string, lang: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(d);
  } catch {
    return iso;
  }
}

type FilterKey = CopyrightClaimAdminStatus | 'all';

export default function AdminCopyrightClaimsList() {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const copy = ui?.adminCopyrightClaims;

  const [filter, setFilter] = useState<FilterKey>('all');
  const [claims, setClaims] = useState<AdminCopyrightClaimSummary[] | null>(null);
  const [totalNew, setTotalNew] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchAdminCopyrightClaimsList({ status: filter });
      setClaims(data.claims);
      setTotalNew(data.totalNew);
    } catch {
      setError(copy?.loadError ?? 'Could not load claims.');
      setClaims([]);
    }
  }, [copy?.loadError, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const subtitle =
    claims === null
      ? undefined
      : (copy?.listSubtitle?.replace('{{count}}', String(totalNew)) ?? `${totalNew} new`);

  const filterLabel = (key: FilterKey): string => {
    if (!copy) {
      if (key === 'all') return 'All';
      if (key === 'under_review') return 'Under review';
      return key.replace(/_/g, ' ');
    }
    switch (key) {
      case 'all':
        return copy.filterAll;
      case 'new':
        return copy.filterNew;
      case 'under_review':
        return copy.filterUnderReview;
      case 'resolved':
        return copy.filterResolved;
      case 'rejected':
        return copy.filterRejected;
      default:
        return key;
    }
  };

  const badgeForStatus = (status: string): string => {
    if (!copy) return status.toUpperCase();
    switch (status) {
      case 'new':
        return copy.statusNew;
      case 'under_review':
        return copy.statusUnderReview;
      case 'resolved':
        return copy.statusResolved;
      case 'rejected':
        return copy.statusRejected;
      default:
        return status.toUpperCase();
    }
  };

  const filterKeys: FilterKey[] = ['all', 'new', 'under_review', 'resolved', 'rejected'];

  return (
    <AdminPanelLayout title={copy?.pageTitle ?? 'Copyright Claims'} subtitle={subtitle}>
      <div className="admin-copyright-claims__filters" role="tablist" aria-label={copy?.pageTitle}>
        {filterKeys.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            className={
              filter === key
                ? 'admin-copyright-claims__filter admin-copyright-claims__filter--active'
                : 'admin-copyright-claims__filter'
            }
            onClick={() => setFilter(key)}
          >
            {filterLabel(key)}
          </button>
        ))}
      </div>

      {!error && claims === null ? <p className="admin-panel__placeholder">…</p> : null}
      {error ? (
        <p className="admin-panel__placeholder admin-panel__placeholder--error">{error}</p>
      ) : null}
      {!error && claims && claims.length === 0 ? (
        <p className="admin-panel__placeholder">{copy?.empty ?? 'No claims yet.'}</p>
      ) : null}
      {!error && claims && claims.length > 0 ? (
        <ul className="admin-copyright-claims">
          {claims.map((c) => (
            <li key={c.id}>
              <Link to={`/admin/copyright/claims/${c.id}`} className="admin-copyright-claims__card">
                <div className="admin-copyright-claims__title">{c.contentTitle || c.contentId}</div>
                <div className="admin-copyright-claims__artist">{c.artistDisplay}</div>
                <div className="admin-copyright-claims__claimant">
                  {copy?.claimantPrefix ?? 'Claimant:'} {c.claimantName}
                </div>
                <div className="admin-copyright-claims__row">
                  <span className="admin-copyright-claims__badge">{badgeForStatus(c.status)}</span>
                  <span className="admin-copyright-claims__date">
                    {formatAdminDate(c.createdAt, lang)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </AdminPanelLayout>
  );
}
