// src/pages/UserDashboard/components/mixer/AddStemModal.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Upload as UploadIcon, Music as MusicIcon, X as XIcon } from 'lucide-react';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { Popup } from '@shared/ui/popup';
import { STEM_CATEGORIES, getCategoryLabel, type StemCategory } from '@entities/stem';

export interface AddStemModalLabels {
  title: string;
  fileLabel: string;
  chooseFile: string;
  fileHint: string;
  nameLabel: string;
  namePlaceholder: string;
  categoryLabel: string;
  submit: string;
  submitting: string;
  closeLabel: string;
  nameRequired: string;
  fileRequired: string;
}

interface AddStemModalProps {
  isOpen: boolean;
  lang: 'ru' | 'en';
  labels: AddStemModalLabels;
  onClose: () => void;
  onSubmit: (name: string, category: StemCategory, file: File) => Promise<void> | void;
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function AddStemModal({ isOpen, lang, labels, onClose, onSubmit }: AddStemModalProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<StemCategory>('drums');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setCategory('drums');
      setFile(null);
      setSubmitting(false);
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!file) {
      setError(labels.fileRequired);
      return;
    }
    if (!trimmed) {
      setError(labels.nameRequired);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(trimmed, category, file);
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : labels.fileRequired);
    }
  };

  return (
    <Popup isActive={isOpen} onClose={onClose} bgColor="rgba(var(--deep-black-rgb) / 95%)">
      <div className="mixer-stem-modal">
        <form className="mixer-stem-modal__container" onSubmit={handleSubmit}>
          <div className="mixer-stem-modal__header">
            <h2 className="mixer-stem-modal__title">{labels.title}</h2>
            <button
              type="button"
              className="mixer-stem-modal__close"
              onClick={onClose}
              aria-label={labels.closeLabel}
            >
              <XIcon {...dashboardActionIconProps({ size: 20 })} />
            </button>
          </div>

          <div className="mixer-stem-modal__field">
            <label className="mixer-stem-modal__label">{labels.fileLabel}</label>
            {file ? (
              <div className="mixer-stem-modal__file">
                <MusicIcon {...dashboardActionIconProps({ size: 18 })} />
                <span className="mixer-stem-modal__file-name">{file.name}</span>
                <span className="mixer-stem-modal__file-size">{formatFileSize(file.size)}</span>
                <button
                  type="button"
                  className="mixer-stem-modal__file-remove"
                  onClick={() => setFile(null)}
                  aria-label={labels.closeLabel}
                >
                  <XIcon {...dashboardActionIconProps({ size: 16 })} />
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="mixer-stem-modal__choose"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadIcon {...dashboardActionIconProps({ size: 18 })} />
                  {labels.chooseFile}
                </button>
                <p className="mixer-stem-modal__hint">{labels.fileHint}</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.wav,.flac,.aif,.aiff"
              style={{ display: 'none' }}
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected) {
                  setFile(selected);
                  setError(null);
                }
                e.target.value = '';
              }}
            />
          </div>

          <div className="mixer-stem-modal__field">
            <label className="mixer-stem-modal__label" htmlFor="mixer-stem-name">
              {labels.nameLabel}
            </label>
            <input
              id="mixer-stem-name"
              type="text"
              className="mixer-stem-modal__input"
              value={name}
              placeholder={labels.namePlaceholder}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              autoComplete="off"
            />
          </div>

          <div className="mixer-stem-modal__field">
            <label className="mixer-stem-modal__label" htmlFor="mixer-stem-category">
              {labels.categoryLabel}
            </label>
            <select
              id="mixer-stem-category"
              className="mixer-stem-modal__select"
              value={category}
              onChange={(e) => setCategory(e.target.value as StemCategory)}
            >
              {STEM_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {getCategoryLabel(item, lang)}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="mixer-stem-modal__error">{error}</p>}

          <div className="mixer-stem-modal__actions">
            <button
              type="submit"
              className="mixer-stem-modal__submit"
              disabled={submitting || !file || !name.trim()}
            >
              {submitting ? labels.submitting : labels.submit}
            </button>
          </div>
        </form>
      </div>
    </Popup>
  );
}
