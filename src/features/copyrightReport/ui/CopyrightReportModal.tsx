import { useCallback, useId, useMemo, useState, type FormEvent } from 'react';

import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { buildPublicAlbumPagePath } from '@shared/lib/seo/publicPagePaths';
import { useSiteArtistDisplayName } from '@shared/lib/hooks/useSiteArtistDisplayName';
import {
  MAX_COPYRIGHT_CLAIM_DESCRIPTION_CHARS_UI,
  MIN_COPYRIGHT_CLAIM_DESCRIPTION_CHARS,
} from '@shared/lib/copyright/copyrightClaimDescriptionRules';
import { Popup, PopupCloseButton } from '@shared/ui/popup';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import { DashboardButton, DashboardLoadingState } from '@shared/ui/dashboard';

import type { CopyrightReportRequest } from '../lib/copyrightReportParams';
import type { CopyrightReportAttachmentItem } from '../lib/copyrightReportAttachments';
import {
  submitCopyrightClaim,
  uploadCopyrightClaimAttachments,
  type CopyrightClaimCreated,
} from '../lib/copyrightReportAttachmentsApi';
import { useCopyrightReportContext } from '../lib/useCopyrightReportContext';
import { CopyrightReportContentCard } from './CopyrightReportContentCard';
import { CopyrightReportAttachmentsField } from './CopyrightReportAttachmentsField';
import '@pages/UserDashboard/components/shared/EditableCardField.style.scss';
import './copyrightReportModal.scss';

type CopyrightReportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  request: CopyrightReportRequest | null;
};

type FormPhase = 'form' | 'submitted';

