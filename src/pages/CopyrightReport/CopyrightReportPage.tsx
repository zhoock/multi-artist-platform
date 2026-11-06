import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { buildPublicAlbumPagePath } from '@shared/lib/seo/publicPagePaths';
import { formatAlbumDisplayFullName } from '@shared/lib/profileDisplayName';
import { useSiteArtistDisplayName } from '@shared/lib/hooks/useSiteArtistDisplayName';

import './CopyrightReportPage.scss';

type ContentType = 'album' | 'track';

type ContextPayload = {
  contentType: ContentType;
  contentId: string;
  title: string;
  artistName: string;
  artistSlug: string;
  albumId?: string;
  albumTitle?: string;
  trackSlug?: string;
};

type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'submitted';

export default function CopyrightReportPage() {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const copy = ui?.copyrightReport;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const contentType = (searchParams.get('contentType') ??
    searchParams.get('content_type')) as ContentType | null;
  const contentId = (searchParams.get('contentId') ?? searchParams.get('content_id') ?? '').trim();
  const artistSlug = (
    searchParams.get('artistSlug') ??
    searchParams.get('artist') ??
    searchParams.get('artist_slug') ??
    ''
  ).trim();

  const { displayName: artistFromParam } = useSiteArtistDisplayName(lang, {
    artistSlug: artistSlug || null,
  });

  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [context, setContext] = useState<ContextPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [claimantType, setClaimantType] = useState<
    'copyright_owner' | 'authorized_representative' | 'other'
  >('copyright_owner');
  const [description, setDescription] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const artistLine = useMemo(() => {
    if (context?.artistName) return context.artistName;
    return artistFromParam || artistSlug;
  }, [artistFromParam, artistSlug, context?.artistName]);

  useEffect(() => {
    if (
      !contentType ||
      (contentType !== 'album' && contentType !== 'track') ||
      !contentId ||
      !artistSlug
    ) {
      setLoadState('error');
      setLoadError(copy?.errors?.missingParams ?? 'Invalid link.');
      return;
    }

    let cancelled = false;
    setLoadState('loading');
    setLoadError(null);

    const qs = new URLSearchParams({
      contentType,
      contentId,
      artistSlug,
    });

    void (async () => {
      try {
        const res = await fetch(`/api/copyright-claims/context?${qs.toString()}`);
        const json = (await res.json()) as {
          success?: boolean;
          data?: ContextPayload;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.success || !json.data) {
          setLoadState('error');
          setLoadError(json.error ?? copy?.errors?.notFound ?? 'Content not found.');
          return;
        }
        setContext(json.data);
        setLoadState('ready');
      } catch {
        if (!cancelled) {
          setLoadState('error');
          setLoadError(copy?.errors?.generic ?? 'Something went wrong.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [contentType, contentId, artistSlug, copy?.errors]);

  const albumPath =
    context &&
    buildPublicAlbumPagePath(
      lang,
      contentType === 'album' ? context.contentId : (context.albumId ?? ''),
      context.artistSlug
    );

  const titleLine = useMemo(() => {
    if (!context) return '';
    if (context.contentType === 'album') {
      return formatAlbumDisplayFullName(artistLine || '', context.title);
    }
    return context.title;
  }, [artistLine, context]);

  const backToAlbumPath = albumPath ?? '/';

  const canSubmit =
    loadState === 'ready' &&
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    description.trim().length >= 20 &&
    confirmed &&
    !submitting;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!context || !canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/copyright-claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType: context.contentType,
          contentId: context.contentId,
          artistSlug: context.artistSlug,
          claimantName: name.trim(),
          claimantEmail: email.trim(),
          claimantType,
          description: description.trim(),
        }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        setSubmitError(json.error ?? copy?.errors?.submit ?? 'Could not submit report.');
        setSubmitting(false);
        return;
      }
      setLoadState('submitted');
    } catch {
      setSubmitError(copy?.errors?.submit ?? 'Could not submit report.');
    } finally {
      setSubmitting(false);
    }
  }

  const pageTitle = copy?.pageTitle ?? 'Report copyright infringement';

  if (loadState === 'submitted') {
    return (
      <div className="copyright-report">
        <Helmet>
          <title>{pageTitle}</title>
        </Helmet>
        <div className="copyright-report__inner">
          <h1 className="copyright-report__h1">{copy?.successTitle ?? 'Report submitted'}</h1>
          <p className="copyright-report__lead">{copy?.successBody ?? 'Thank you.'}</p>
          <Link className="copyright-report__back" to={backToAlbumPath}>
            {copy?.backToAlbum ?? 'Back to album'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="copyright-report">
      <Helmet>
        <title>{pageTitle}</title>
      </Helmet>
      <div className="copyright-report__inner">
        <h1 className="copyright-report__h1">{pageTitle}</h1>

        {loadState === 'loading' && (
          <p className="copyright-report__muted">{copy?.loading ?? 'Loading…'}</p>
        )}

        {loadState === 'error' && <p className="copyright-report__error">{loadError}</p>}

        {loadState === 'ready' && context && (
          <>
            <section
              className="copyright-report__card"
              aria-label={copy?.contentLabel ?? 'Reported content'}
            >
              <div className="copyright-report__kicker">
                {copy?.contentLabel ?? 'Content being reported'}
              </div>
              <div className="copyright-report__content-title">{titleLine}</div>
              {context.contentType === 'track' && context.albumTitle ? (
                <div className="copyright-report__meta">{context.albumTitle}</div>
              ) : null}
              <div className="copyright-report__meta">{artistLine}</div>
              <div className="copyright-report__type">
                {context.contentType === 'album'
                  ? (copy?.contentTypeAlbum ?? 'Album')
                  : (copy?.contentTypeTrack ?? 'Track')}
              </div>
            </section>

            <form className="copyright-report__form" onSubmit={handleSubmit} noValidate>
              <label className="copyright-report__field">
                <span>{copy?.nameLabel ?? 'Name / Organization'}</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  required
                  maxLength={255}
                />
              </label>

              <label className="copyright-report__field">
                <span>{copy?.emailLabel ?? 'Email'}</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </label>

              <fieldset className="copyright-report__fieldset">
                <legend>{copy?.roleLegend ?? 'I am:'}</legend>
                <label className="copyright-report__radio">
                  <input
                    type="radio"
                    name="claimantType"
                    checked={claimantType === 'copyright_owner'}
                    onChange={() => setClaimantType('copyright_owner')}
                  />
                  {copy?.roleOwner ?? 'Copyright owner'}
                </label>
                <label className="copyright-report__radio">
                  <input
                    type="radio"
                    name="claimantType"
                    checked={claimantType === 'authorized_representative'}
                    onChange={() => setClaimantType('authorized_representative')}
                  />
                  {copy?.roleRep ?? 'Authorized representative'}
                </label>
                <label className="copyright-report__radio">
                  <input
                    type="radio"
                    name="claimantType"
                    checked={claimantType === 'other'}
                    onChange={() => setClaimantType('other')}
                  />
                  {copy?.roleOther ?? 'Other'}
                </label>
              </fieldset>

              <label className="copyright-report__field">
                <span>{copy?.descriptionLabel ?? 'Description'}</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    copy?.descriptionPlaceholder ??
                    'Please describe why you believe this content infringes your copyright.'
                  }
                  required
                  minLength={20}
                  maxLength={8000}
                  rows={8}
                />
              </label>

              <label className="copyright-report__check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <span>
                  {copy?.confirmLabel ??
                    'I confirm that the information provided is accurate and that I am the copyright owner or authorized to act on behalf of the copyright owner.'}
                </span>
              </label>

              {submitError ? <p className="copyright-report__error">{submitError}</p> : null}

              <div className="copyright-report__actions">
                <button type="submit" className="copyright-report__submit" disabled={!canSubmit}>
                  {submitting
                    ? (copy?.submitting ?? 'Submitting…')
                    : (copy?.submit ?? 'Submit report')}
                </button>
                <button
                  type="button"
                  className="copyright-report__cancel"
                  onClick={() => navigate(-1)}
                >
                  {copy?.cancel ?? 'Cancel'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
