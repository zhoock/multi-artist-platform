import { useState, FormEvent, useMemo } from 'react';
import { Popup } from '@shared/ui/popup';
import { upgradeToArtistAccount } from '@shared/lib/auth';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useFocusOnOpen } from '@shared/lib/hooks/useFocusOnOpen';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import './UpgradeToArtistModal.style.scss';

interface UpgradeToArtistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgraded?: () => void;
}

export function UpgradeToArtistModal({ isOpen, onClose, onUpgraded }: UpgradeToArtistModalProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));

  const copy = useMemo(() => {
    const en = lang !== 'ru';
    const fallback = en
      ? {
          title: 'Become an artist',
          artistBandNameLabel: 'Artist / band name',
          artistBandNamePlaceholder: 'Enter your artist or band name',
          artistBandNameRequired: 'Artist / band name is required',
          cancel: 'Cancel',
          continue: 'Continue',
          continuing: 'Continuing…',
          close: 'Close',
          upgradeFailed: 'Could not upgrade account',
        }
      : {
          title: 'Стать артистом',
          artistBandNameLabel: 'Имя артиста / группы',
          artistBandNamePlaceholder: 'Укажите имя артиста или группы',
          artistBandNameRequired: 'Укажите имя артиста или группы',
          cancel: 'Отмена',
          continue: 'Продолжить',
          continuing: 'Сохранение…',
          close: 'Закрыть',
          upgradeFailed: 'Не удалось обновить аккаунт',
        };
    return { ...fallback, ...ui?.dashboard?.upgradeToArtist };
  }, [lang, ui?.dashboard?.upgradeToArtist]);

  const [artistName, setArtistName] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const nameInputRef = useFocusOnOpen<HTMLInputElement>(isOpen);

  const handleClose = () => {
    if (loading) return;
    setArtistName('');
    setFieldError(null);
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = artistName.trim();
    if (!trimmed) {
      setFieldError(copy.artistBandNameRequired);
      return;
    }

    setFieldError(null);
    setLoading(true);

    try {
      const result = await upgradeToArtistAccount(trimmed);
      if (result.success) {
        setArtistName('');
        onUpgraded?.();
        onClose();
        return;
      }
      setError(result.error || copy.upgradeFailed);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.upgradeFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popup isActive={isOpen} onClose={handleClose}>
      <div className="upgrade-to-artist-modal">
        <form className="upgrade-to-artist-modal__container" onSubmit={handleSubmit} noValidate>
          <div className="upgrade-to-artist-modal__header">
            <h2 className="upgrade-to-artist-modal__title">{copy.title}</h2>
            <button
              type="button"
              className="upgrade-to-artist-modal__close"
              onClick={handleClose}
              aria-label={copy.close}
              disabled={loading}
            >
              <ModalCloseIcon />
            </button>
          </div>

          {error ? (
            <p className="upgrade-to-artist-modal__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="upgrade-to-artist-modal__field">
            <label htmlFor="upgrade-artist-name" className="upgrade-to-artist-modal__label">
              {copy.artistBandNameLabel}
            </label>
            <input
              ref={nameInputRef}
              id="upgrade-artist-name"
              type="text"
              className={`upgrade-to-artist-modal__input${
                fieldError ? ' upgrade-to-artist-modal__input--invalid' : ''
              }`}
              value={artistName}
              onChange={(e) => {
                setArtistName(e.target.value);
                if (fieldError) setFieldError(null);
              }}
              placeholder={copy.artistBandNamePlaceholder}
              autoComplete="organization"
              disabled={loading}
              aria-invalid={!!fieldError}
            />
            {fieldError ? (
              <p className="upgrade-to-artist-modal__field-error" role="alert">
                {fieldError}
              </p>
            ) : null}
          </div>

          <div className="upgrade-to-artist-modal__actions">
            <button
              type="button"
              className="upgrade-to-artist-modal__button upgrade-to-artist-modal__button--ghost"
              onClick={handleClose}
              disabled={loading}
            >
              {copy.cancel}
            </button>
            <button
              type="submit"
              className="upgrade-to-artist-modal__button upgrade-to-artist-modal__button--primary"
              disabled={loading}
            >
              {loading ? copy.continuing : copy.continue}
            </button>
          </div>
        </form>
      </div>
    </Popup>
  );
}