type SubmitStage = 'idle' | 'creating_claim' | 'uploading' | 'upload_error';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function CopyrightReportModal({ isOpen, onClose, request }: CopyrightReportModalProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const copy = ui?.copyrightReport;
  const titleId = useId();
  const descId = useId();
  const nameInputId = useId();
  const emailInputId = useId();
  const roleLegendId = useId();
  const roleOwnerRadioId = useId();
  const roleRepRadioId = useId();
  const roleOtherRadioId = useId();
  const confirmCheckboxId = useId();

  const contentType = request?.contentType ?? null;
  const contentId = request?.contentId ?? '';
  const artistSlug = request?.artistSlug ?? '';

  const { displayName: artistFromParam } = useSiteArtistDisplayName(lang, {
    artistSlug: artistSlug || null,
  });

  const errors = copy?.errors;
  const { loadState, context, loadError } = useCopyrightReportContext({
    enabled: isOpen && Boolean(request),
    contentType,
    contentId,
    artistSlug,
    coverImageUrlOverride: request?.coverImageUrl,
    errorFallback: errors?.missingParams ?? 'Invalid link.',
    notFoundFallback: errors?.notFound ?? 'Content not found.',
    genericFallback: errors?.generic ?? 'Something went wrong.',
  });

  const [phase, setPhase] = useState<FormPhase>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [claimantType, setClaimantType] = useState<
    'copyright_owner' | 'authorized_representative' | 'other'
  >('copyright_owner');
  const [description, setDescription] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [attachments, setAttachments] = useState<CopyrightReportAttachmentItem[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [submitStage, setSubmitStage] = useState<SubmitStage>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingClaim, setPendingClaim] = useState<CopyrightClaimCreated | null>(null);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

  const submitting = submitStage !== 'idle';

  const resetForm = useCallback(() => {
    setPhase('form');
    setName('');
    setEmail('');
    setClaimantType('copyright_owner');
    setDescription('');
    setConfirmed(false);
    setAttachments([]);
    setAttachmentError(null);
    setSubmitStage('idle');
    setSubmitError(null);
    setPendingClaim(null);
    setUploadProgress({ current: 0, total: 0 });
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const artistLine = useMemo(() => {
    if (context?.artistName?.trim()) return context.artistName.trim();
    return artistFromParam || artistSlug;
  }, [artistFromParam, artistSlug, context?.artistName]);

  const contentPath = useMemo(() => {
    if (!context) return '/';
    const albumId = context.contentType === 'album' ? context.contentId : (context.albumId ?? '');
    if (!albumId) return '/';
    return buildPublicAlbumPagePath(lang, albumId, context.artistSlug);
  }, [context, lang]);

  const titleLine = useMemo(() => {
    if (!context) return '';
    return context.title;
  }, [context]);

  const descriptionLen = description.length;
  const descriptionTrimmedLen = description.trim().length;
  const descriptionCountLabel = useMemo(() => {
    const template = copy?.descriptionCounter ?? '{{current}} / {{max}}';
    return template
      .replace('{{current}}', String(descriptionLen))
      .replace('{{max}}', MAX_COPYRIGHT_CLAIM_DESCRIPTION_CHARS_UI.toLocaleString(lang));
  }, [copy?.descriptionCounter, descriptionLen, lang]);

  const emailValid = email.trim().length > 0 && EMAIL_PATTERN.test(email.trim());

  const canSubmit =
    loadState === 'ready' &&
    phase === 'form' &&
    name.trim().length > 0 &&
    emailValid &&
    descriptionTrimmedLen >= MIN_COPYRIGHT_CLAIM_DESCRIPTION_CHARS &&
    descriptionLen <= MAX_COPYRIGHT_CLAIM_DESCRIPTION_CHARS_UI &&
    confirmed &&
    !submitting;

  const uploadAttachmentFiles = useCallback(
    async (claim: CopyrightClaimCreated, files: File[]) => {
      if (files.length === 0) return;
      setSubmitStage('uploading');
      setUploadProgress({ current: 0, total: files.length });
      try {
        await uploadCopyrightClaimAttachments({
          claimId: claim.claimId,
          uploadToken: claim.uploadToken,
          files,
          onProgress: (current, total) => setUploadProgress({ current, total }),
        });
        setSubmitStage('idle');
        setPhase('submitted');
      } catch (err) {
        setSubmitStage('upload_error');
        setSubmitError(
          err instanceof Error
            ? err.message
            : (copy?.attachmentsUploadError ?? 'Could not upload supporting documents.')
        );
      }
    },
    [copy?.attachmentsUploadError]
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!context) return;

    const files = attachments.map((a) => a.file);
    const retryOnly = submitStage === 'upload_error' && pendingClaim;

    if (retryOnly) {
      setSubmitError(null);
      await uploadAttachmentFiles(pendingClaim, files);
      return;
    }

    if (!canSubmit) return;

    setSubmitError(null);
    setSubmitStage('creating_claim');
    try {
      const claim = await submitCopyrightClaim({
        contentType: context.contentType,
        contentId: context.contentId,
        artistSlug: context.artistSlug,
        claimantName: name.trim(),
        claimantEmail: email.trim(),
        claimantType,
        description: description.trim(),
      });
      setPendingClaim(claim);

      if (files.length === 0) {
        setSubmitStage('idle');
        setPhase('submitted');
        return;
      }

      await uploadAttachmentFiles(claim, files);
    } catch (err) {
      setSubmitStage('idle');
      setSubmitError(
        err instanceof Error ? err.message : (errors?.submit ?? 'Could not submit report.')
      );
    }
  }

  const submitButtonLabel = useMemo(() => {
    if (submitStage === 'creating_claim') {
      return copy?.submitting ?? 'Submitting…';
    }
    if (submitStage === 'uploading') {
      const template = copy?.attachmentsUploadingProgress ?? 'Uploading {{current}} of {{total}}';
      return template
        .replace('{{current}}', String(uploadProgress.current))
        .replace('{{total}}', String(uploadProgress.total));
    }
    if (submitStage === 'upload_error') {
      return copy?.attachmentsUploadRetry ?? 'Retry upload';
    }
    return copy?.submit ?? 'Submit report';
  }, [
    copy?.attachmentsUploadRetry,
    copy?.attachmentsUploadingProgress,
    copy?.submit,
    copy?.submitting,
    submitStage,
    uploadProgress.current,
    uploadProgress.total,
  ]);

  const canClickSubmit =
    submitStage === 'upload_error' ? Boolean(pendingClaim) && attachments.length > 0 : canSubmit;

  const contentTypeLabel =
    context?.contentType === 'track'
      ? (copy?.contentTypeTrack ?? 'Track')
      : (copy?.contentTypeAlbum ?? 'Album');

  return (
    <Popup
      isActive={isOpen}
      onClose={handleClose}
      publicBackdrop
      closeBlocked={submitting}
      aria-labelledby={titleId}
      initialFocusSelector=".dashboard-form-input"
    >
      <div className="copyright-report-fullscreen">
        <header className="copyright-report-fullscreen__header">
          <div className="copyright-report-fullscreen__column">
            <h2 id={titleId} className="copyright-report-fullscreen__title">
              {copy?.pageTitle ?? 'Report copyright infringement'}
            </h2>
            <p className="copyright-report-fullscreen__lead">
              {copy?.intro ??
                'If you believe that content on our platform infringes your copyright or related rights, please submit a report using this form.'}
            </p>
          </div>
          <PopupCloseButton
            className="copyright-report-fullscreen__close"
            aria-label={copy?.close ?? copy?.cancel ?? 'Close'}
          >
            <ModalCloseIcon />
          </PopupCloseButton>
        </header>

        <div className="copyright-report-fullscreen__body">
          {loadState === 'loading' ? (
            <DashboardLoadingState className="copyright-report-fullscreen__loading" />
          ) : null}
          {loadState !== 'loading' ? (
            <div className="copyright-report-fullscreen__column">
              {loadState === 'error' ? (
                <p className="copyright-report-modal__field-error" role="alert">
                  {loadError}
                </p>
              ) : null}

              {phase === 'submitted' ? (
                <div className="copyright-report-modal__success">
                  <h3 className="copyright-report-modal__success-title">
                    {copy?.successTitle ?? 'Report submitted'}
                  </h3>
                  <p className="copyright-report-modal__success-body">
                    {copy?.successBody ?? 'Thank you.'}
                  </p>
                  <div className="copyright-report-modal__actions">
                    <DashboardButton variant="primary" type="button" onClick={handleClose}>
                      {copy?.successClose ?? copy?.backToAlbum ?? 'Close'}
                    </DashboardButton>
                  </div>
                </div>
              ) : null}

              {submitStage === 'uploading' ? (
                <p className="copyright-report-modal__help-text" role="status">
                  {copy?.attachmentsUploadingLead ?? 'Uploading supporting documents…'}
                </p>
              ) : null}

              {phase === 'form' && loadState === 'ready' && context ? (
                <>
                  <CopyrightReportContentCard
                    contentLabel={copy?.contentLabel ?? 'Content being reported'}
                    contentTypeLabel={contentTypeLabel}
                    contentPath={contentPath}
                    openContentLabel={copy?.openContent ?? 'Open reported content in a new tab'}
                    titleLine={titleLine}
                    artistLine={artistLine}
                    context={context}
                    contentType={context.contentType}
                  />

                  <form className="copyright-report-modal__form" onSubmit={handleSubmit} noValidate>
                    <div className="copyright-report-modal__row copyright-report-modal__row--split">
                      <div className="copyright-report-modal__field">
                        <label htmlFor={nameInputId} className="copyright-report-modal__label">
                          {copy?.nameLabel ?? 'Name / Organization'}
                          <span className="copyright-report-modal__required" aria-hidden>
                            {' '}
                            *
                          </span>
                        </label>
                        <input
                          id={nameInputId}
                          className="dashboard-form-input"
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          autoComplete="name"
                          required
                          maxLength={255}
                        />
                      </div>

                      <div className="copyright-report-modal__field">
                        <label htmlFor={emailInputId} className="copyright-report-modal__label">
                          {copy?.emailLabel ?? 'Email'}
                          <span className="copyright-report-modal__required" aria-hidden>
                            {' '}
                            *
                          </span>
                        </label>
                        <input
                          id={emailInputId}
                          className="dashboard-form-input"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          autoComplete="email"
                          required
                        />
                      </div>
                    </div>

                    <div className="copyright-report-modal__field">
                      <span id={roleLegendId} className="copyright-report-modal__label">
                        {copy?.roleLegend ?? 'What rights are you claiming?'}
                        <span className="copyright-report-modal__required" aria-hidden>
                          {' '}
                          *
                        </span>
                      </span>
                      <div
                        className="copyright-report-modal__radio-group"
                        role="radiogroup"
                        aria-labelledby={roleLegendId}
                      >
                        <div className="copyright-report-modal__radio-wrapper">
                          <input
                            type="radio"
                            id={roleOwnerRadioId}
                            name="claimantType"
                            className="copyright-report-modal__radio"
                            checked={claimantType === 'copyright_owner'}
                            onChange={() => setClaimantType('copyright_owner')}
                          />
                          <label
                            htmlFor={roleOwnerRadioId}
                            className="copyright-report-modal__radio-label"
                          >
                            {copy?.roleOwner ?? 'Copyright owner'}
                          </label>
                        </div>
                        <div className="copyright-report-modal__radio-wrapper">
                          <input
                            type="radio"
                            id={roleRepRadioId}
                            name="claimantType"
                            className="copyright-report-modal__radio"
                            checked={claimantType === 'authorized_representative'}
                            onChange={() => setClaimantType('authorized_representative')}
                          />
                          <label
                            htmlFor={roleRepRadioId}
                            className="copyright-report-modal__radio-label"
                          >
                            {copy?.roleRep ?? 'Authorized representative'}
                          </label>
                        </div>
                        <div className="copyright-report-modal__radio-wrapper">
                          <input
                            type="radio"
                            id={roleOtherRadioId}
                            name="claimantType"
                            className="copyright-report-modal__radio"
                            checked={claimantType === 'other'}
                            onChange={() => setClaimantType('other')}
                          />
                          <label
                            htmlFor={roleOtherRadioId}
                            className="copyright-report-modal__radio-label"
                          >
                            {copy?.roleOther ?? 'Other'}
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="copyright-report-modal__field">
                      <label
                        htmlFor={`${descId}-textarea`}
                        className="copyright-report-modal__label"
                      >
                        {copy?.descriptionLabel ?? 'Describe the infringement'}
                        <span className="copyright-report-modal__required" aria-hidden>
                          {' '}
                          *
                        </span>
                      </label>
                      <textarea
                        id={`${descId}-textarea`}
                        className="dashboard-form-textarea"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={
                          copy?.descriptionPlaceholder ??
                          'Please describe why you believe this content infringes your rights.'
                        }
                        required
                        minLength={MIN_COPYRIGHT_CLAIM_DESCRIPTION_CHARS}
                        maxLength={MAX_COPYRIGHT_CLAIM_DESCRIPTION_CHARS_UI}
                        rows={8}
                      />
                      <div className="copyright-report-modal__field-footer">
                        <p className="copyright-report-modal__help-text">
                          {copy?.descriptionMinHint ?? 'Use at least 20 characters.'}
                        </p>
                        <p className="copyright-report-modal__char-count" aria-live="polite">
                          {descriptionCountLabel}
                        </p>
                      </div>
                      {descriptionTrimmedLen > 0 &&
                      descriptionTrimmedLen < MIN_COPYRIGHT_CLAIM_DESCRIPTION_CHARS ? (
                        <p className="copyright-report-modal__field-error" role="status">
                          {copy?.descriptionTooShortHint?.replace(
                            '{{count}}',
                            String(MIN_COPYRIGHT_CLAIM_DESCRIPTION_CHARS - descriptionTrimmedLen)
                          ) ??
                            `Add ${MIN_COPYRIGHT_CLAIM_DESCRIPTION_CHARS - descriptionTrimmedLen} more character(s).`}
                        </p>
                      ) : null}
                      {descriptionLen > MAX_COPYRIGHT_CLAIM_DESCRIPTION_CHARS_UI ? (
                        <p className="copyright-report-modal__field-error" role="status">
                          {copy?.descriptionTooLongHint ?? 'Description is too long.'}
                        </p>
                      ) : null}
                    </div>

                    <CopyrightReportAttachmentsField
                      items={attachments}
                      onChange={(next) => {
                        setAttachments(next);
                        setAttachmentError(null);
                      }}
                      disabled={submitting}
                      onValidationError={setAttachmentError}
                      copy={{
                        sectionLabel: copy?.attachmentsLabel ?? 'Supporting documents (optional)',
                        dropHint: copy?.attachmentsDropHint ?? 'Upload files or drag and drop here',
                        typesHint: copy?.attachmentsTypesHint ?? 'PDF, JPG, PNG · up to 25 MB',
                        removeFile: copy?.attachmentsRemove ?? 'Remove file',
                        errors: {
                          type:
                            copy?.attachmentsErrorType ??
                            'Only PDF, JPG, and PNG files are supported.',
                          size: copy?.attachmentsErrorSize ?? 'Each file must be 25 MB or smaller.',
                          duplicate:
                            copy?.attachmentsErrorDuplicate ?? 'This file is already attached.',
                        },
                      }}
                    />
                    {attachmentError ? (
                      <p className="copyright-report-modal__field-error" role="status">
                        {attachmentError}
                      </p>
                    ) : null}

                    <label
                      htmlFor={confirmCheckboxId}
                      className="copyright-report-modal__agreement"
                    >
                      <input
                        id={confirmCheckboxId}
                        type="checkbox"
                        className="copyright-report-modal__checkbox"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                      />
                      <span className="copyright-report-modal__agreement-text">
                        {copy?.confirmLabel ??
                          'I confirm that the information provided is accurate and that I am the copyright owner or authorized to act on behalf of the copyright owner.'}
                      </span>
                    </label>

                    {submitError ? (
                      <p className="copyright-report-modal__field-error" role="alert">
                        {submitError}
                      </p>
                    ) : null}

                    <div className="copyright-report-modal__actions">
                      <button
                        type="button"
                        className="edit-album-modal__list-item-cancel"
                        onClick={handleClose}
                        disabled={submitting}
                      >
                        {copy?.cancel ?? 'Cancel'}
                      </button>
                      <DashboardButton
                        variant="primary"
                        type="submit"
                        disabled={!canClickSubmit}
                        loading={submitStage === 'creating_claim'}
                      >
                        {submitButtonLabel}
                      </DashboardButton>
                    </div>
                  </form>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Popup>
  );
}
