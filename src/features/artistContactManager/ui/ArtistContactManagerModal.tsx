import { useCallback, useId } from 'react';
import { Copy as CopyIcon, ExternalLink as ExternalLinkIcon, Mail as MailIcon } from 'lucide-react';
import { Popup, PopupCloseButton } from '@shared/ui/popup';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import {
  formatManagerTelegramForSettingsDisplay,
  normalizeTelegramContactHref,
} from '@shared/lib/parseTelegramFromSocialLinks';
import { toast } from '@shared/lib/toast/toastApi';
import { TelegramBrandIcon } from './TelegramBrandIcon';
import '@features/albumComments/ui/albumComments.scss';
import './artistContactManager.scss';

export type ArtistContactManagerModalLabels = {
  title: string;
  description: string;
  telegram: string;
  email: string;
  close: string;
  emailCopied: string;
  openTelegram: string;
  copyEmail: string;
};

type ArtistContactManagerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  telegramUrl: string | null;
  managerEmail: string | null;
  labels: ArtistContactManagerModalLabels;
};

export function ArtistContactManagerModal({
  isOpen,
  onClose,
  telegramUrl,
  managerEmail,
  labels,
}: ArtistContactManagerModalProps) {
  const titleId = useId();
  const descriptionId = useId();

  const telegramHref = telegramUrl ? normalizeTelegramContactHref(telegramUrl) : null;
  const telegramDisplay =
    telegramUrl && telegramHref ? formatManagerTelegramForSettingsDisplay(telegramUrl) : '';

  const handleCopyEmail = useCallback(async () => {
    const email = managerEmail?.trim();
    if (!email) return;

    try {
      await navigator.clipboard.writeText(email);
      toast.show({ title: labels.emailCopied });
    } catch {
      // Clipboard may be blocked; user can still select the visible address.
    }
  }, [labels.emailCopied, managerEmail]);

  return (
    <Popup isActive={isOpen} onClose={onClose} publicBackdrop aria-labelledby={titleId}>
      <div className="album-comments-fullscreen artist-contact-manager">
        <header className="album-comments-fullscreen__header">
          <div className="album-comments-fullscreen__header-main" aria-hidden />
          <PopupCloseButton
            type="button"
            className="album-comments-fullscreen__close"
            aria-label={labels.close}
          >
            <ModalCloseIcon />
          </PopupCloseButton>
        </header>

        <div className="album-comments-fullscreen__body">
          <div className="album-comments-fullscreen__column artist-contact-manager__content">
            <div className="artist-contact-manager__intro">
              <div className="artist-contact-manager__icon-wrap" aria-hidden>
                <MailIcon
                  className="artist-contact-manager__icon"
                  size={36}
                  strokeWidth={1.5}
                  aria-hidden
                />
              </div>
              <h2 id={titleId} className="artist-contact-manager__title">
                {labels.title}
              </h2>
              <p id={descriptionId} className="artist-contact-manager__description">
                {labels.description}
              </p>
            </div>

            <div className="artist-contact-manager__channels" aria-describedby={descriptionId}>
              {telegramHref && telegramDisplay ? (
                <a
                  className="artist-contact-manager__channel"
                  href={telegramHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={labels.openTelegram}
                >
                  <span className="artist-contact-manager__channel-icon" aria-hidden>
                    <TelegramBrandIcon size={28} />
                  </span>
                  <span className="artist-contact-manager__channel-value">{telegramDisplay}</span>
                  <ExternalLinkIcon
                    className="artist-contact-manager__channel-trailing"
                    size={26}
                    strokeWidth={2}
                    aria-hidden
                  />
                </a>
              ) : null}

              {managerEmail ? (
                <button
                  type="button"
                  className="artist-contact-manager__channel"
                  onClick={() => {
                    void handleCopyEmail();
                  }}
                  aria-label={labels.copyEmail}
                >
                  <span className="artist-contact-manager__channel-icon" aria-hidden>
                    <MailIcon size={28} strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="artist-contact-manager__channel-value">{managerEmail}</span>
                  <CopyIcon
                    className="artist-contact-manager__channel-trailing"
                    size={26}
                    strokeWidth={2}
                    aria-hidden
                  />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Popup>
  );
}
