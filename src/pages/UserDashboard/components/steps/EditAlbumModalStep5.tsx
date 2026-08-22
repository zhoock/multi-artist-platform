// src/pages/UserDashboard/components/steps/EditAlbumModalStep5.tsx
import React, { useMemo, useState } from 'react';
import type { AlbumFormData } from '../modals/album/EditAlbumModal.types';
import type { IInterface } from '@models';
import { PURCHASE_SERVICES, STREAMING_SERVICES } from '../modals/album/EditAlbumModal.constants';
import { EMPTY_LINK, linkEditHasChanges } from '../modals/album/EditAlbumModal.utils';
import { SettingsSelect } from '../modals/settings/SettingsSelect';
import { InlineEditDiscardDialog, getInlineEditDiscardLabels } from '../shared/EditableCardField';
import { EditAlbumEditIcon, EditAlbumRemoveIcon } from './EditAlbumStepIcons';

type LinkService = {
  id: string;
  name: string;
};

type LinkServiceSelectProps = {
  id: string;
  value: string;
  services: readonly LinkService[];
  placeholder: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
};

function LinkServiceSelect({
  id,
  value,
  services,
  placeholder,
  onChange,
  onKeyDown,
}: LinkServiceSelectProps) {
  const options = useMemo(
    () => [
      { value: '', label: placeholder },
      ...services.map((service) => ({ value: service.id, label: service.name })),
    ],
    [placeholder, services]
  );

  return (
    <SettingsSelect
      id={id}
      value={value}
      options={options}
      onChange={onChange}
      onKeyDown={onKeyDown}
      className="dashboard-form-select--embedded"
    />
  );
}

interface EditAlbumModalStep5Props {
  formData: AlbumFormData;
  editingPurchaseLink: number | null;
  purchaseLinkService: string;
  purchaseLinkUrl: string;
  editingStreamingLink: number | null;
  streamingLinkService: string;
  streamingLinkUrl: string;
  onPurchaseLinkServiceChange: (value: string) => void;
  onPurchaseLinkUrlChange: (value: string) => void;
  onAddPurchaseLink: () => void;
  onEditPurchaseLink: (index: number) => void;
  onRemovePurchaseLink: (index: number) => void;
  onCancelEditPurchaseLink: () => void;
  onStreamingLinkServiceChange: (value: string) => void;
  onStreamingLinkUrlChange: (value: string) => void;
  onAddStreamingLink: () => void;
  onEditStreamingLink: (index: number) => void;
  onRemoveStreamingLink: (index: number) => void;
  onCancelEditStreamingLink: () => void;
  ui?: IInterface;
}

