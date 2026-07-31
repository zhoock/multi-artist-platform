// src/pages/UserDashboard/components/EditAlbumModal.types.ts
import type { AlbumEditable } from '@models';

export interface EditAlbumModalProps {
  isOpen: boolean;
  albumId?: string;
  onClose: () => void;
  /** Вызывается при изменении риска потери несохранённого прогресса (fingerprint). */
  onDiscardRiskChange?: (hasRisk: boolean) => void;
  onNext?: (
    data: AlbumFormData,
    updatedAlbum?: AlbumEditable,
    meta?: { createdNewAlbum?: boolean }
  ) => void;
}

export interface BandMember {
  id: string;
  name: string;
  role: string;
  url?: string;
}

/** Черновик строки Recorded / Mixed / Mastered (отдельно от полей редактирования существующей строки в formData). */
export interface RecordingFormDraft {
  dateFrom: string;
  dateTo: string;
  studioText: string;
  city: string;
  url: string;
}

export interface RecordingEntry {
  id: string;
  text: string; // Полный текст записи (например, "SEP. 28, 2021: Igor Matvienko's recording studio M.A.M.A, Big studio, Moscow.")
  url?: string;
  dateFrom?: string; // Дата начала в формате YYYY-MM-DD
  dateTo?: string; // Дата конца в формате YYYY-MM-DD
  studioText?: string; // Текст студии без дат и города (например, "Igor Matvienko's recording studio M.A.M.A, Big studio")
  city?: string; // Город (например, "Moscow")
}

export interface ProducingCredits {
  [creditType: string]: BandMember[];
}

export interface StreamingLink {
  service: string;
  url: string;
}

export interface AlbumFormData {
  title: string;
  releaseDate: string;
  upcEan: string;
  albumArt: File | null;
  description: string;
  allowDownloadSale: 'no' | 'yes' | 'preorder';
  regularPrice: string;
  currency: string;
  preorderReleaseDate: string;
  genreCodes: string[];
  tags: string[];
  albumCoverPhotographer: string;
  albumCoverPhotographerURL: string;
  albumCoverDesigner: string;
  albumCoverDesignerURL: string;
  bandMembers: BandMember[];
  showAddBandMemberInputs?: boolean; // Показывать поля для добавления нового участника
  sessionMusicians: BandMember[];
  showAddSessionMusicianInputs?: boolean; // Показывать поля для добавления нового музыканта
  producer: BandMember[]; // Изменено с RecordingEntry[] на BandMember[] для единообразия
  producerName?: string; // Временное поле для ввода имени
  producerRole?: string; // Временное поле для ввода роли
  producerURL?: string; // Временное поле для ввода URL
  editingProducerIndex?: number | null; // Индекс редактируемой записи
  showAddProducerInputs?: boolean; // Показывать поля для добавления новой записи
  mastering: RecordingEntry[];
  masteringDateFrom?: string; // Временное поле для даты начала
  masteringDateTo?: string; // Временное поле для даты конца
  masteringText?: string; // Временное поле для текста студии
  masteringCity?: string; // Временное поле для города
  masteringURL?: string; // Временное поле для ввода URL
  editingMasteringIndex?: number | null; // Индекс редактируемой записи
  showAddMasteringInputs?: boolean; // Показывать поля для добавления новой записи
  producingCredits: ProducingCredits; // Оставляем для обратной совместимости, но больше не используем
  recordedAt: RecordingEntry[];
  recordedAtDateFrom?: string; // Временное поле для даты начала
  recordedAtDateTo?: string; // Временное поле для даты конца
  recordedAtText?: string; // Временное поле для текста студии
  recordedAtCity?: string; // Временное поле для города
  recordedAtURL?: string; // Временное поле для ввода URL
  editingRecordedAtIndex?: number | null; // Индекс редактируемой записи
  showAddRecordedAtInputs?: boolean; // Показывать поля для добавления новой записи
  mixedAt: RecordingEntry[];
  mixedAtDateFrom?: string; // Временное поле для даты начала
  mixedAtDateTo?: string; // Временное поле для даты конца
  mixedAtText?: string; // Временное поле для текста студии
  mixedAtCity?: string; // Временное поле для города
  mixedAtURL?: string; // Временное поле для ввода URL
  editingMixedAtIndex?: number | null; // Индекс редактируемой записи
  showAddMixedAtInputs?: boolean; // Показывать поля для добавления новой записи
  purchaseLinks: StreamingLink[];
  streamingLinks: StreamingLink[];
}
