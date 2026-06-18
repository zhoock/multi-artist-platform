// src/pages/UserDashboard/components/EditArticleModalV2.tsx
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Redo2 as Redo2Icon, Undo2 as Undo2Icon } from 'lucide-react';
import { Popup } from '@shared/ui/popup';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { useCloseWithUnsavedConfirmation } from '@shared/lib/hooks/useCloseWithUnsavedConfirmation';
import {
  InlineEditDiscardDialog,
  getCloseDiscardConfirmLabels,
} from '../../shared/EditableCardField';
import { getToken } from '@shared/lib/auth';
import { fetchWithAuthSession, shouldSuppressApiErrorUi } from '@shared/lib/authFetch';
import { fetchArticles, resolveArticleForDisplay } from '@entities/article';
import type { IArticles } from '@models';
import type { Block, ArticleMeta, BlockType, CarouselImageItem } from './EditArticleModalV2.utils';
import {
  normalizeDetailsToBlocks,
  blocksToDetails,
  blockFromCarouselSave,
  isSavedCarousel,
  mergeCarouselImageKeys,
  generateId,
  debounce,
  createListItem,
  isListBlockEmpty,
  emptyRichText,
  buildArticlePublicPath,
  readApiErrorMessage,
} from './EditArticleModalV2.utils';
import {
  queueArticleEditorToast,
  type ArticleEditorToastPayload,
} from '@shared/lib/articleEditorToast';
import { ArticleEditorToast } from '@shared/ui/articleEditorToast';
import type { InlineMark, RichText } from '@shared/lib/richText';
import {
  cloneRichText,
  getSelectionOffsets,
  insertText,
  isMarkdownEditorEnabled,
  isRichTextEmpty,
  mapMarkdownOffsetToPlain,
  mapPlainOffsetToMarkdown,
  markdownToRichText,
  normalizeRichText,
  richTextToMarkdown,
  setLink,
  splitRichTextAt,
  toggleMark,
  restoreSelection,
  richTextToPlainText,
} from '@shared/lib/richText';
import {
  canRedo,
  canUndo,
  captureEditorSelectionOrFallback,
  cloneSnapshot,
  createHistoryState,
  pushSnapshot as pushHistorySnapshot,
  redo as redoHistory,
  restoreEditorCaret,
  restoreEditorSelection,
  undo as undoHistory,
  type EditorSelection,
  type EditorSnapshot,
} from '@shared/lib/editorHistory';
import type {
  RichBackspaceDetail,
  RichEnterDetail,
  RichPasteMultilineDetail,
} from '@shared/ui/RichTextBlockEditor';
import { SortableBlock } from '../../blocks/SortableBlock';
import { uploadArticleBlockImage } from '../../blocks/uploadArticleBlockImage';
import type { FormatType } from '../../blocks/BlockParagraph';
import { SlashMenu } from '../../blocks/SlashMenu';
import { CarouselEditModal } from '../../articles/CarouselEditModal';
import { ArticleEditSkeleton } from '../../articles/ArticleEditSkeleton';
import { DashboardSaveSpinner } from '@shared/ui/dashboard-save/DashboardSaveSpinner';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import { uniqueUploadFileSuffix } from '@shared/lib/uniqueUploadFileSuffix';
import { sanitizeFileName } from '@shared/lib/sanitizeFileName';
import { toLocalYYYYMMDD } from '@shared/lib/dateCalendar';
import '@shared/ui/dashboard-save/dashboard-save.scss';
import './EditArticleModalV2.style.scss';

type ArticleEditorSnapshot = EditorSnapshot<Block> & {
  meta: ArticleMeta;
  selectedBlockId: string | null;
};

type PendingFocus = {
  blockId: string;
  position: 'start' | 'end' | number;
  /** true — position в plain-offset (rich mode); false — markdown-offset (textarea) */
  plainCaret?: boolean;
  selectionTo?: number;
};

interface EditArticleModalV2Props {
  isOpen: boolean;
  article: IArticles;
  onClose: () => void;
  publicArtistSlug?: string | null;
  onArticleEditorToast?: () => void;
  onArticlePersisted?: (options: { published: boolean }) => void;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const LANG_TEXTS = {
  ru: {
    editArticle: 'Редактирование статьи',
    title: 'Название статьи',
    description: 'Описание',
    cancel: 'Отмена',
    publish: 'Опубликовать',
    publishing: 'Публикация...',
    saving: 'Сохраняем...',
    saved: 'Сохранено ✓',
    draft: 'Черновик',
    error: 'Ошибка',
    articleNotFound: 'Статья не найдена',
    articleSaved: 'Статья успешно сохранена',
    articlePublished: 'Статья успешно опубликована',
    savingDraft: 'Сохранить черновик',
    savingDraftProgress: 'Сохранение черновика...',
    savingError: 'Ошибка при сохранении',
    addBlock: 'Добавить блок',
    close: 'Закрыть',
    undo: 'Отменить',
    redo: 'Повторить',
    historyActions: 'История редактирования',
  },
  en: {
    editArticle: 'Edit Article',
    title: 'Article Title',
    description: 'Description',
    cancel: 'Cancel',
    publish: 'Publish',
    publishing: 'Publishing...',
    saving: 'Saving...',
    saved: 'Saved ✓',
    draft: 'Draft',
    error: 'Error',
    articleNotFound: 'Article not found',
    articleSaved: 'Article saved successfully',
    articlePublished: 'Article published successfully',
    savingDraft: 'Save draft',
    savingDraftProgress: 'Saving draft...',
    savingError: 'Error saving article',
    addBlock: 'Add Block',
    close: 'Close',
    undo: 'Undo',
    redo: 'Redo',
    historyActions: 'Edit history',
  },
};

function normalizeArticlePayloadItem(raw: unknown): IArticles | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const articleIdRaw = r.articleId;
  if (articleIdRaw == null || String(articleIdRaw).trim() === '') return null;
  const details = Array.isArray(r.details) ? r.details : [];

  return {
    id: r.id != null ? String(r.id) : undefined,
    userId: r.userId != null ? String(r.userId) : undefined,
    articleId: String(articleIdRaw),
    nameArticle: typeof r.nameArticle === 'string' ? r.nameArticle : '',
    img: typeof r.img === 'string' ? r.img : '',
    date: typeof r.date === 'string' ? r.date : '',
    details: details as IArticles['details'],
    description: typeof r.description === 'string' ? r.description : '',
    isDraft: r.isDraft === true,
    translations: r.translations as IArticles['translations'],
    lang: r.lang as IArticles['lang'],
  };
}

function extractFirstArticleFromApiJson(json: unknown): IArticles | null {
  if (!json || typeof json !== 'object') return null;
  const root = json as Record<string, unknown>;
  const list = Array.isArray(json)
    ? json
    : Array.isArray(root.data)
      ? root.data
      : Array.isArray(root.articles)
        ? root.articles
        : null;
  if (!list || list.length === 0) return null;
  return normalizeArticlePayloadItem(list[0]);
}

function isArticleContentTarget(element: Element | null): boolean {
  if (!element) return false;
  return element.closest('.edit-article-v2__content-column') !== null;
}

/** Cmd+A: select article body from anywhere in the editor (header/footer included). */
function shouldHandleArticleSelectAll(activeElement: Element | null): boolean {
  if (activeElement?.closest('.carousel-edit-modal, [role="alertdialog"]')) {
    return false;
  }
  return true;
}

