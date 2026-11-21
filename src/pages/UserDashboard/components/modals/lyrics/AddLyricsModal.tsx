// src/pages/UserDashboard/components/AddLyricsModal.tsx
import React from 'react';

import { EditLyricsModal } from './EditLyricsModal';

interface AddLyricsModalProps {
  isOpen: boolean;
  trackTitle: string;
  onClose: () => void;
  onSave: (lyrics: string, authorship?: string) => void | Promise<void>;
}

/**
 * First-time lyrics entry — same fullscreen shell as {@link EditLyricsModal} (`mode="create"`).
 */
export function AddLyricsModal({ isOpen, trackTitle, onClose, onSave }: AddLyricsModalProps) {
  return (
    <EditLyricsModal
      isOpen={isOpen}
      mode="create"
      trackTitle={trackTitle}
      initialLyrics=""
      initialAuthorship=""
      onClose={onClose}
      onSave={onSave}
    />
  );
}
