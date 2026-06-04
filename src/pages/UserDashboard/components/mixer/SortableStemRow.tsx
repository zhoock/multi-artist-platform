// src/pages/UserDashboard/components/mixer/SortableStemRow.tsx
import React, { useEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical as GripVerticalIcon,
  Play as PlayIcon,
  Pause as PauseIcon,
  RefreshCw as RefreshCwIcon,
  Pencil as PencilIcon,
  Trash2 as Trash2Icon,
  Loader2 as Loader2Icon,
} from 'lucide-react';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { StemIcon, type StemMeta } from '@entities/stem';

export interface StemRowLabels {
  play: string;
  pause: string;
  replace: string;
  rename: string;
  delete: string;
  dragHint: string;
}

interface SortableStemRowProps {
  stem: StemMeta;
  busy?: boolean;
  isPlaying: boolean;
  labels: StemRowLabels;
  onTogglePlay: () => void;
  onReplaceFile: (file: File) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function SortableStemRow({
  stem,
  busy = false,
  isPlaying,
  labels,
  onTogglePlay,
  onReplaceFile,
  onRename,
  onDelete,
}: SortableStemRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stem.id,
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(stem.name);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [editing]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const startEditing = () => {
    setDraft(stem.name);
    setEditing(true);
  };

  const commitRename = () => {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed && trimmed !== stem.name) {
      onRename(trimmed);
    }
  };

  const fileSize = formatFileSize(stem.size);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`mixer-stem ${isDragging ? 'mixer-stem--dragging' : ''} ${busy ? 'mixer-stem--busy' : ''}`}
    >
      <button
        type="button"
        className="mixer-stem__drag"
        aria-label={labels.dragHint}
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon {...dashboardActionIconProps({ size: 18 })} />
      </button>

      <span className="mixer-stem__icon">
        <StemIcon category={stem.category} size={20} strokeWidth={2} />
      </span>

      <div className="mixer-stem__info">
        {editing ? (
          <input
            ref={nameInputRef}
            type="text"
            className="mixer-stem__name-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitRename();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setEditing(false);
              }
            }}
          />
        ) : (
          <button type="button" className="mixer-stem__name" onClick={startEditing}>
            {stem.name}
          </button>
        )}
        <span className="mixer-stem__file">{stem.originalFileName || stem.file}</span>
      </div>

      {fileSize && <span className="mixer-stem__size">{fileSize}</span>}

      <div className="mixer-stem__actions">
        {busy ? (
          <span className="mixer-stem__spinner" aria-hidden>
            <Loader2Icon {...dashboardActionIconProps({ size: 18 })} />
          </span>
        ) : (
          <>
            <button
              type="button"
              className="mixer-stem__action"
              onClick={onTogglePlay}
              aria-label={isPlaying ? labels.pause : labels.play}
              title={isPlaying ? labels.pause : labels.play}
            >
              {isPlaying ? (
                <PauseIcon {...dashboardActionIconProps({ size: 18 })} />
              ) : (
                <PlayIcon {...dashboardActionIconProps({ size: 18 })} />
              )}
            </button>
            <button
              type="button"
              className="mixer-stem__action"
              onClick={() => replaceInputRef.current?.click()}
              aria-label={labels.replace}
              title={labels.replace}
            >
              <RefreshCwIcon {...dashboardActionIconProps({ size: 18 })} />
            </button>
            <button
              type="button"
              className="mixer-stem__action"
              onClick={startEditing}
              aria-label={labels.rename}
              title={labels.rename}
            >
              <PencilIcon {...dashboardActionIconProps({ size: 18 })} />
            </button>
            <button
              type="button"
              className="mixer-stem__action mixer-stem__action--danger"
              onClick={onDelete}
              aria-label={labels.delete}
              title={labels.delete}
            >
              <Trash2Icon {...dashboardActionIconProps({ size: 18 })} />
            </button>
          </>
        )}
      </div>

      <input
        ref={replaceInputRef}
        type="file"
        accept="audio/*,.wav,.flac,.aif,.aiff"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onReplaceFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