export function EditArticleModalV2({
  isOpen,
  article,
  onClose,
  publicArtistSlug,
  onArticleEditorToast,
  onArticlePersisted,
}: EditArticleModalV2Props) {
  const { lang } = useLang();
  const dispatch = useAppDispatch();
  const texts = LANG_TEXTS[lang];
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));

  // Состояние редактора
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [meta, setMeta] = useState<ArticleMeta>({ title: '', description: '' });
  const [focusBlockId, setFocusBlockId] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [isDocumentSelected, setIsDocumentSelected] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Исходные значения для отслеживания изменений
  const [initialBlocks, setInitialBlocks] = useState<Block[]>([]);
  const [initialMeta, setInitialMeta] = useState<ArticleMeta>({ title: '', description: '' });

  // История Undo/Redo (единый стек операций редактора)
  const [historyState, setHistoryState] = useState(() =>
    createHistoryState<ArticleEditorSnapshot>()
  );
  const typingSnapshotPendingRef = useRef(false);
  const textChangeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [slashMenu, setSlashMenu] = useState<{
    blockId: string;
    position: { top: number; left: number };
    cursorPos: number;
  } | null>(null);
  const [slashMenuSelectedIndex, setSlashMenuSelectedIndex] = useState(0);
  // VK-стиль инсертера: показывается только после Enter в конце блока
  const [vkInserter, setVkInserter] = useState<{ afterBlockId: string } | null>(null);
  /** ID paragraph-блока, в который нужно поставить каретку при открытии новой статьи. */
  const [autofocusParagraphBlockId, setAutofocusParagraphBlockId] = useState<string | null>(null);
  // Модал редактирования карусели
  const [carouselEditModal, setCarouselEditModal] = useState<{
    blockId: string;
    images: CarouselImageItem[];
  } | null>(null);

  // Ref для отложенной установки фокуса после удаления блока
  const pendingFocusRef = useRef<PendingFocus | null>(null);
  const contentColumnRef = useRef<HTMLDivElement>(null);
  const imageUploadBlockIdRef = useRef<string | null>(null);
  const imageUploadInputRef = useRef<HTMLInputElement>(null);

  // Обработка Escape для скрытия VK-плюса
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && vkInserter) {
        setVkInserter(null);
      }
    };

    if (vkInserter) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [vkInserter]);

  // Sensors для drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Состояние сохранения
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [originalIsDraft, setOriginalIsDraft] = useState<boolean>(true);
  const [editorToast, setEditorToast] = useState<ArticleEditorToastPayload | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setEditorToast(null);
    }
  }, [isOpen]);

  // Refs для управления автосохранением
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentArticle, setCurrentArticle] = useState<IArticles | null>(null);

  // Очистка таймера текстовых изменений при размонтировании
  useEffect(() => {
    return () => {
      if (textChangeTimeoutRef.current) {
        clearTimeout(textChangeTimeoutRef.current);
      }
    };
  }, []);

  // Загрузка статьи при открытии
  useEffect(() => {
    if (!isOpen) return;

    const loadArticle = async () => {
      // Если это новая статья (articleId начинается с "new-"), пропускаем загрузку
      if (article.articleId.startsWith('new-')) {
        setIsLoading(false);
        setCurrentArticle(article);
        setOriginalIsDraft(true);
        const firstBlockId = generateId();
        const initialBlocksValue: Block[] = [
          { id: firstBlockId, type: 'paragraph', content: emptyRichText() },
        ];
        const initialMetaValue = {
          title: '',
          description: '',
        };
        setAutofocusParagraphBlockId(firstBlockId);
        setFocusBlockId(firstBlockId);
        setVkInserter({ afterBlockId: firstBlockId });
        setBlocks(initialBlocksValue);
        setMeta(initialMetaValue);
        setInitialBlocks(JSON.parse(JSON.stringify(initialBlocksValue))); // Deep copy
        setInitialMeta({ ...initialMetaValue });
        setHistoryState(createHistoryState());
        typingSnapshotPendingRef.current = false;
        return;
      }

      setIsLoading(true);
      try {
        const token = getToken();
        if (!token) return;

        const fetchUrl = '/api/articles-api?includeDrafts=true';
        const response = await fetchWithAuthSession(fetchUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (response.ok) {
          const data = await response.json();
          const articlesList = Array.isArray(data) ? data : (data.data ?? data.articles ?? []);
          const articleForEdit = articlesList.find(
            (a: IArticles) => a.articleId === article.articleId
          );
          if (articleForEdit) {
            setCurrentArticle(articleForEdit);
            setOriginalIsDraft(articleForEdit.isDraft ?? true);

            // Парсим details, если это строка (JSONB из базы может приходить как строка)
            let parsedDetails = articleForEdit.details;
            if (typeof articleForEdit.details === 'string') {
              try {
                parsedDetails = JSON.parse(articleForEdit.details);
              } catch (e) {
                parsedDetails = [];
              }
            }

            // Убеждаемся, что details - это массив
            if (!Array.isArray(parsedDetails)) {
              parsedDetails = [];
            }
            // Инициализируем блоки и мета
            const resolved = resolveArticleForDisplay(articleForEdit, lang);
            const loadedBlocks = normalizeDetailsToBlocks(resolved.details || parsedDetails);
            setBlocks(loadedBlocks);
            setInitialBlocks(JSON.parse(JSON.stringify(loadedBlocks))); // Deep copy
            const loadedMeta = {
              title: resolved.nameArticle || '',
              description: resolved.description || '',
            };
            setMeta(loadedMeta);
            setInitialMeta({ ...loadedMeta });
            setHistoryState(createHistoryState());
            typingSnapshotPendingRef.current = false;
          }
        }
      } catch (error) {
        console.error('Error loading article:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadArticle();
  }, [isOpen, article.articleId, lang]);

  // Очистка при закрытии
  useEffect(() => {
    isMountedRef.current = isOpen;
    if (!isOpen) {
      setAutofocusParagraphBlockId(null);
      setFocusBlockId(null);
      setIsDocumentSelected(false);
      setVkInserter(null);
      // Отменяем автосохранение
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }
      // Отменяем запросы
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    }
    return () => {
      isMountedRef.current = false;
    };
  }, [isOpen]);

  const abortSaveFailureIfSessionInterrupted = useCallback(
    async (response?: Response, init?: RequestInit): Promise<boolean> => {
      if (await shouldSuppressApiErrorUi(response, init)) {
        setSaveStatus('idle');
        return true;
      }
      return false;
    },
    []
  );

  // Автосохранение
  const autoSave = useCallback(async () => {
    if (!isMountedRef.current || !isOpen || !currentArticle) return;

    if (isPublishing || isSavingDraft) return;

    if (!currentArticle.id) return;

    // Отменяем предыдущий запрос
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setSaveStatus('saving');

    try {
      const token = getToken();
      if (!token) return;

      const details = blocksToDetails(blocks);
      const shouldBeDraft = originalIsDraft ?? true;

      const requestBody = {
        articleId: currentArticle.articleId,
        lang,
        translations: {
          [lang]: {
            nameArticle: meta.title,
            description: meta.description,
            details,
          },
        },
        img: currentArticle.img || article.img || '',
        date: currentArticle.date || article.date,
        isDraft: shouldBeDraft,
      };

      const fetchInit = {
        method: 'PUT' as const,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
        signal: abortControllerRef.current.signal,
      };

      const response = await fetchWithAuthSession(
        `/api/articles-api?id=${encodeURIComponent(currentArticle.id)}`,
        fetchInit
      );

      if (response.ok) {
        setSaveStatus('saved');
        setLastSaved(new Date());
        // Обновляем Redux store
        try {
          await dispatch(fetchArticles({ force: true, ownerDashboard: true })).unwrap();
        } catch (error) {
          console.warn('Failed to update Redux store:', error);
        }
      } else if (await abortSaveFailureIfSessionInterrupted(response, fetchInit)) {
        return;
      } else {
        setSaveStatus('error');
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        if (await shouldSuppressApiErrorUi()) {
          setSaveStatus('idle');
          return;
        }
        console.error('Auto-save error:', error);
        setSaveStatus('error');
      }
    } finally {
      if (isMountedRef.current) {
        // Сбрасываем статус через 2 секунды
        setTimeout(() => {
          if (isMountedRef.current && saveStatus === 'saved') {
            setSaveStatus('idle');
          }
        }, 2000);
      }
    }
  }, [
    blocks,
    meta,
    currentArticle,
    originalIsDraft,
    lang,
    dispatch,
    isOpen,
    article,
    saveStatus,
    isPublishing,
    isSavingDraft,
    abortSaveFailureIfSessionInterrupted,
  ]);

  // Debounced автосохранение
  const debouncedAutoSave = useRef(
    debounce(() => {
      autoSave();
    }, 1500)
  ).current;

  // Планирование автосохранения
  useEffect(() => {
    if (!isOpen || !currentArticle) return;

    if (!currentArticle.id) return;

    debouncedAutoSave();

    return () => {
      // Очистка при размонтировании
    };
  }, [blocks, meta, isOpen, currentArticle?.id, debouncedAutoSave]);

  // Функция для сравнения двух блоков
  const blocksAreEqual = useCallback((block1: Block, block2: Block): boolean => {
    if (block1.id !== block2.id || block1.type !== block2.type) {
      return false;
    }

    // Сравниваем в зависимости от типа блока
    switch (block1.type) {
      case 'paragraph':
      case 'title':
      case 'subtitle':
      case 'quote':
        return JSON.stringify(block1.content) === JSON.stringify((block2 as typeof block1).content);

      case 'list':
        return JSON.stringify(block1.items) === JSON.stringify((block2 as typeof block1).items);

      case 'divider':
        return true; // divider не имеет дополнительных свойств

      case 'image':
        return (
          block1.imageKey === (block2 as typeof block1).imageKey &&
          block1.caption === (block2 as typeof block1).caption
        );

      case 'carousel':
        return JSON.stringify(block1.images) === JSON.stringify((block2 as typeof block1).images);

      default:
        return false;
    }
  }, []);

  // Проверка наличия изменений
  const hasChanges = useMemo(() => {
    // Сравниваем блоки
    const blocksChanged =
      blocks.length !== initialBlocks.length ||
      blocks.some((block, index) => {
        const initialBlock = initialBlocks[index];
        if (!initialBlock) return true;
        return !blocksAreEqual(block, initialBlock);
      });

    // Сравниваем мета
    const metaChanged =
      meta.title !== initialMeta.title || meta.description !== initialMeta.description;

    return blocksChanged || metaChanged;
  }, [blocks, initialBlocks, meta, initialMeta, blocksAreEqual]);

  // Отмена изменений
  const handleCancel = useCallback(() => {
    setBlocks(JSON.parse(JSON.stringify(initialBlocks))); // Deep copy
    setMeta({ ...initialMeta });
  }, [initialBlocks, initialMeta]);

  const finalizeArticleModalClose = useCallback(() => {
    if (hasChanges) handleCancel();
    onClose();
  }, [hasChanges, handleCancel, onClose]);

  const isArticleSaveBusy = saveStatus === 'saving' || isPublishing || isSavingDraft;

  const popupRequestCloseRef = useRef<(() => void) | null>(null);
  const closeDialog = useCallback(() => {
    popupRequestCloseRef.current?.();
  }, []);

  const articleCloseGuard = useCloseWithUnsavedConfirmation({
    isOpen,
    isBusy: isArticleSaveBusy,
    hasUnsavedChanges: hasChanges,
    closeDialog,
  });

  const showEditorToast = useCallback((payload: ArticleEditorToastPayload) => {
    setEditorToast(payload);
  }, []);

  const showArticleSaveError = useCallback(
    async (response?: Response, init?: RequestInit) => {
      if (await shouldSuppressApiErrorUi(response, init)) return;
      const message = response
        ? await readApiErrorMessage(response, texts.savingError)
        : texts.savingError;
      showEditorToast({ kind: 'error', message });
    },
    [texts.savingError, showEditorToast]
  );

  const handleSaveDraft = useCallback(async () => {
    if (!currentArticle) return;

    setIsSavingDraft(true);
    setSaveStatus('saving');

    try {
      const token = getToken();
      if (!token) return;

      const details = blocksToDetails(blocks);

      let articleId = currentArticle.articleId.startsWith('new-')
        ? currentArticle.articleId.replace('new-', '')
        : currentArticle.articleId;

      if (!articleId || articleId.startsWith('new-')) {
        articleId = `article-${Date.now()}`;
      }

      const neverPublished = originalIsDraft ?? true;
      const requestBody = {
        articleId,
        lang,
        translations: {
          [lang]: {
            nameArticle: meta.title.trim() || 'Untitled',
            description: meta.description || '',
            details,
          },
        },
        img: currentArticle.img || article.img || '',
        date: currentArticle.date || article.date || toLocalYYYYMMDD(),
        isDraft: neverPublished,
      };

      const isNewArticle = !currentArticle.id;
      const url = isNewArticle
        ? '/api/articles-api'
        : `/api/articles-api?id=${encodeURIComponent(currentArticle.id || '')}`;
      const method = isNewArticle ? 'POST' : 'PUT';

      const fetchInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      };

      const response = await fetchWithAuthSession(url, fetchInit);

      if (response.ok) {
        setSaveStatus('saved');
        setLastSaved(new Date());
        if (neverPublished) {
          setOriginalIsDraft(true);
        }

        if (isNewArticle) {
          const json: unknown = await response.json();
          const saved = extractFirstArticleFromApiJson(json);
          if (saved) {
            setCurrentArticle((prev) =>
              prev
                ? {
                    ...prev,
                    ...saved,
                    img: saved.img || prev.img || article.img || '',
                    date: saved.date || prev.date || article.date || '',
                  }
                : saved
            );
          }
        }

        setInitialBlocks(JSON.parse(JSON.stringify(blocks)));
        setInitialMeta({ ...meta });

        try {
          await dispatch(fetchArticles({ force: true, ownerDashboard: true })).unwrap();
        } catch (error) {
          console.warn('Failed to update Redux store:', error);
        }

        onArticlePersisted?.({ published: false });
        showEditorToast({ kind: 'draft-saved' });
      } else if (await abortSaveFailureIfSessionInterrupted(response, fetchInit)) {
        return;
      } else {
        setSaveStatus('error');
        void showArticleSaveError(response, fetchInit);
      }
    } catch (error) {
      if (await shouldSuppressApiErrorUi()) {
        setSaveStatus('idle');
        return;
      }
      console.error('Save draft error:', error);
      setSaveStatus('error');
      void showArticleSaveError();
    } finally {
      setIsSavingDraft(false);
    }
  }, [
    blocks,
    meta,
    currentArticle,
    originalIsDraft,
    lang,
    dispatch,
    article,
    showEditorToast,
    showArticleSaveError,
    abortSaveFailureIfSessionInterrupted,
    onArticlePersisted,
  ]);

  // Публикация
  const handlePublish = useCallback(async () => {
    if (!currentArticle) return;

    setIsPublishing(true);
    setSaveStatus('saving');

    try {
      const token = getToken();
      if (!token) return;

      // Принудительное сохранение перед публикацией
      const details = blocksToDetails(blocks);

      // Для новой статьи генерируем articleId из timestamp, если его нет
      let articleId = currentArticle.articleId.startsWith('new-')
        ? currentArticle.articleId.replace('new-', '')
        : currentArticle.articleId;

      // Если articleId пустой или все еще начинается с "new-", генерируем новый
      if (!articleId || articleId.startsWith('new-')) {
        articleId = `article-${Date.now()}`;
      }

      const requestBody = {
        articleId: articleId,
        lang,
        translations: {
          [lang]: {
            nameArticle: meta.title || 'Untitled',
            description: meta.description || '',
            details,
          },
        },
        img: currentArticle.img || article.img || '',
        date: currentArticle.date || article.date || toLocalYYYYMMDD(),
        isDraft: false,
        hasDraftChanges: false,
      };

      // До первого сохранения в БД нет id — POST; далее PUT
      const isNewArticle = !currentArticle.id;
      const url = isNewArticle
        ? '/api/articles-api'
        : `/api/articles-api?id=${encodeURIComponent(currentArticle.id || '')}`;
      const method = isNewArticle ? 'POST' : 'PUT';

      const fetchInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      };

      const response = await fetchWithAuthSession(url, fetchInit);

      if (response.ok) {
        let publishedArticleId = articleId;

        if (isNewArticle) {
          const json: unknown = await response.json();
          const saved = extractFirstArticleFromApiJson(json);
          if (saved?.articleId) {
            publishedArticleId = saved.articleId;
          }
        }

        setSaveStatus('saved');
        setOriginalIsDraft(false);
        setInitialBlocks(JSON.parse(JSON.stringify(blocks)));
        setInitialMeta({ ...meta });

        queueArticleEditorToast({
          kind: 'published',
          articleHref: buildArticlePublicPath(publishedArticleId, publicArtistSlug),
        });
        onArticleEditorToast?.();

        await dispatch(fetchArticles({ force: true, ownerDashboard: true })).unwrap();
        onArticlePersisted?.({ published: true });
        onClose();
      } else if (await abortSaveFailureIfSessionInterrupted(response, fetchInit)) {
        return;
      } else {
        setSaveStatus('error');
        void showArticleSaveError(response, fetchInit);
      }
    } catch (error) {
      if (await shouldSuppressApiErrorUi()) {
        setSaveStatus('idle');
        return;
      }
      console.error('Publish error:', error);
      setSaveStatus('error');
      void showArticleSaveError();
    } finally {
      setIsPublishing(false);
    }
  }, [
    blocks,
    meta,
    currentArticle,
    lang,
    dispatch,
    onClose,
    article,
    publicArtistSlug,
    onArticleEditorToast,
    showArticleSaveError,
    abortSaveFailureIfSessionInterrupted,
    onArticlePersisted,
  ]);

  // Создание нового блока по типу
  const createBlock = useCallback((type: BlockType): Block => {
    switch (type) {
      case 'paragraph':
        return { id: generateId(), type: 'paragraph', content: emptyRichText() };
      case 'title':
        return { id: generateId(), type: 'title', content: emptyRichText() };
      case 'subtitle':
        return { id: generateId(), type: 'subtitle', content: emptyRichText() };
      case 'quote':
        return { id: generateId(), type: 'quote', content: emptyRichText() };
      case 'list':
        return { id: generateId(), type: 'list', items: [createListItem('')] };
      case 'divider':
        return { id: generateId(), type: 'divider' };
      case 'image':
        return { id: generateId(), type: 'image', imageKey: '' };
      case 'carousel':
        return { id: generateId(), type: 'carousel', images: [] };
    }
  }, []);

  const buildCurrentSnapshot = useCallback((): ArticleEditorSnapshot => {
    return {
      blocks: cloneSnapshot(blocks),
      meta: { ...meta },
      selectedBlockId,
      selection: captureEditorSelectionOrFallback(focusBlockId, selectedBlockId),
    };
  }, [blocks, meta, selectedBlockId, focusBlockId]);

  const applySnapshot = useCallback((snapshot: ArticleEditorSnapshot) => {
    setIsDocumentSelected(false);
    setBlocks(cloneSnapshot(snapshot.blocks));
    setMeta({ ...snapshot.meta });
    setSelectedBlockId(snapshot.selectedBlockId);

    if (snapshot.selection) {
      const { blockId, from, to } = snapshot.selection;
      const listBlockId = blockId.includes(':') ? blockId.split(':')[0] : blockId;
      setFocusBlockId(listBlockId);
      pendingFocusRef.current = {
        blockId,
        position: from,
        plainCaret: true,
        selectionTo: to,
      };
    } else if (snapshot.selectedBlockId) {
      setFocusBlockId(snapshot.selectedBlockId);
    }
  }, []);

  const saveSnapshot = useCallback(
    (selectionOverride?: EditorSelection | null) => {
      const snapshot: ArticleEditorSnapshot = {
        blocks: cloneSnapshot(blocks),
        meta: { ...meta },
        selectedBlockId,
        selection:
          selectionOverride !== undefined
            ? selectionOverride
            : captureEditorSelectionOrFallback(focusBlockId, selectedBlockId),
      };
      setHistoryState((prev) => pushHistorySnapshot(prev, cloneSnapshot(snapshot)));
    },
    [blocks, meta, selectedBlockId, focusBlockId]
  );

  const undo = useCallback(() => {
    const current = buildCurrentSnapshot();
    const result = undoHistory(historyState, cloneSnapshot(current));
    if (!result) return;
    setHistoryState(result.state);
    applySnapshot(result.snapshot);
    typingSnapshotPendingRef.current = false;
  }, [historyState, buildCurrentSnapshot, applySnapshot]);

  const redo = useCallback(() => {
    const current = buildCurrentSnapshot();
    const result = redoHistory(historyState, cloneSnapshot(current));
    if (!result) return;
    setHistoryState(result.state);
    applySnapshot(result.snapshot);
    typingSnapshotPendingRef.current = false;
  }, [historyState, buildCurrentSnapshot, applySnapshot]);

  const selectEntireDocument = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setIsDocumentSelected(true);
    setSelectedBlockId(null);
  }, []);

  const clearEntireDocument = useCallback(() => {
    saveSnapshot();

    const newParagraphId = generateId();
    const emptyParagraph: Block = {
      id: newParagraphId,
      type: 'paragraph',
      content: emptyRichText(),
    };

    setIsDocumentSelected(false);
    setMeta({ title: '', description: '' });
    setBlocks([emptyParagraph]);
    setSelectedBlockId(null);
    setSlashMenu(null);
    setVkInserter({ afterBlockId: newParagraphId });
    setFocusBlockId(newParagraphId);
    pendingFocusRef.current = {
      blockId: newParagraphId,
      position: 'start',
      plainCaret: true,
    };
  }, [saveSnapshot]);

  // Функция для вычисления целевого блока после удаления
  const findTargetBlockAfterDelete = useCallback(
    (deletedBlockIndex: number, newBlocks: Block[], deletedBlockType?: string): Block | null => {
      // Правило 1: Если удаляем активный блок, сначала проверяем следующий
      // В новом массиве индекс deletedBlockIndex указывает на блок, который был следующим
      let emptyBlockCandidate: Block | null = null;
      let filledBlockCandidate: Block | null = null;

      // Ищем следующий текстовый блок
      if (deletedBlockIndex < newBlocks.length) {
        for (let i = deletedBlockIndex; i < newBlocks.length; i++) {
          const block = newBlocks[i];
          if (
            block &&
            (block.type === 'paragraph' ||
              block.type === 'title' ||
              block.type === 'subtitle' ||
              block.type === 'quote')
          ) {
            // Правило 2: Приоритет новым пустым блокам (созданным Return)
            if (isRichTextEmpty(block.content)) {
              emptyBlockCandidate = block;
            } else if (!filledBlockCandidate) {
              filledBlockCandidate = block;
            }
            // Если нашли пустой блок, сразу возвращаем его
            if (emptyBlockCandidate) {
              return emptyBlockCandidate;
            }
          }
        }
      }

      // Если нашли заполненный следующий блок, возвращаем его
      if (filledBlockCandidate) {
        return filledBlockCandidate;
      }

      // Если не нашли следующий, ищем предыдущий текстовый блок
      emptyBlockCandidate = null;
      filledBlockCandidate = null;
      for (let i = deletedBlockIndex - 1; i >= 0; i--) {
        const block = newBlocks[i];
        if (
          block &&
          (block.type === 'paragraph' ||
            block.type === 'title' ||
            block.type === 'subtitle' ||
            block.type === 'quote')
        ) {
          // Правило 2: Приоритет новым пустым блокам (созданным Return)
          if (isRichTextEmpty(block.content)) {
            emptyBlockCandidate = block;
          } else if (!filledBlockCandidate) {
            filledBlockCandidate = block;
          }
          // Если нашли пустой блок, сразу возвращаем его
          if (emptyBlockCandidate) {
            return emptyBlockCandidate;
          }
        }
      }

      // Возвращаем заполненный предыдущий блок, если нашли
      if (filledBlockCandidate) {
        return filledBlockCandidate;
      }

      // Если не нашли текстовый блок, возвращаем null (будет создан новый)
      return null;
    },
    []
  );

  // Функция для установки фокуса в конец блока
  const focusBlockEnd = useCallback((blockId: string) => {
    setFocusBlockId(blockId);
    // Используем requestAnimationFrame для установки фокуса после обновления DOM
    requestAnimationFrame(() => {
      const textarea = document.querySelector(
        `[data-block-id="${blockId}"] textarea`
      ) as HTMLTextAreaElement;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }
    });
  }, []);

  // Управление блоками
  const insertBlock = useCallback(
    (index: number, type: BlockType) => {
      // Сохраняем снимок перед вставкой
      saveSnapshot();

      const newBlock = createBlock(type);

      setBlocks((prev) => {
        const newBlocks = [...prev];
        newBlocks.splice(index, 0, newBlock);
        return newBlocks;
      });

      // Фокус на новый блок
      setTimeout(() => {
        setFocusBlockId(newBlock.id);
      }, 0);
    },
    [createBlock, saveSnapshot]
  );

  type DeleteFocus = { blockId: string; position: 'start' | 'end' | number; plainCaret?: boolean };

  const deleteBlock = useCallback(
    (blockId: string, forcedFocus?: DeleteFocus) => {
      // Сохраняем снимок перед удалением
      saveSnapshot();

      // Если мы заранее знаем куда ставить каретку — фиксируем это ДО setBlocks
      if (forcedFocus) {
        pendingFocusRef.current = forcedFocus;
      }

      setBlocks((prev) => {
        const blockIndex = prev.findIndex((b) => b.id === blockId);
        const deletedBlock = prev.find((b) => b.id === blockId);
        const filtered = prev.filter((b) => b.id !== blockId);
        // Если блоков не осталось, создаем пустой paragraph
        const newParagraph: Block = {
          id: generateId(),
          type: 'paragraph',
          content: emptyRichText(),
        };
        const newBlocks = filtered.length > 0 ? filtered : [newParagraph];

        // IMPORTANT: если forcedFocus уже задан — НЕ переопределяем его автологикой
        if (!forcedFocus) {
          // Вычисляем целевой блок ПОСЛЕ удаления (не используем origin caretPosition)
          const deletedBlockType = deletedBlock?.type;
          // В новом массиве индекс удаленного блока равен blockIndex (так как мы удалили его)
          const targetBlock = findTargetBlockAfterDelete(blockIndex, newBlocks, deletedBlockType);

          // Сохраняем информацию о целевом блоке для установки фокуса после обновления DOM
          if (targetBlock) {
            pendingFocusRef.current = { blockId: targetBlock.id, position: 'end' };
          } else {
            // Если не нашли целевой блок, создаем новый пустой paragraph
            const newEmptyParagraph: Block = {
              id: generateId(),
              type: 'paragraph',
              content: emptyRichText(),
            };
            pendingFocusRef.current = { blockId: newEmptyParagraph.id, position: 'start' };
            // Добавляем новый блок в массив
            return [...newBlocks, newEmptyParagraph];
          }
        }

        return newBlocks;
      });
    },
    [saveSnapshot, findTargetBlockAfterDelete]
  );

  // Открыть редактор карусели (конвертация — только после «Сохранить» с ≥2 фото)
  const convertImageToCarousel = useCallback(
    (blockId: string) => {
      const block = blocks.find((b) => b.id === blockId);
      if (!block) return;

      if (block.type === 'image') {
        setCarouselEditModal({
          blockId: block.id,
          images: block.imageKey ? [{ imageKey: block.imageKey, caption: block.caption }] : [],
        });
      } else if (block.type === 'carousel' && !isSavedCarousel(block.images)) {
        setCarouselEditModal({
          blockId: block.id,
          images: [...block.images],
        });
      } else {
        return;
      }

      setSelectedBlockId(null);
    },
    [blocks]
  );

  // Select-all, clear document, Delete/Backspace для блоков и Undo/Redo
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const inContent = isArticleContentTarget(activeElement);
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const metaKey = isMac ? event.metaKey : event.ctrlKey;
      if (typeof event.key !== 'string') return;
      const key = event.key.toLowerCase();

      // Проверяем Undo/Redo до проверки фокуса в текстовом поле
      if (metaKey && key === 'z') {
        if (event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          redo();
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        undo();
        return;
      }

      // Redo через Ctrl+Y (Windows)
      if (!isMac && event.ctrlKey && key === 'y') {
        event.preventDefault();
        event.stopPropagation();
        redo();
        return;
      }

      if (metaKey && key === 'a' && shouldHandleArticleSelectAll(activeElement)) {
        event.preventDefault();
        event.stopPropagation();
        selectEntireDocument();
        return;
      }

      if (isDocumentSelected && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault();
        event.stopPropagation();
        clearEntireDocument();
        return;
      }

      const isTextField =
        activeElement &&
        (activeElement.tagName === 'TEXTAREA' ||
          activeElement.tagName === 'INPUT' ||
          (activeElement as HTMLElement).isContentEditable);

      if (isTextField && inContent) {
        return;
      }

      if (selectedBlockId && (event.key === 'Delete' || event.key === 'Backspace')) {
        const selectedBlock = blocks.find((b) => b.id === selectedBlockId);
        if (
          selectedBlock &&
          (selectedBlock.type === 'image' || selectedBlock.type === 'carousel')
        ) {
          event.preventDefault();
          deleteBlock(selectedBlockId);
          setSelectedBlockId(null);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [
    isOpen,
    isDocumentSelected,
    selectedBlockId,
    blocks,
    deleteBlock,
    undo,
    redo,
    selectEntireDocument,
    clearEntireDocument,
  ]);

  useEffect(() => {
    if (!isDocumentSelected) return undefined;

    const clearDocumentSelection = () => setIsDocumentSelected(false);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (typeof event.key !== 'string') return;
      if (event.key === 'Escape' || event.key.startsWith('Arrow')) {
        clearDocumentSelection();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (
        contentColumnRef.current?.contains(target) ||
        target.closest('.edit-article-v2__header, .edit-article-v2__footer') !== null
      ) {
        clearDocumentSelection();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isDocumentSelected]);

  // Установка фокуса после удаления блока (useLayoutEffect выполняется синхронно после обновления DOM)
  useLayoutEffect(() => {
    if (pendingFocusRef.current) {
      const { blockId, position, plainCaret, selectionTo } = pendingFocusRef.current;
      pendingFocusRef.current = null;

      requestAnimationFrame(() => {
        setFocusBlockId(blockId.includes(':') ? blockId.split(':')[0] : blockId);
        if (selectionTo !== undefined && plainCaret) {
          restoreEditorSelection(blockId, position as number, selectionTo);
        } else {
          restoreEditorCaret(blockId, position, plainCaret ?? false);
        }
      });
    }
  }, [blocks]);

  // Снятие выделения при клике вне блока
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Проверяем, что клик не на блоке изображения или его дочерних элементах
      if (
        selectedBlockId &&
        !target.closest('.edit-article-v2__block--image') &&
        !target.closest('.edit-article-v2__block-wrapper--selected')
      ) {
        setSelectedBlockId(null);
      }
    };

    if (selectedBlockId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [selectedBlockId]);

  const updateBlock = useCallback(
    (blockId: string, updates: Partial<Block>, shouldSaveHistory = false) => {
      // Если это текстовое изменение, группируем через debounce
      const isTextChange = 'content' in updates || 'items' in updates || 'caption' in updates;

      if (isTextChange && !shouldSaveHistory) {
        if (!typingSnapshotPendingRef.current) {
          saveSnapshot();
          typingSnapshotPendingRef.current = true;
        }

        if (textChangeTimeoutRef.current) {
          clearTimeout(textChangeTimeoutRef.current);
        }

        textChangeTimeoutRef.current = setTimeout(() => {
          typingSnapshotPendingRef.current = false;
        }, 500);
      } else {
        if (shouldSaveHistory) {
          saveSnapshot();
        }
        typingSnapshotPendingRef.current = false;
        if (textChangeTimeoutRef.current) {
          clearTimeout(textChangeTimeoutRef.current);
          textChangeTimeoutRef.current = null;
        }
      }

      setBlocks((prev) =>
        prev.map((block) => {
          if (block.id !== blockId) return block;
          // Type-safe merge
          const updatedBlock = { ...block, ...updates } as Block;

          // Если пользователь начал печатать в блоке с VK-плюсом, скрываем плюс
          if (vkInserter?.afterBlockId === blockId) {
            // Проверяем, что блок больше не пустой (для текстовых блоков)
            if (
              (updatedBlock.type === 'paragraph' ||
                updatedBlock.type === 'title' ||
                updatedBlock.type === 'subtitle' ||
                updatedBlock.type === 'quote') &&
              !isRichTextEmpty(updatedBlock.content)
            ) {
              setVkInserter(null);
            }
            // Для списка проверяем, что есть непустые элементы
            if (
              updatedBlock.type === 'list' &&
              updatedBlock.items.some((item) => !isRichTextEmpty(item.content))
            ) {
              setVkInserter(null);
            }
          }

          return updatedBlock;
        })
      );
    },
    [vkInserter, saveSnapshot]
  );

  const requestImageUpload = useCallback((blockId: string) => {
    imageUploadBlockIdRef.current = blockId;
    imageUploadInputRef.current?.click();
  }, []);

  const handleImageUploadFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const blockId = imageUploadBlockIdRef.current;
      const file = event.target.files?.[0];
      imageUploadBlockIdRef.current = null;
      event.target.value = '';

      if (!blockId || !file) return;

      try {
        const imageKey = await uploadArticleBlockImage(file);
        if (imageKey) {
          updateBlock(blockId, { imageKey } as Partial<Block>);
        }
      } catch (error) {
        console.error('Error uploading image:', error);
      }
    },
    [updateBlock]
  );

  // Обработчики для блоков
  const handleBlockEnter = useCallback(
    (
      blockId: string,
      atEnd: boolean,
      richOptions?: { afterContent?: RichText; plainOffset?: number }
    ) => {
      const blockIndex = blocks.findIndex((b) => b.id === blockId);
      if (blockIndex === -1) return;

      const block = blocks[blockIndex];

      if (atEnd) {
        saveSnapshot();

        const newBlock = createBlock('paragraph');
        setBlocks((prev) => {
          const newBlocks = [...prev];
          newBlocks.splice(blockIndex + 1, 0, newBlock);
          return newBlocks;
        });

        setVkInserter({ afterBlockId: newBlock.id });

        pendingFocusRef.current = {
          blockId: newBlock.id,
          position: 'start',
          plainCaret: !!richOptions,
        };
      } else if (
        block.type === 'paragraph' ||
        block.type === 'title' ||
        block.type === 'subtitle' ||
        block.type === 'quote'
      ) {
        saveSnapshot();

        let after: RichText;

        if (richOptions?.afterContent !== undefined) {
          after = richOptions.afterContent;
        } else {
          const textarea = document.activeElement as HTMLTextAreaElement;
          if (!textarea) return;
          const plainPos = mapMarkdownOffsetToPlain(textarea.value, textarea.selectionStart);
          const [before, splitAfter] = splitRichTextAt(block.content, plainPos);
          updateBlock(blockId, { content: before } as Partial<Block>, true);
          after = splitAfter;
        }

        const newBlock: Block =
          block.type === 'paragraph'
            ? { id: generateId(), type: 'paragraph', content: after }
            : block.type === 'title'
              ? { id: generateId(), type: 'title', content: after }
              : block.type === 'subtitle'
                ? { id: generateId(), type: 'subtitle', content: after }
                : { id: generateId(), type: 'quote', content: after };

        setBlocks((prev) => {
          const newBlocks = [...prev];
          newBlocks.splice(blockIndex + 1, 0, newBlock);
          return newBlocks;
        });

        pendingFocusRef.current = {
          blockId: newBlock.id,
          position: 0,
          plainCaret: !!richOptions,
        };
      }
    },
    [blocks, createBlock, updateBlock, saveSnapshot]
  );

  const handleBlockBackspace = useCallback(
    (blockId: string, isEmpty: boolean, atStart: boolean = false, plainCaret = false) => {
      const blockIndex = blocks.findIndex((b) => b.id === blockId);
      if (blockIndex === -1) return;

      const currentBlock = blocks[blockIndex];

      // Если блок пустой
      if (isEmpty) {
        // Не удаляем, если это единственный paragraph
        if (blocks.length === 1 && currentBlock.type === 'paragraph') {
          return;
        }

        // Хотим как ВК: удалили пустой блок -> каретка в конец предыдущего (если есть)
        const prev = blockIndex > 0 ? blocks[blockIndex - 1] : null;
        const next = blockIndex < blocks.length - 1 ? blocks[blockIndex + 1] : null;

        // Выбираем цель: сначала prev, если нет — next, если нет — пусть deleteBlock сам создаст paragraph
        const target = prev ?? next;

        if (
          target &&
          (target.type === 'paragraph' ||
            target.type === 'title' ||
            target.type === 'subtitle' ||
            target.type === 'quote')
        ) {
          deleteBlock(blockId, { blockId: target.id, position: 'end' });
        } else {
          deleteBlock(blockId); // fallback на авто-логику
        }
        return;
      }

      // Если курсор в начале блока и есть предыдущий блок
      if (atStart && blockIndex > 0) {
        const prevBlock = blocks[blockIndex - 1];

        // Сливаем только совместимые текстовые блоки
        if (
          (currentBlock.type === 'paragraph' ||
            currentBlock.type === 'title' ||
            currentBlock.type === 'subtitle' ||
            currentBlock.type === 'quote') &&
          (prevBlock.type === 'paragraph' ||
            prevBlock.type === 'title' ||
            prevBlock.type === 'subtitle' ||
            prevBlock.type === 'quote')
        ) {
          const merged = normalizeRichText([...prevBlock.content, ...currentBlock.content]);
          const mergeCaret = plainCaret
            ? richTextToPlainText(prevBlock.content).length
            : richTextToMarkdown(prevBlock.content).length;

          updateBlock(prevBlock.id, { content: merged } as Partial<Block>);

          deleteBlock(blockId, {
            blockId: prevBlock.id,
            position: mergeCaret,
            plainCaret,
          });
        }
      }
    },
    [blocks, deleteBlock, updateBlock]
  );

  const handleRichBlockEnter = useCallback(
    (blockId: string, detail: RichEnterDetail) => {
      if (detail.atEnd) {
        handleBlockEnter(blockId, true, { plainOffset: detail.offset });
      } else {
        handleBlockEnter(blockId, false, {
          afterContent: detail.after,
          plainOffset: detail.offset,
        });
      }
    },
    [handleBlockEnter]
  );

  const focusEditorBlock = useCallback((blockId: string, position: PendingFocus['position']) => {
    setFocusBlockId(blockId);
    requestAnimationFrame(() => {
      restoreEditorCaret(blockId, position, true);
    });
  }, []);

  const insertParagraphBelowArticleTitle = useCallback(() => {
    const first = blocks[0];

    if (first?.type === 'paragraph') {
      focusEditorBlock(first.id, 'start');
      return;
    }

    saveSnapshot();
    const newBlock = createBlock('paragraph');
    setBlocks((prev) => {
      const next = [...prev];
      next.splice(0, 0, newBlock);
      return next;
    });
    setVkInserter({ afterBlockId: newBlock.id });
    pendingFocusRef.current = {
      blockId: newBlock.id,
      position: 'start',
      plainCaret: true,
    };
  }, [blocks, createBlock, focusEditorBlock, saveSnapshot]);

  const handleArticleTitleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter' || event.shiftKey) return;

      const input = event.currentTarget;
      const cursorAtEnd =
        input.selectionStart === input.selectionEnd && input.selectionStart === input.value.length;
      if (!cursorAtEnd) return;

      event.preventDefault();
      insertParagraphBelowArticleTitle();
    },
    [insertParagraphBelowArticleTitle]
  );

  const handleRichBlockBackspace = useCallback(
    (blockId: string, detail: RichBackspaceDetail) => {
      handleBlockBackspace(blockId, detail.isEmpty, detail.atStart, true);
    },
    [handleBlockBackspace]
  );

  const handleRichPasteMultiline = useCallback(
    (blockId: string, detail: RichPasteMultilineDetail) => {
      const blockIndex = blocks.findIndex((b) => b.id === blockId);
      if (blockIndex === -1) return;
      const block = blocks[blockIndex];
      if (
        block.type !== 'paragraph' &&
        block.type !== 'title' &&
        block.type !== 'subtitle' &&
        block.type !== 'quote'
      ) {
        return;
      }

      saveSnapshot();

      const trailingId = generateId();
      const inserted: Block[] = [
        ...detail.middleBlocks.map(
          (content): Block => ({
            id: generateId(),
            type: 'paragraph',
            content,
          })
        ),
        { id: trailingId, type: 'paragraph', content: detail.trailingContent },
      ];

      setBlocks((prev) => {
        const next = [...prev];
        const idx = next.findIndex((b) => b.id === blockId);
        if (idx === -1) return prev;
        next[idx] = { ...next[idx], content: detail.leadingContent } as Block;
        next.splice(idx + 1, 0, ...inserted);
        return next;
      });

      pendingFocusRef.current = {
        blockId: trailingId,
        position: detail.focusOffset,
        plainCaret: true,
      };
    },
    [blocks, saveSnapshot]
  );

  const handleListConvertToParagraph = useCallback(
    (blockId: string, content: RichText) => {
      saveSnapshot();
      updateBlock(blockId, { type: 'paragraph', content } as Partial<Block>, true);
      pendingFocusRef.current = { blockId, position: 'start', plainCaret: true };
    },
    [saveSnapshot, updateBlock]
  );

  const handleListInsertParagraphAfter = useCallback(
    (blockId: string) => {
      saveSnapshot();
      const blockIndex = blocks.findIndex((b) => b.id === blockId);
      if (blockIndex === -1) return;

      const newBlock = createBlock('paragraph');
      setBlocks((prev) => {
        const next = [...prev];
        next.splice(blockIndex + 1, 0, newBlock);
        return next;
      });
      pendingFocusRef.current = { blockId: newBlock.id, position: 'start', plainCaret: true };
    },
    [blocks, createBlock, saveSnapshot]
  );

  // Drag-and-drop handlers
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        // Сохраняем снимок перед перетаскиванием
        saveSnapshot();

        setBlocks((items) => {
          const oldIndex = items.findIndex((item) => item.id === active.id);
          const newIndex = items.findIndex((item) => item.id === over.id);

          const newBlocks = arrayMove(items, oldIndex, newIndex);
          return newBlocks;
        });

        // Фокус на перетащенный блок
        setTimeout(() => {
          setFocusBlockId(active.id as string);
        }, 0);
      }
    },
    [saveSnapshot]
  );

  // Дублирование блока
  const duplicateBlock = useCallback(
    (blockId: string) => {
      // Сохраняем снимок перед дублированием
      saveSnapshot();

      const blockIndex = blocks.findIndex((b) => b.id === blockId);
      if (blockIndex === -1) return;

      const block = blocks[blockIndex];
      // Глубокая копия, чтобы дубликат не делил вложенные content/items с оригиналом.
      const duplicatedBlock: Block = JSON.parse(JSON.stringify({ ...block, id: generateId() }));

      setBlocks((prev) => {
        const newBlocks = [...prev];
        newBlocks.splice(blockIndex + 1, 0, duplicatedBlock);
        return newBlocks;
      });

      setTimeout(() => {
        setFocusBlockId(duplicatedBlock.id);
      }, 0);
    },
    [blocks, saveSnapshot]
  );

  // Перемещение блока вверх/вниз
  const moveBlockUp = useCallback(
    (blockId: string) => {
      // Сохраняем снимок перед перемещением
      saveSnapshot();

      const blockIndex = blocks.findIndex((b) => b.id === blockId);
      if (blockIndex <= 0) return;

      setBlocks((prev) => {
        const newBlocks = [...prev];
        [newBlocks[blockIndex - 1], newBlocks[blockIndex]] = [
          newBlocks[blockIndex],
          newBlocks[blockIndex - 1],
        ];
        return newBlocks;
      });
    },
    [blocks, saveSnapshot]
  );

  const moveBlockDown = useCallback(
    (blockId: string) => {
      // Сохраняем снимок перед перемещением
      saveSnapshot();

      const blockIndex = blocks.findIndex((b) => b.id === blockId);
      if (blockIndex === -1 || blockIndex >= blocks.length - 1) return;

      setBlocks((prev) => {
        const newBlocks = [...prev];
        [newBlocks[blockIndex], newBlocks[blockIndex + 1]] = [
          newBlocks[blockIndex + 1],
          newBlocks[blockIndex],
        ];
        return newBlocks;
      });
    },
    [blocks, saveSnapshot]
  );

  // Вставка блока после указанного
  const insertBlockAfter = useCallback(
    (blockId: string, type: string) => {
      const blockIndex = blocks.findIndex((b) => b.id === blockId);
      if (blockIndex === -1) return;

      insertBlock(blockIndex + 1, type as BlockType);
    },
    [blocks, insertBlock]
  );

  const focusNewParagraphAfter = useCallback((paragraphBlockId: string) => {
    setVkInserter({ afterBlockId: paragraphBlockId });
    pendingFocusRef.current = {
      blockId: paragraphBlockId,
      position: 'start',
      plainCaret: true,
    };
  }, []);

  // Преобразование типа блока (для VK-плюса)
  const convertBlockType = useCallback(
    (blockId: string, newType: BlockType) => {
      const block = blocks.find((b) => b.id === blockId);
      if (!block) return;

      // Сохраняем снимок перед преобразованием
      saveSnapshot();

      // Создаем новый блок нужного типа, но сохраняем ID текущего блока
      let newBlock: Block;
      switch (newType) {
        case 'paragraph':
          newBlock = { id: blockId, type: 'paragraph', content: emptyRichText() };
          break;
        case 'title':
          newBlock = { id: blockId, type: 'title', content: emptyRichText() };
          break;
        case 'subtitle':
          newBlock = { id: blockId, type: 'subtitle', content: emptyRichText() };
          break;
        case 'quote':
          newBlock = { id: blockId, type: 'quote', content: emptyRichText() };
          break;
        case 'list':
          newBlock = { id: blockId, type: 'list', items: [createListItem('')] };
          break;
        case 'divider':
          newBlock = { id: blockId, type: 'divider' };
          break;
        case 'image':
          newBlock = { id: blockId, type: 'image', imageKey: '' };
          break;
        case 'carousel':
          newBlock = { id: blockId, type: 'carousel', images: [] };
          break;
      }

      // Для текстовых блоков сохраняем текст из текущего блока, если он есть
      if (
        (block.type === 'paragraph' ||
          block.type === 'title' ||
          block.type === 'subtitle' ||
          block.type === 'quote') &&
        (newBlock.type === 'paragraph' ||
          newBlock.type === 'title' ||
          newBlock.type === 'subtitle' ||
          newBlock.type === 'quote')
      ) {
        newBlock.content = cloneRichText(block.content);
      }

      const blockIndex = blocks.findIndex((b) => b.id === blockId);
      const paragraphAfterDivider = newBlock.type === 'divider' ? createBlock('paragraph') : null;

      setBlocks((prev) => {
        const newBlocks = [...prev];
        newBlocks[blockIndex] = newBlock;
        if (paragraphAfterDivider) {
          newBlocks.splice(blockIndex + 1, 0, paragraphAfterDivider);
        }
        return newBlocks;
      });

      if (paragraphAfterDivider) {
        focusNewParagraphAfter(paragraphAfterDivider.id);
        return;
      }

      // Фокус остается на том же блоке
      setTimeout(() => {
        setFocusBlockId(blockId);
        // Устанавливаем фокус на textarea, если это текстовый блок
        if (
          newBlock.type === 'paragraph' ||
          newBlock.type === 'title' ||
          newBlock.type === 'subtitle' ||
          newBlock.type === 'quote'
        ) {
          const textarea = document.querySelector(
            `[data-block-id="${blockId}"] textarea`
          ) as HTMLTextAreaElement;
          if (textarea) {
            textarea.focus();
          }
        } else if (newBlock.type === 'list') {
          // Для списка устанавливаем фокус на первый input
          const firstInput = document.querySelector(
            `[data-block-id="${blockId}"] input[type="text"]`
          ) as HTMLInputElement;
          if (firstInput) {
            firstInput.focus();
          }
        }
      }, 0);
    },
    [blocks, createBlock, focusNewParagraphAfter, saveSnapshot]
  );

  // Обработчик slash-меню
  const handleSlash = useCallback(
    (blockId: string, position: { top: number; left: number }, cursorPos: number) => {
      setSlashMenu({ blockId, position, cursorPos });
      setSlashMenuSelectedIndex(0);
    },
    []
  );

  // Навигация в slash-меню
  useEffect(() => {
    if (!slashMenu) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashMenuSelectedIndex((prev) => Math.min(prev + 1, 7));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashMenuSelectedIndex((prev) => Math.max(prev - 1, 0));
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [slashMenu]);

  // Обработчик выбора из slash-меню
  const handleSlashSelect = useCallback(
    (type: string) => {
      if (!slashMenu) return;

      const block = blocks.find((b) => b.id === slashMenu.blockId);
      if (
        !block ||
        (block.type !== 'paragraph' &&
          block.type !== 'title' &&
          block.type !== 'subtitle' &&
          block.type !== 'quote')
      ) {
        setSlashMenu(null);
        return;
      }

      // Удаляем "/" из markdown-буфера (cursorPos — offset по markdown textarea),
      // затем пересобираем каноническую RichText.
      const textarea = document.querySelector(
        `[data-block-id="${slashMenu.blockId}"] textarea`
      ) as HTMLTextAreaElement | null;
      const md = textarea?.value ?? richTextToMarkdown(block.content);
      const newMd = md.slice(0, slashMenu.cursorPos - 1) + md.slice(slashMenu.cursorPos);
      const newContent = markdownToRichText(newMd);

      // Преобразуем текущий блок в выбранный тип
      if (type === block.type) {
        // Если тип совпадает, просто удаляем "/"
        updateBlock(slashMenu.blockId, { content: newContent } as Partial<Block>);
      } else {
        // Преобразуем блок в новый тип
        const newBlock = createBlock(type as BlockType);
        if (
          newBlock.type === 'paragraph' ||
          newBlock.type === 'title' ||
          newBlock.type === 'subtitle' ||
          newBlock.type === 'quote'
        ) {
          newBlock.content = newContent;
        }

        saveSnapshot();

        const blockIndex = blocks.findIndex((b) => b.id === slashMenu.blockId);
        const paragraphAfterDivider = newBlock.type === 'divider' ? createBlock('paragraph') : null;

        setBlocks((prev) => {
          const newBlocks = [...prev];
          newBlocks[blockIndex] = newBlock;
          if (paragraphAfterDivider) {
            newBlocks.splice(blockIndex + 1, 0, paragraphAfterDivider);
          }
          return newBlocks;
        });

        if (paragraphAfterDivider) {
          focusNewParagraphAfter(paragraphAfterDivider.id);
        } else {
          setTimeout(() => {
            setFocusBlockId(newBlock.id);
          }, 0);
        }

        if (newBlock.type === 'image') {
          requestImageUpload(newBlock.id);
        }
      }

      setSlashMenu(null);
    },
    [
      slashMenu,
      blocks,
      updateBlock,
      createBlock,
      focusNewParagraphAfter,
      requestImageUpload,
      saveSnapshot,
    ]
  );

  // Обработчик paste
  const handlePaste = useCallback(
    async (blockId: string, text: string, files: File[]) => {
      const block = blocks.find((b) => b.id === blockId);
      if (!block) return;

      const blockIndex = blocks.findIndex((b) => b.id === blockId);

      // Если есть изображения, создаем Image-блоки для каждого
      if (files.length > 0) {
        const { uploadFile } = await import('@shared/api/storage');

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const fileExtension = file.name.split('.').pop() || 'jpg';
          const baseFileName = file.name.replace(/\.[^/.]+$/, '');
          const rawFileName = `article_${uniqueUploadFileSuffix()}_${baseFileName}.${fileExtension}`;
          const imageKey = sanitizeFileName(rawFileName);

          const url = await uploadFile({
            file,
            category: 'articles',
            fileName: rawFileName,
          });

          if (url) {
            const newBlock: Block = {
              id: generateId(),
              type: 'image',
              imageKey,
            };

            setBlocks((prev) => {
              const newBlocks = [...prev];
              newBlocks.splice(blockIndex + 1 + i, 0, newBlock);
              return newBlocks;
            });
          }
        }

        // Если был текст вместе с изображениями, вставляем его в текущий блок
        if (
          text.trim() &&
          (block.type === 'paragraph' ||
            block.type === 'title' ||
            block.type === 'subtitle' ||
            block.type === 'quote')
        ) {
          const textarea = document.activeElement as HTMLTextAreaElement;
          if (textarea) {
            const md = textarea.value;
            const newMd =
              md.slice(0, textarea.selectionStart) + text + md.slice(textarea.selectionEnd);
            updateBlock(blockId, { content: markdownToRichText(newMd) } as Partial<Block>);
          }
        }
      } else if (text) {
        // Многострочный текст - проверяем, нужно ли преобразовать в список
        const lines = text.split('\n').filter((line) => line.trim());
        if (lines.length > 2) {
          // Создаем list-блок
          const newBlock: Block = {
            id: generateId(),
            type: 'list',
            items: lines.map((line) => createListItem(line.trim())),
          };

          setBlocks((prev) => {
            const newBlocks = [...prev];
            newBlocks.splice(blockIndex + 1, 0, newBlock);
            return newBlocks;
          });

          setTimeout(() => {
            setFocusBlockId(newBlock.id);
          }, 0);
        } else {
          // Обычный текст - вставляем в текущий блок
          if (
            block.type === 'paragraph' ||
            block.type === 'title' ||
            block.type === 'subtitle' ||
            block.type === 'quote'
          ) {
            const textarea = document.activeElement as HTMLTextAreaElement;
            if (textarea) {
              const md = textarea.value;
              const cursorPos = textarea.selectionStart;
              const newMd = md.slice(0, cursorPos) + text + md.slice(textarea.selectionEnd);
              updateBlock(blockId, { content: markdownToRichText(newMd) } as Partial<Block>);

              // Устанавливаем курсор после вставленного текста (markdown-offset)
              setTimeout(() => {
                textarea.focus();
                const newCursorPos = cursorPos + text.length;
                textarea.setSelectionRange(newCursorPos, newCursorPos);
              }, 0);
            }
          }
        }
      }
    },
    [blocks, updateBlock]
  );

  // Обработчик форматирования (rich-native; textarea — только ?editor=debug)
  const handleFormat = useCallback(
    (blockId: string, type: FormatType, url?: string) => {
      const block = blocks.find((b) => b.id === blockId);
      if (
        !block ||
        (block.type !== 'paragraph' &&
          block.type !== 'title' &&
          block.type !== 'subtitle' &&
          block.type !== 'quote')
      ) {
        return;
      }

      if (type === 'heading-large' || type === 'heading-small' || type === 'quote') {
        const targetType: BlockType =
          type === 'heading-large' ? 'title' : type === 'heading-small' ? 'subtitle' : 'quote';
        const nextType: BlockType = block.type === targetType ? 'paragraph' : targetType;

        const rich = document.querySelector(
          `[data-block-id="${blockId}"][data-testid="rich-text-block-editor-rich"]`
        ) as HTMLElement | null;
        const selection = rich ? getSelectionOffsets(rich) : null;

        convertBlockType(blockId, nextType);

        if (selection && selection.from !== selection.to) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const nextRich = document.querySelector(
                `[data-block-id="${blockId}"][data-testid="rich-text-block-editor-rich"]`
              ) as HTMLElement | null;
              if (!nextRich) return;
              nextRich.focus({ preventScroll: true });
              restoreSelection(nextRich, selection.from, selection.to);
            });
          });
        }
        return;
      }

      const inlineMarkFor = (formatType: FormatType): InlineMark | null => {
        if (formatType === 'bold') return { type: 'bold' };
        if (formatType === 'italic') return { type: 'italic' };
        if (formatType === 'strikethrough') return { type: 'strike' };
        return null;
      };

      const applyToSelection = (
        content: RichText,
        plainStart: number,
        plainEnd: number
      ): { content: RichText; selFrom: number; selTo: number } => {
        let selPlainStart = plainStart;
        let selPlainEnd = plainEnd;

        if (plainStart === plainEnd) {
          const placeholder = 'текст';
          const withText = insertText(content, plainStart, placeholder);
          selPlainEnd = plainStart + placeholder.length;
          if (type === 'link') {
            return {
              content: setLink(withText, plainStart, selPlainEnd, url ?? 'url'),
              selFrom: selPlainStart,
              selTo: selPlainEnd,
            };
          }
          const mark = inlineMarkFor(type);
          return {
            content: mark ? toggleMark(withText, plainStart, selPlainEnd, mark) : withText,
            selFrom: selPlainStart,
            selTo: selPlainEnd,
          };
        }

        if (type === 'link') {
          return {
            content: setLink(content, plainStart, plainEnd, url ?? 'url'),
            selFrom: selPlainStart,
            selTo: plainEnd,
          };
        }
        const mark = inlineMarkFor(type);
        return {
          content: mark ? toggleMark(content, plainStart, plainEnd, mark) : content,
          selFrom: selPlainStart,
          selTo: plainEnd,
        };
      };

      const rich = document.querySelector(
        `[data-block-id="${blockId}"][data-testid="rich-text-block-editor-rich"]`
      ) as HTMLElement | null;

      if (rich) {
        const selection = getSelectionOffsets(rich);
        if (!selection) return;

        const {
          content: newContent,
          selFrom,
          selTo,
        } = applyToSelection(block.content, selection.from, selection.to);
        updateBlock(blockId, { content: newContent } as Partial<Block>, true);
        requestAnimationFrame(() => {
          rich.focus();
          restoreSelection(rich, selFrom, selTo);
        });
        return;
      }

      if (!isMarkdownEditorEnabled()) return;

      const textarea = document.querySelector(
        `textarea[data-block-id="${blockId}"], [data-block-id="${blockId}"] textarea`
      ) as HTMLTextAreaElement | null;
      if (!textarea) return;

      requestAnimationFrame(() => {
        textarea.focus();

        const md = textarea.value;
        const plainStart = mapMarkdownOffsetToPlain(md, textarea.selectionStart);
        const plainEnd = mapMarkdownOffsetToPlain(md, textarea.selectionEnd);

        const {
          content: newContent,
          selFrom,
          selTo,
        } = applyToSelection(block.content, plainStart, plainEnd);
        updateBlock(blockId, { content: newContent } as Partial<Block>, true);

        const newMd = richTextToMarkdown(newContent);
        const newMdStart = mapPlainOffsetToMarkdown(newMd, selFrom);
        const newMdEnd = mapPlainOffsetToMarkdown(newMd, selTo);
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(newMdStart, newMdEnd);
        }, 0);
      });
    },
    [blocks, updateBlock, convertBlockType]
  );

  // Статус сохранения
  const getStatusText = () => {
    switch (saveStatus) {
      case 'saving':
        return texts.saving;
      case 'saved':
        return texts.saved;
      case 'error':
        return texts.error;
      default:
        return originalIsDraft ? texts.draft : '';
    }
  };

  // Компонент VK-стиля плюса (показывается только после Enter в конце блока)
  return (
    <>
      <Popup
        isActive={isOpen}
        onClose={finalizeArticleModalClose}
        onCancelRequest={() => articleCloseGuard.requestClose()}
        requestCloseRef={popupRequestCloseRef}
        closeBlocked={isArticleSaveBusy || articleCloseGuard.discardDialogOpen}
        autoFocusFirstElement={false}
      >
        <ArticleEditorToast payload={editorToast} onDismiss={() => setEditorToast(null)} />
        {isLoading ? (
          //   {true ? (
          <ArticleEditSkeleton />
        ) : (
          <div className="edit-article-v2">
            <div
              className={`edit-article-v2__container${
                isPublishing || isSavingDraft ? ' edit-article-v2__container--saving' : ''
              }`}
              aria-busy={isArticleSaveBusy}
            >
              {/* Sticky Header */}
              <div className="edit-article-v2__header">
                <div
                  className="edit-article-v2__history"
                  role="group"
                  aria-label={texts.historyActions}
                >
                  <button
                    type="button"
                    className="edit-article-v2__history-btn"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={undo}
                    disabled={!canUndo(historyState) || isArticleSaveBusy}
                    aria-label={texts.undo}
                    title={texts.undo}
                  >
                    <Undo2Icon size={18} strokeWidth={2} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="edit-article-v2__history-btn"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={redo}
                    disabled={!canRedo(historyState) || isArticleSaveBusy}
                    aria-label={texts.redo}
                    title={texts.redo}
                  >
                    <Redo2Icon size={18} strokeWidth={2} aria-hidden />
                  </button>
                </div>
                <div className="edit-article-v2__header-end">
                  <div className="edit-article-v2__status">{getStatusText()}</div>
                  <button
                    type="button"
                    className="edit-article-v2__close"
                    onClick={() => articleCloseGuard.requestClose()}
                    disabled={isArticleSaveBusy}
                    aria-label={texts.close}
                  >
                    <ModalCloseIcon />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="edit-article-v2__content article">
                <div
                  ref={contentColumnRef}
                  className={`edit-article-v2__content-column${
                    isDocumentSelected ? ' edit-article-v2__content-column--all-selected' : ''
                  }`}
                  data-document-selected={isDocumentSelected ? 'true' : undefined}
                >
                  <h1 className="edit-article-v2__article-title">
                    <input
                      type="text"
                      className="edit-article-v2__article-title-input"
                      value={meta.title}
                      onChange={(e) => setMeta((prev) => ({ ...prev, title: e.target.value }))}
                      onKeyDown={handleArticleTitleKeyDown}
                      placeholder={texts.title}
                      aria-label={texts.title}
                    />
                  </h1>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={blocks.map((b) => b.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="edit-article-v2__blocks">
                        {blocks.map((block, index) => (
                          <React.Fragment key={block.id}>
                            <SortableBlock
                              articleOwnerUserId={article.userId ?? undefined}
                              block={block}
                              index={index}
                              isFocused={focusBlockId === block.id}
                              isSelected={selectedBlockId === block.id}
                              onUpdate={updateBlock}
                              onDelete={deleteBlock}
                              onFocus={() => {
                                setFocusBlockId(block.id);
                                // Если блок пустой и vkInserter не установлен, устанавливаем его
                                const isBlockEmpty =
                                  ((block.type === 'paragraph' ||
                                    block.type === 'title' ||
                                    block.type === 'subtitle' ||
                                    block.type === 'quote') &&
                                    isRichTextEmpty(block.content)) ||
                                  (block.type === 'list' && isListBlockEmpty(block.items));
                                if (isBlockEmpty && vkInserter?.afterBlockId !== block.id) {
                                  setVkInserter({ afterBlockId: block.id });
                                }
                              }}
                              onBlur={() => {
                                // Используем setTimeout, чтобы проверить, куда перешел фокус
                                // Если фокус перешел на плюс или внутри того же блока, не скрываем плюс
                                setTimeout(() => {
                                  const activeElement = document.activeElement;

                                  // Проверяем, находится ли фокус на плюсе или открытом меню (portal)
                                  const isClickingOnVkPlus =
                                    activeElement?.closest('.edit-article-v2__vk-plus') !== null ||
                                    activeElement?.closest('.edit-article-v2__vk-plus-menu') !==
                                      null ||
                                    document.querySelector('.edit-article-v2__vk-plus-menu') !==
                                      null;

                                  // Проверяем, находится ли фокус на textarea этого блока
                                  const blockTextarea = document.querySelector(
                                    `[data-block-id="${block.id}"] textarea`
                                  ) as HTMLTextAreaElement;
                                  const isFocusOnBlockTextarea = activeElement === blockTextarea;

                                  const blockRichEditor = document.querySelector(
                                    `[data-block-id="${block.id}"][data-testid="rich-text-block-editor-rich"]`
                                  );
                                  const isFocusOnBlockRichEditor =
                                    activeElement === blockRichEditor;

                                  // Проверяем, находится ли активный элемент в том же блоке
                                  const blockElement = activeElement?.closest(
                                    `.edit-article-v2__block-wrapper[data-block-id="${block.id}"]`
                                  );
                                  const isFocusInSameBlock = blockElement !== null;

                                  // Проверяем, не перешел ли фокус на другой блок редактора
                                  const isFocusOnAnotherBlock =
                                    activeElement?.tagName === 'TEXTAREA' &&
                                    activeElement?.getAttribute('data-block-id') !== null &&
                                    activeElement?.getAttribute('data-block-id') !== block.id;

                                  // Если фокус не на плюсе, не на textarea этого блока, не в том же блоке
                                  // и не перешел на другой блок редактора, скрываем плюс
                                  if (
                                    !isClickingOnVkPlus &&
                                    !isFocusOnBlockTextarea &&
                                    !isFocusOnBlockRichEditor &&
                                    !isFocusInSameBlock &&
                                    !isFocusOnAnotherBlock
                                  ) {
                                    setFocusBlockId(null);
                                    // Скрываем плюс при потере фокуса, если блок не пустой
                                    if (vkInserter?.afterBlockId === block.id) {
                                      const isBlockEmpty =
                                        (block.type === 'paragraph' ||
                                          block.type === 'title' ||
                                          block.type === 'subtitle' ||
                                          block.type === 'quote') &&
                                        isRichTextEmpty(block.content);
                                      const isListEmpty =
                                        block.type === 'list' && isListBlockEmpty(block.items);
                                      if (!isBlockEmpty && !isListEmpty) {
                                        setVkInserter(null);
                                      }
                                    }
                                  }
                                }, 0);
                              }}
                              onSelect={setSelectedBlockId}
                              onEnter={handleBlockEnter}
                              onBackspace={(isEmpty: boolean, atStart?: boolean) =>
                                handleBlockBackspace(block.id, isEmpty, atStart ?? false)
                              }
                              onInsertAfter={insertBlockAfter}
                              onDuplicate={duplicateBlock}
                              onMoveUp={moveBlockUp}
                              onMoveDown={moveBlockDown}
                              onSlash={handleSlash}
                              onFormat={handleFormat}
                              onPaste={handlePaste}
                              onRichEnter={handleRichBlockEnter}
                              onRichBackspace={handleRichBlockBackspace}
                              onRichPasteMultiline={handleRichPasteMultiline}
                              onListConvertToParagraph={handleListConvertToParagraph}
                              onListInsertParagraphAfter={handleListInsertParagraphAfter}
                              onConvertToCarousel={convertImageToCarousel}
                              onVkPlusSelect={(type) => {
                                convertBlockType(block.id, type as BlockType);
                                if (type === 'image') {
                                  requestImageUpload(block.id);
                                }
                                setVkInserter(null);
                              }}
                              onVkPlusClose={() => setVkInserter(null)}
                              onEditCarousel={(blockId) => {
                                const carouselBlock = blocks.find((b) => b.id === blockId);
                                if (carouselBlock && carouselBlock.type === 'carousel') {
                                  setCarouselEditModal({
                                    blockId: carouselBlock.id,
                                    images: carouselBlock.images,
                                  });
                                }
                              }}
                              autoFocusCaret={autofocusParagraphBlockId === block.id}
                              onAutoFocusCaret={() => setAutofocusParagraphBlockId(null)}
                            />
                          </React.Fragment>
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>

                  {/* Slash menu */}
                  {slashMenu && (
                    <SlashMenu
                      position={slashMenu!.position}
                      onSelect={handleSlashSelect}
                      onClose={() => setSlashMenu(null)}
                      selectedIndex={slashMenuSelectedIndex}
                    />
                  )}
                </div>
              </div>

              {/* Footer с кнопками - показывается только при наличии изменений */}
              {hasChanges && (
                <div className="edit-article-v2__footer">
                  <button
                    type="button"
                    className="edit-article-v2__button edit-article-v2__button--cancel"
                    onClick={handleCancel}
                    disabled={isArticleSaveBusy}
                  >
                    {texts.cancel}
                  </button>
                  <button
                    type="button"
                    className={`edit-article-v2__button edit-article-v2__button--draft${
                      isSavingDraft ? ' edit-article-v2__button--publish-loading' : ''
                    }`}
                    onClick={handleSaveDraft}
                    disabled={isPublishing || saveStatus === 'saving' || isSavingDraft}
                  >
                    {isSavingDraft ? (
                      <>
                        <DashboardSaveSpinner />
                        {texts.savingDraftProgress}
                      </>
                    ) : (
                      texts.savingDraft
                    )}
                  </button>
                  <button
                    type="button"
                    className={`edit-article-v2__button edit-article-v2__button--publish${
                      isPublishing ? ' edit-article-v2__button--publish-loading' : ''
                    }`}
                    onClick={handlePublish}
                    disabled={isPublishing || saveStatus === 'saving' || isSavingDraft}
                  >
                    {isPublishing ? (
                      <>
                        <DashboardSaveSpinner />
                        {texts.publishing}
                      </>
                    ) : (
                      texts.publish
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Модал редактирования карусели */}
            {carouselEditModal && (
              <CarouselEditModal
                mediaOwnerUserId={article.userId ?? undefined}
                blockId={carouselEditModal!.blockId}
                initialImageKeys={carouselEditModal!.images.map((item) => item.imageKey)}
                onSave={(imageKeys) => {
                  const { blockId, images: previousImages } = carouselEditModal!;
                  const targetBlock = blocks.find((b) => b.id === blockId);
                  if (!targetBlock) {
                    setCarouselEditModal(null);
                    return;
                  }

                  saveSnapshot();
                  const savedBlock = blockFromCarouselSave(
                    blockId,
                    mergeCarouselImageKeys(previousImages, imageKeys)
                  );
                  setBlocks((prev) =>
                    prev.map((block) => (block.id === blockId ? savedBlock : block))
                  );
                  setCarouselEditModal(null);
                }}
                onCancel={() => setCarouselEditModal(null)}
              />
            )}
          </div>
        )}
        <InlineEditDiscardDialog
          open={articleCloseGuard.discardDialogOpen}
          labels={getCloseDiscardConfirmLabels(ui ?? undefined)}
          titleId={articleCloseGuard.discardTitleDomId}
          onStay={articleCloseGuard.dismissDiscardDialog}
          onDiscard={articleCloseGuard.finalizeCloseWithoutSaving}
        />
        <input
          ref={imageUploadInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleImageUploadFile}
        />
      </Popup>
    </>
  );
}