export function EditAlbumModalStep5({
  formData,
  editingPurchaseLink,
  purchaseLinkService,
  purchaseLinkUrl,
  editingStreamingLink,
  streamingLinkService,
  streamingLinkUrl,
  onPurchaseLinkServiceChange,
  onPurchaseLinkUrlChange,
  onAddPurchaseLink,
  onEditPurchaseLink,
  onRemovePurchaseLink,
  onCancelEditPurchaseLink,
  onStreamingLinkServiceChange,
  onStreamingLinkUrlChange,
  onAddStreamingLink,
  onEditStreamingLink,
  onRemoveStreamingLink,
  onCancelEditStreamingLink,
  ui,
}: EditAlbumModalStep5Props) {
  const [purchaseDiscardOpen, setPurchaseDiscardOpen] = useState(false);
  const [streamingDiscardOpen, setStreamingDiscardOpen] = useState(false);
  const discardLabels = getInlineEditDiscardLabels(ui ?? undefined);

  const purchaseSaved = useMemo(() => {
    if (editingPurchaseLink !== null) {
      return formData.purchaseLinks[editingPurchaseLink] ?? EMPTY_LINK;
    }
    return EMPTY_LINK;
  }, [editingPurchaseLink, formData.purchaseLinks]);

  const streamingSaved = useMemo(() => {
    if (editingStreamingLink !== null) {
      return formData.streamingLinks[editingStreamingLink] ?? EMPTY_LINK;
    }
    return EMPTY_LINK;
  }, [editingStreamingLink, formData.streamingLinks]);

  const purchaseHasUnsaved = linkEditHasChanges(
    purchaseSaved,
    purchaseLinkService,
    purchaseLinkUrl
  );
  const streamingHasUnsaved = linkEditHasChanges(
    streamingSaved,
    streamingLinkService,
    streamingLinkUrl
  );

  const purchaseCanSave = Boolean(purchaseLinkService.trim() && purchaseLinkUrl.trim());
  const streamingCanSave = Boolean(streamingLinkService.trim() && streamingLinkUrl.trim());

  const purchaseSaveDisabled = !purchaseHasUnsaved || !purchaseCanSave;
  const streamingSaveDisabled = !streamingHasUnsaved || !streamingCanSave;

  const requestCancelPurchase = () => {
    if (!purchaseHasUnsaved) {
      onCancelEditPurchaseLink();
      return;
    }
    setPurchaseDiscardOpen(true);
  };

  const requestCancelStreaming = () => {
    if (!streamingHasUnsaved) {
      onCancelEditStreamingLink();
      return;
    }
    setStreamingDiscardOpen(true);
  };

  const trySavePurchase = () => {
    if (!purchaseSaveDisabled) onAddPurchaseLink();
  };

  const trySaveStreaming = () => {
    if (!streamingSaveDisabled) onAddStreamingLink();
  };

  const purchaseKeyHandlers = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      trySavePurchase();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (purchaseDiscardOpen) {
        setPurchaseDiscardOpen(false);
        return;
      }
      requestCancelPurchase();
    }
  };

  const streamingKeyHandlers = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      trySaveStreaming();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (streamingDiscardOpen) {
        setStreamingDiscardOpen(false);
        return;
      }
      requestCancelStreaming();
    }
  };

  return (
    <>
      <div className="edit-album-modal__divider" />

      <div className="edit-album-modal__field">
        <label className="edit-album-modal__label">
          {ui?.dashboard?.editAlbumModal?.step5?.purchase ?? 'Purchase'}
        </label>

        <div className="edit-album-modal__list">
          {formData.purchaseLinks.map((link, index) => {
            const service = PURCHASE_SERVICES.find((s) => s.id === link.service);
            const isEditing = editingPurchaseLink === index;

            return (
              <div
                key={index}
                className={`edit-album-modal__list-item edit-album-modal__list-item--links${isEditing ? ' edit-album-modal__list-item--editing' : ''}`}
              >
                {isEditing ? (
                  <div className="edit-album-modal__list-item-edit-wrapper">
                    <LinkServiceSelect
                      id="purchase-link-service"
                      value={purchaseLinkService}
                      services={PURCHASE_SERVICES}
                      placeholder={
                        ui?.dashboard?.editAlbumModal?.step5?.selectService ?? 'Select service'
                      }
                      onChange={onPurchaseLinkServiceChange}
                      onKeyDown={purchaseKeyHandlers}
                    />

                    {purchaseLinkService.trim() ? (
                      <>
                        <input
                          name="purchase-link-url"
                          type="url"
                          autoComplete="url"
                          className="edit-album-modal__list-item-input edit-album-modal__list-item-input--url"
                          placeholder={ui?.dashboard?.editAlbumModal?.step5?.url ?? 'URL'}
                          value={purchaseLinkUrl}
                          onChange={(e) => onPurchaseLinkUrlChange(e.target.value)}
                          onKeyDown={purchaseKeyHandlers}
                          autoFocus
                        />

                        <div className="edit-album-modal__list-item-actions">
                          <button
                            type="button"
                            className="edit-album-modal__list-item-save"
                            onClick={trySavePurchase}
                            disabled={purchaseSaveDisabled}
                          >
                            {ui?.dashboard?.editAlbumModal?.step5?.save ?? 'Save'}
                          </button>
                          <button
                            type="button"
                            className="edit-album-modal__list-item-cancel"
                            onClick={requestCancelPurchase}
                          >
                            {ui?.dashboard?.editAlbumModal?.step5?.cancel ?? 'Cancel'}
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <div className="edit-album-modal__link-content">
                      {service && (
                        <span className={`edit-album-modal__link-icon ${service.icon}`} />
                      )}
                      <span className="edit-album-modal__link-name">
                        {service ? service.name : link.service}
                      </span>
                    </div>
                    <div className="edit-album-modal__list-item-actions">
                      <button
                        type="button"
                        className="edit-album-modal__list-item-edit"
                        onClick={() => onEditPurchaseLink(index)}
                        aria-label={`Edit ${service ? service.name : link.service}`}
                      >
                        <EditAlbumEditIcon />
                      </button>
                      <button
                        type="button"
                        className="edit-album-modal__list-item-remove"
                        onClick={() => onRemovePurchaseLink(index)}
                        aria-label={`Remove ${service ? service.name : link.service}`}
                      >
                        <EditAlbumRemoveIcon />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {editingPurchaseLink === null && (
            <div className="edit-album-modal__list-item edit-album-modal__list-item--links edit-album-modal__list-item--editing">
              <div className="edit-album-modal__list-item-edit-wrapper">
                <LinkServiceSelect
                  id="purchase-link-service-new"
                  value={purchaseLinkService}
                  services={PURCHASE_SERVICES}
                  placeholder={
                    ui?.dashboard?.editAlbumModal?.step5?.selectService ?? 'Select service'
                  }
                  onChange={onPurchaseLinkServiceChange}
                  onKeyDown={purchaseKeyHandlers}
                />

                {purchaseLinkService.trim() ? (
                  <>
                    <input
                      name="purchase-link-url"
                      type="url"
                      autoComplete="url"
                      className="edit-album-modal__list-item-input edit-album-modal__list-item-input--url"
                      placeholder={ui?.dashboard?.editAlbumModal?.step5?.url ?? 'URL'}
                      value={purchaseLinkUrl}
                      onChange={(e) => onPurchaseLinkUrlChange(e.target.value)}
                      onKeyDown={purchaseKeyHandlers}
                      autoFocus
                    />

                    <div className="edit-album-modal__list-item-actions">
                      <button
                        type="button"
                        className="edit-album-modal__list-item-save"
                        onClick={trySavePurchase}
                        disabled={purchaseSaveDisabled}
                      >
                        {ui?.dashboard?.editAlbumModal?.step5?.save ?? 'Add'}
                      </button>
                      <button
                        type="button"
                        className="edit-album-modal__list-item-cancel"
                        onClick={requestCancelPurchase}
                      >
                        {ui?.dashboard?.editAlbumModal?.step5?.cancel ?? 'Cancel'}
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="edit-album-modal__field">
        <label className="edit-album-modal__label">
          {ui?.dashboard?.editAlbumModal?.step5?.streaming ?? 'Streaming'}
        </label>

        <div className="edit-album-modal__list">
          {formData.streamingLinks.map((link, index) => {
            const service = STREAMING_SERVICES.find((s) => s.id === link.service);
            const isEditing = editingStreamingLink === index;

            return (
              <div
                key={index}
                className={`edit-album-modal__list-item edit-album-modal__list-item--links${isEditing ? ' edit-album-modal__list-item--editing' : ''}`}
              >
                {isEditing ? (
                  <div className="edit-album-modal__list-item-edit-wrapper">
                    <LinkServiceSelect
                      id="streaming-link-service"
                      value={streamingLinkService}
                      services={STREAMING_SERVICES}
                      placeholder={
                        ui?.dashboard?.editAlbumModal?.step5?.selectService ?? 'Select service'
                      }
                      onChange={onStreamingLinkServiceChange}
                      onKeyDown={streamingKeyHandlers}
                    />

                    {streamingLinkService.trim() ? (
                      <>
                        <input
                          name="streaming-link-url"
                          type="url"
                          autoComplete="url"
                          className="edit-album-modal__list-item-input edit-album-modal__list-item-input--url"
                          placeholder={ui?.dashboard?.editAlbumModal?.step5?.url ?? 'URL'}
                          value={streamingLinkUrl}
                          onChange={(e) => onStreamingLinkUrlChange(e.target.value)}
                          onKeyDown={streamingKeyHandlers}
                          autoFocus
                        />

                        <div className="edit-album-modal__list-item-actions">
                          <button
                            type="button"
                            className="edit-album-modal__list-item-save"
                            onClick={trySaveStreaming}
                            disabled={streamingSaveDisabled}
                          >
                            {ui?.dashboard?.editAlbumModal?.step5?.save ?? 'Save'}
                          </button>
                          <button
                            type="button"
                            className="edit-album-modal__list-item-cancel"
                            onClick={requestCancelStreaming}
                          >
                            {ui?.dashboard?.editAlbumModal?.step5?.cancel ?? 'Cancel'}
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <div className="edit-album-modal__link-content">
                      {service && (
                        <span className={`edit-album-modal__link-icon ${service.icon}`} />
                      )}
                      <span className="edit-album-modal__link-name">
                        {service ? service.name : link.service}
                      </span>
                    </div>
                    <div className="edit-album-modal__list-item-actions">
                      <button
                        type="button"
                        className="edit-album-modal__list-item-edit"
                        onClick={() => onEditStreamingLink(index)}
                        aria-label={`Edit ${service ? service.name : link.service}`}
                      >
                        <EditAlbumEditIcon />
                      </button>
                      <button
                        type="button"
                        className="edit-album-modal__list-item-remove"
                        onClick={() => onRemoveStreamingLink(index)}
                        aria-label={`Remove ${service ? service.name : link.service}`}
                      >
                        <EditAlbumRemoveIcon />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {editingStreamingLink === null && (
            <div className="edit-album-modal__list-item edit-album-modal__list-item--links edit-album-modal__list-item--editing">
              <div className="edit-album-modal__list-item-edit-wrapper">
                <LinkServiceSelect
                  id="streaming-link-service-new"
                  value={streamingLinkService}
                  services={STREAMING_SERVICES}
                  placeholder={
                    ui?.dashboard?.editAlbumModal?.step5?.selectService ?? 'Select service'
                  }
                  onChange={onStreamingLinkServiceChange}
                  onKeyDown={streamingKeyHandlers}
                />

                {streamingLinkService.trim() ? (
                  <>
                    <input
                      name="streaming-link-url"
                      type="url"
                      autoComplete="url"
                      className="edit-album-modal__list-item-input edit-album-modal__list-item-input--url"
                      placeholder={ui?.dashboard?.editAlbumModal?.step5?.url ?? 'URL'}
                      value={streamingLinkUrl}
                      onChange={(e) => onStreamingLinkUrlChange(e.target.value)}
                      onKeyDown={streamingKeyHandlers}
                      autoFocus
                    />

                    <div className="edit-album-modal__list-item-actions">
                      <button
                        type="button"
                        className="edit-album-modal__list-item-save"
                        onClick={trySaveStreaming}
                        disabled={streamingSaveDisabled}
                      >
                        {ui?.dashboard?.editAlbumModal?.step5?.save ?? 'Add'}
                      </button>
                      <button
                        type="button"
                        className="edit-album-modal__list-item-cancel"
                        onClick={requestCancelStreaming}
                      >
                        {ui?.dashboard?.editAlbumModal?.step5?.cancel ?? 'Cancel'}
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      <InlineEditDiscardDialog
        open={purchaseDiscardOpen}
        labels={discardLabels}
        onStay={() => setPurchaseDiscardOpen(false)}
        onDiscard={() => {
          setPurchaseDiscardOpen(false);
          onCancelEditPurchaseLink();
        }}
      />
      <InlineEditDiscardDialog
        open={streamingDiscardOpen}
        labels={discardLabels}
        onStay={() => setStreamingDiscardOpen(false)}
        onDiscard={() => {
          setStreamingDiscardOpen(false);
          onCancelEditStreamingLink();
        }}
      />
    </>
  );
}
