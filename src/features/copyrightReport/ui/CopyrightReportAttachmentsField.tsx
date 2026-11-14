import { useCallback, useId, useRef, useState, type DragEvent } from 'react';
import { Upload as UploadIcon, X as XIcon } from 'lucide-react';

import {
  type CopyrightReportAttachmentItem,
  COPYRIGHT_REPORT_ATTACHMENT_ACCEPT,
  validateCopyrightReportAttachmentFile,
  validateCopyrightReportAttachmentFileAsync,
} from '../lib/copyrightReportAttachments';

type AttachmentCopy = {
  sectionLabel: string;
  dropHint: string;
  typesHint: string;
  removeFile: string;
  errors: {
    type: string;
    size: string;
    duplicate: string;
  };
};

type CopyrightReportAttachmentsFieldProps = {
  items: CopyrightReportAttachmentItem[];
  onChange: (next: CopyrightReportAttachmentItem[]) => void;
  copy: AttachmentCopy;
  onValidationError?: (message: string) => void;
  disabled?: boolean;
};

function makeAttachmentId(): string {
  return `cr-att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function CopyrightReportAttachmentsField({
  items,
  onChange,
  copy,
  onValidationError,
  disabled = false,
}: CopyrightReportAttachmentsFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const ingestFiles = useCallback(
    (fileList: FileList | File[]) => {
      const incoming = Array.from(fileList);
      if (incoming.length === 0) return;

      void (async () => {
        const existingNames = new Set(items.map((i) => `${i.file.name}:${i.file.size}`));
        const next = [...items];

        for (const file of incoming) {
          const key = `${file.name}:${file.size}`;
          if (existingNames.has(key)) {
            onValidationError?.(copy.errors.duplicate);
            continue;
          }
          const issue =
            (await validateCopyrightReportAttachmentFileAsync(file)) ??
            validateCopyrightReportAttachmentFile(file);
          if (issue === 'type') {
            onValidationError?.(copy.errors.type);
            continue;
          }
          if (issue === 'size') {
            onValidationError?.(copy.errors.size);
            continue;
          }
          existingNames.add(key);
          next.push({ id: makeAttachmentId(), file });
        }

        onChange(next);
      })();
    },
    [copy.errors.duplicate, copy.errors.size, copy.errors.type, items, onChange, onValidationError]
  );

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    setDragActive(true);
  };

  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (disabled) return;
    if (e.dataTransfer.files?.length) {
      ingestFiles(e.dataTransfer.files);
    }
  };

  const removeItem = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  return (
    <div className="copyright-report-modal__field">
      <span className="copyright-report-modal__label">{copy.sectionLabel}</span>

      <label
        htmlFor={inputId}
        className={[
          'copyright-report-modal__dropzone',
          dragActive ? 'copyright-report-modal__dropzone--active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        aria-disabled={disabled || undefined}
      >
        <UploadIcon className="copyright-report-modal__dropzone-icon" aria-hidden />
        <div className="copyright-report-modal__dropzone-text">{copy.dropHint}</div>
        <div className="copyright-report-modal__dropzone-hint">{copy.typesHint}</div>
      </label>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        className="copyright-report-modal__file-input"
        accept={COPYRIGHT_REPORT_ATTACHMENT_ACCEPT}
        multiple
        disabled={disabled}
        onChange={(e) => {
          if (e.target.files?.length) {
            ingestFiles(e.target.files);
          }
          e.target.value = '';
        }}
      />

      {items.length > 0 ? (
        <ul className="copyright-report-modal__file-list">
          {items.map((item) => (
            <li key={item.id} className="copyright-report-modal__file-item">
              <span className="copyright-report-modal__file-name">{item.file.name}</span>
              <button
                type="button"
                className="copyright-report-modal__file-remove"
                onClick={() => removeItem(item.id)}
                disabled={disabled}
                aria-label={`${copy.removeFile}: ${item.file.name}`}
              >
                <XIcon size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
