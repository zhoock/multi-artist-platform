// Using interfaces with extends can often be more performant for the compiler
// than type aliases with intersections

import type { Track } from '@entities/track/model/types';
import type { SupportedLang } from '@shared/model/lang';
import type { TrackVisibility } from '@shared/lib/tracks/trackVisibility';

export interface NavigationProps {
  /**  Открывает/закрывает Popup */
  onToggle?: (e: React.MouseEvent<HTMLElement>) => void;
}

export interface HamburgerProps extends NavigationProps {
  /** Отвечает за состояние Popup (открыт/закрыт) */
  isActive: boolean;
  /**
   * `floating` — фиксация поверх страницы (плеер, модальные диалоги).
   * `inline` — как обычный элемент в строке шапки (мобильное меню).
   */
  variant?: 'floating' | 'inline';
  /** CSS свойство */
  zIndex?: string;
  bgColor?: string;
  onClose?: () => void; // Новый пропс
  className?: string;
  /**
   * Инлайн-гамбургер в шапке: при открытом `dialog.showModal()` шапка оказывается под top layer —
   * включают «призрак-кнопку» (слот занят, но клики и экран недоступны); рабочая кнопка дублируется внутри `<dialog>`.
   */
  behindDialogOverlap?: boolean;
}

export interface PopupProps extends HamburgerProps {
  children: React.ReactNode;
  'aria-labelledby'?: string;
  /** Блокирует закрытие по Escape (событие cancel у нативного dialog). */
  closeBlocked?: boolean;
  /** Shared public-site modal backdrop (`--public-modal-backdrop-*`). */
  publicBackdrop?: boolean;
  /** При открытии dialog фокусировать первый интерактивный элемент (по умолчанию true). */
  autoFocusFirstElement?: boolean;
}

/**
 * Albums
 */

/** Переводимые поля альбома (`translations.ru` / `translations.en`). Название альбома — только на корне `IAlbums.album`. */
export interface IAlbumTranslationsLocale {
  /** @deprecated Старые ответы API; не записывать. */
  album?: string;
  fullName: string;
  description: string;
  details: detailsProps[];
  /** Кредиты обложки — только для этой локали (не в общем `release`). */
  photographer?: string;
  photographerURL?: string;
  designer?: string;
  designerURL?: string;
}

export type IAlbumTranslations = Partial<Record<SupportedLang, IAlbumTranslationsLocale>>;

export interface IAlbums {
  userId?: string;
  /** Первичный ключ `albums.id` (UUID), если пришёл из API — для ЮKassa и create-payment. */
  dbAlbumId?: string;
  /** Идентификатор альбома */
  albumId?: string;
  /**
   * Устарело: не записывается при создании/обновлении альбома. Имя для UI — `users.site_name`.
   * Поле может приходить из БД для старых записей.
   */
  artist: string;
  /**
   * Название альбома — одно на альбом (все языки). Запись на корне API/БД, не в translations.
   */
  album: string;
  /** Полное имя для отображения; запись — в `translations[lang].fullName`. */
  fullName: string;
  /** Описание; запись — в `translations[lang].description`. */
  description: string;
  /** Обложка альбома (имя файла без расширения и суффикса размера) */
  cover?: string;

  /** Альбом опубликован (одноразовое действие; синхронизируется по всем lang в БД). */
  isPublished?: boolean;

  /** Видимость на странице артиста после публикации (синхронизируется по всем lang в БД). */
  isPublic?: boolean;

  /** Есть неопубликованные правки после публикации (как у статей). */
  hasDraftChanges?: boolean;

  /** Релиз альбома (единый JSON на альбом: дата, UPC, продажи, `genreCodes`, `tags` и т.д.) */
  release: Record<string, unknown>;
  /** URL музыкальных агрегаторов */
  buttons: {
    [key: string]: string;
  };
  /** Дополнительная информация; каноническая запись блоков — в `translations[lang].details`. */
  details: detailsProps[];
  /**
   * Переводы альбома. Создание/обновление через API — только в `translations[lang]`.
   * Плоские поля на корне — ответ БД и временный fallback для старых данных.
   */
  translations?: IAlbumTranslations;
  /** Треки */
  tracks: TracksProps[];
}

export interface WrapperAlbumCoverProps {
  /** Идентификатор альбома */
  albumId?: string;
  /** Название группы и название альбома */
  album: string;
  children: React.ReactElement;
  /** Год релиза альбома */
  date: string;
}

export interface detailsProps {
  id: number;
  title: string;
  content: Array<
    | string
    | { id?: string; text: string | string[]; link?: string }
    | {
        id?: string;
        dateFrom?: string;
        dateTo?: string;
        studioText?: string;
        city?: string;
        url?: string | null;
      }
  >;
}

/**
 * Интерфейс для синхронизированной строки текста с тайм-кодами.
 * Используется для karaoke-style отображения текста песни.
 */
export interface SyncedLyricsLine {
  /** Текст строки (или слова, если синхронизация по словам) */
  text: string;
  /** Время начала строки в секундах */
  startTime: number;
  /** Время окончания строки в секундах (опционально) */
  endTime?: number;
}

/** Переводимые поля трека внутри альбома (текст песни и синхронизация — на корне трека). */
export interface IAlbumTrackTranslationsLocale {
  title: string;
  /** @deprecated legacy; текст единый в `track.content` */
  content?: string;
  authorship?: string;
  /** @deprecated legacy; синхронизация в `track.syncedLyrics` */
  syncedLyrics?: SyncedLyricsLine[];
}

export type IAlbumTrackTranslations = Partial<Record<SupportedLang, IAlbumTrackTranslationsLocale>>;

/** Трек в составе альбома: базовые поля сущности `Track` плюс тексты и метаданные воспроизведения. */
export interface TracksProps extends Track {
  /** Единый текст песни (не зависит от языка UI). */
  content: string;
  /** Синхронизированный текст с тайм-кодами (для karaoke-style отображения) */
  syncedLyrics?: SyncedLyricsLine[];
  /** Текст авторства (автоматически добавляется в конец синхронизированных текстов) */
  authorship?: string;
  /** Длительность трека в секундах */
  duration: number;
  /** Переводы названия и текстов трека (`translations.ru` / `translations.en`). */
  translations?: IAlbumTrackTranslations;
  /** Уровень доступа на сайте (после сохранения в БД и в ответах GET). */
  visibility?: 'public' | 'subscribers_only' | 'hidden';
  /** Плеер не должен играть трек без покупки (публичный API). */
  playbackLocked?: boolean;
}

export interface CoverProps {
  img: string;
  userId?: string;
  fullName: string;
  size?: number;
  densities?: Array<1 | 2 | 3>;
  sizes?: string;
}

export interface String {
  [key: string]: string;
}

/** Переводимые поля статьи (`translations.ru` / `translations.en`). */
export interface IArticleTranslationsLocale {
  nameArticle: string;
  description: string;
  details: ArticledetailsProps[];
}

export type IArticleTranslations = Partial<Record<SupportedLang, IArticleTranslationsLocale>>;

export type IArticles = {
  id?: string; // UUID из БД (опционально для обратной совместимости)
  userId?: string;
  articleId: string; // строковый идентификатор (article_id)
  /** Заголовок для UI; каноническая запись — в `translations[lang].nameArticle`. */
  nameArticle: string;
  img: string;
  date: string;
  details: ArticledetailsProps[];
  description: string;
  isDraft?: boolean; // Статус черновика (опционально для обратной совместимости)
  /** У опубликованной статьи есть несохранённые в live-версию правки. */
  hasDraftChanges?: boolean;
  /** Доступ к статье на сайте (как у треков). */
  visibility?: TrackVisibility;
  /** Публичный API: контент скрыт до покупки альбома артиста (как playbackLocked у треков). */
  articleLocked?: boolean;
  /**
   * Переводы статьи. Создание/обновление через API — только в `translations[lang]`.
   * Плоские поля на корне — ответ БД и временный fallback для старых данных.
   */
  translations?: IArticleTranslations;
  /** Внутренняя метка для merge по свежести строки (ответ API). */
  updatedAt?: string;
  /** Язык строки в одноязычном ответе (POST и т.д.). */
  lang?: string;
};

export interface CarouselImageItem {
  imageKey: string;
  caption?: string;
}

export interface ArticledetailsProps {
  id?: number; // опционально, может отсутствовать в новой структуре
  /** Stable editor block id for list/reorder/delete sync within article details. */
  blockId?: string;
  /** Block type for round-trip between editor blocks and persisted details rows. */
  blockKind?:
    | 'paragraph'
    | 'title'
    | 'subtitle'
    | 'quote'
    | 'list'
    | 'divider'
    | 'image'
    | 'carousel';
  userId?: string;
  type?: 'text' | 'image' | 'carousel'; // тип блока
  title?: string;
  img?: string; // для одиночного изображения
  /** Карусель: массив ключей (legacy) или объектов с подписью на каждое фото. */
  images?: string[] | CarouselImageItem[];
  subtitle?: string;
  content?: string | Array<string | { id: string; text: string }>;
  /** Подпись к одиночному изображению; legacy — общая подпись карусели при images: string[]. */
  caption?: string;
  /** @deprecated Используйте caption. Читается только для старых статей. */
  alt?: string;
}

export interface ArticleProps {
  userId?: string;
  articleId: string;
  img: string;
  nameArticle: string;
  date: string;
  visibility?: TrackVisibility;
  articleLocked?: boolean;
}

/** Подписи меню видимости трека в списке треков альбома (кабинет). */
export interface DashboardTrackVisibilityLabels {
  public: { title: string; description: string };
  subscribersOnly: { title: string; description: string };
  hidden: { title: string; description: string };
}

export interface IInterface {
  menu: {
    [key: string]: string;
  };
  buttons: {
    [key: string]: string;
  };
  titles: {
    [key: string]: string;
  };
  links?: {
    [key: string]: string;
  };
  stems?: {
    text: string;
    pageTitle: string;
    notice: string;
  };
  listenerWelcome?: {
    welcomePrefix: string;
    siteName: string;
    subtitle: string;
    featureFollow: string;
    featurePurchase: string;
    featureRead: string;
    featureArchive: string;
    startExploring: string;
    close: string;
  };
  artistOnboarding?: {
    welcomeGreeting: string;
    heroHeadline: string;
    heroHeadlineAccent: string;
    heroSubtext: string;
    primaryCta: string;
    catalogHint: string;
    secondaryHeading: string;
    secondarySubtext: string;
    features: {
      article: { title: string; description: string };
      mixer: { title: string; description: string };
      profile: { title: string; description: string };
    };
  };
  artistPageUnderConstruction?: {
    title: string;
    subtitle: string;
    cta: string;
  };
  /** Кнопка входа/регистрации в шапке; ссылка в кабинет по аватару */
  header?: {
    signIn: string;
    openProfile: string;
    avatarMenu?: {
      settings: string;
      myArtistPage?: string;
      upgradePlan: string;
      premiumActive?: string;
      manageSubscription?: string;
      logOut: string;
    };
  };
  /** Модалка регистрации / входа (публичный сайт) */
  auth?: {
    validation?: {
      requiredEmail: string;
      requiredPassword: string;
      requiredConfirmPassword: string;
      passwordsMismatch: string;
      passwordMinLength: string;
    };
    login?: {
      title: string;
      emailLabel: string;
      passwordLabel: string;
      submit: string;
      submitting: string;
      noAccount: string;
      signUp: string;
      forgotPassword?: string;
    };
    forgotPassword?: {
      title: string;
      body: string;
      emailLabel: string;
      submit: string;
      submitting: string;
      backToLogin: string;
      sentTitle: string;
      sentBody: string;
      sentBackToLogin: string;
      genericError: string;
    };
    resetPassword?: {
      title: string;
      body: string;
      newPasswordLabel: string;
      newPasswordPlaceholder?: string;
      confirmPasswordLabel: string;
      confirmPasswordPlaceholder?: string;
      submit: string;
      submitting: string;
      successTitle: string;
      successBody: string;
      backToLogin: string;
      goToLogin: string;
      showPassword: string;
      hidePassword: string;
      strength: {
        veryWeak: string;
        weak: string;
        fair: string;
        good: string;
        strong: string;
      };
      errors: {
        invalidLink: string;
        expiredLink: string;
        passwordTooShort: string;
        passwordsMismatch: string;
        passwordRequired: string;
        generic: string;
        rateLimited: string;
      };
    };
    register: {
      title: string;
      siteBandNameLabel: string;
      siteBandNamePlaceholder: string;
      siteBandNameRequired: string;
      emailLabel: string;
      passwordLabel: string;
      confirmPasswordLabel: string;
      submit: string;
      submitting: string;
      hasAccount: string;
      signIn: string;
    };
    emailVerification?: {
      verifyTitle: string;
      verifyBody: string;
      sendConfirmationEmail?: string;
      emailWillBeSentTo?: string;
      onboardingBodyAlbums?: string;
      onboardingBodyPosts?: string;
      onboardingBodyMixer?: string;
      onboardingBodyPaymentSettings?: string;
      onboardingBodyContent?: string;
      resendEmail: string;
      changeEmail: string;
      continueLater: string;
      bannerText: string;
      bannerSubtitle: string;
      successTitle: string;
      successBody: string;
      continue: string;
      continueToHome?: string;
      openDashboard?: string;
      openDashboardPrefix?: string;
      openDashboardLink?: string;
      expiredTitle: string;
      expiredBody: string;
      sendNewLink: string;
      backToLogin: string;
      changeEmailTitle: string;
      changeEmailBody: string;
      newEmailLabel: string;
      newEmailPlaceholder: string;
      sendVerificationEmail: string;
      cancel: string;
      back: string;
      restrictedHint: string;
      restrictedPremium?: string;
      restrictedUpload?: string;
      restrictedPaymentSettings?: string;
      restrictedPaymentSettingsHint?: string;
      restrictedMixer?: string;
      restrictedMixerHint?: string;
      emailRequired: string;
      emailInvalid: string;
      resendFailed: string;
      resendCooldown: string;
      resendRateLimited: string;
      verificationSentTitle: string;
      verificationSentBody: string;
      submitting: string;
      close: string;
    };
  };
  errors?: {
    [key: string]: string;
  };
  dashboard?: {
    tabs: {
      albums: string;
      posts: string;
      paymentSettings: string;
      myPurchases?: string;
      mixer?: string;
      archive?: string;
      socialLinks?: string;
    };
    socialLinks?: {
      title: string;
      subtitle: string;
      hint: string;
      platforms: {
        instagram: string;
        facebook: string;
        youtube: string;
        vk: string;
      };
      placeholders: {
        instagram: string;
        facebook: string;
        youtube: string;
        vk: string;
      };
    };
    paymentSettings?: {
      loading: string;
      errorLabel: string;
      connectedStatus: string;
      updatedAt: string;
      connectedLede: string;
      disconnect: string;
      disconnecting: string;
      disconnectNote: string;
      connectButton: string;
      connect: string;
      connecting: string;
      fillAllFields: string;
      connectSuccess: string;
      disconnectSuccess: string;
      disconnectConfirm: string;
      providers: Partial<
        Record<
          'yookassa' | 'stripe' | 'paypal',
          {
            tagline: string;
            description: string;
            details: string;
            instructionsIntro: string;
            instructionSteps: string[];
            registerLink: string;
            shopIdLabel: string;
            shopIdPlaceholder: string;
            shopIdHint: string;
            secretKeyLabel: string;
            secretKeyPlaceholder: string;
            secretKeyHint: string;
          }
        >
      >;
    };
    profile: string;
    profileSettings: string;
    deleteAccount?: string;
    deleteAccountConfirmTitle?: string;
    deleteAccountWarningDescription?: string;
    deleteAccountWarningIntro?: string;
    deleteAccountPasswordPlaceholder?: string;
    deleteAccountPasswordHelper?: string;
    deleteAccountFinalWarning?: string;
    deleteAccountWarningProfile?: string;
    deleteAccountWarningAlbums?: string;
    deleteAccountWarningTracks?: string;
    deleteAccountWarningArticles?: string;
    deleteAccountWarningPurchases?: string;
    deleteAccountWarningArchive?: string;
    deleteAccountWarningPremium?: string;
    deleteAccountPasswordLabel?: string;
    deleteAccountDeleting?: string;
    deleteAccountFailed?: string;
    deleteAccountSuccessToast?: string;
    deleteAccountSuccessToastDescription?: string;
    albumPublishedSuccessToast?: string;
    albumPublishedSuccessToastDescription?: string;
    albumCreatedSuccessToast?: string;
    albumCreatedSuccessToastDescription?: string;
    albumStatusDraft?: string;
    articleStatusDraftChanges?: string;
    albumStatusReadyToPublish?: string;
    albumStatusPublished?: string;
    albumStatusHidden?: string;
    albumStatusHiddenHint?: string;
    albumPublishHintNeedsTracks?: string;
    albumPublishHintNeedsCover?: string;
    albumPublishHintNeedsFields?: string;
    albumPublishHintReady?: string;
    publishAlbumFailed?: string;
    logout: string;
    profileFields: {
      name: string;
      username: string;
      email: string;
      location: string;
      emailVerification?: {
        verified: string;
        notVerified: string;
        notVerifiedHint: string;
      };
    };
    uploadNewAlbum: string;
    uploadNewArticle: string;
    editAlbum: string;
    writeAndPublishArticles: string;
    newPost: string;
    dropTracksHere: string;
    chooseFiles: string;
    /** Прогресс загрузки треков в альбом (перед процентом). */
    uploadingTracks: string;
    lyrics: string;
    track: string;
    duration: string;
    status: string;
    actions: string;
    addedSynced: string;
    addedNoSync: string;
    noLyrics: string;
    edit: string;
    sync: string;
    /** Заголовок модалки синхронизации текста с аудио */
    syncLyricsTitle?: string;
    add: string;
    prev: string;
    addLyrics: string;
    editLyrics: string;
    insertLyricsHere: string;
    cancel: string;
    save: string;
    preview: string;
    previewLyrics: string;
    close: string;
    instrumental: string;
    authorship: string;
    authorshipPlaceholder: string;
    editArticles: string;
    newAlbum: string;
    chooseFile: string;
    articleCover: string;
    replace: string;
    uploaded: string;
    editArticle: string;
    deleteArticle: string;
    errorLoadingArticles: string;
    pleaseSelectImageFile: string;
    failedToUploadCover: string;
    confirmAction: string;
    /** Пояснение в модалке подтверждения удаления и др. необратимых действий */
    confirmActionIrreversible?: string;
    /** Текст кнопки подтверждения для info / warning в модалке подтверждения */
    confirmationModalConfirm?: string;
    /** Текст кнопки подтверждения для необратимого (danger) действия — обычно «Удалить» */
    confirmationModalConfirmDelete?: string;
    /** Закрытие модалки с несохранённым вводом (общий паттерн кабинета) */
    closeDiscardConfirm?: {
      message?: string;
      stay?: string;
      discard?: string;
    };
    error: string;
    success?: string;
    /** Префикс сообщения «загружено N трек(ов)»; слово «трек» подставляется в коде с учётом числа. */
    uploadedTracksSuccessPrefix?: string;
    errorDeletingArticle: string;
    russian: string;
    english: string;
    dragToReorder?: string;
    clickToEdit?: string;
    editTrack?: string;
    trackTitle?: string;
    deleteTrack?: string;
    /** aria-label кнопки меню «доступ к треку» в списке треков альбома */
    trackAccessAriaLabel?: string;
    /** Тексты пунктов меню видимости трека */
    trackVisibility?: DashboardTrackVisibilityLabels;
    /** aria-label кнопки доступа к статье (список в кабинете) */
    articleAccessAriaLabel?: string;
    /** Оверлей обложки статьи в режиме «только подписчики» */
    articleSubscribersOnlyOverlayTitle?: string;
    articleSubscribersOnlyOverlayHint?: string;
    /** Подписи меню видимости статьи (если нет — используются trackVisibility). */
    articleVisibility?: DashboardTrackVisibilityLabels;
    deleteAlbum?: string;
    albumDeletedSuccessToast?: string;
    albumDeletedSuccessToastWithTitle?: string;
    articleDeletedSuccessToast?: string;
    articleDeletedSuccessToastWithTitle?: string;
    errorLoading?: string;
    failedToLoadAlbums?: string;
    selectLanguage?: string;
    changeAvatar?: string;
    /** Кнопка у аватара: «Edit» */
    avatarEdit?: string;
    /** Меню аватара: загрузка */
    uploadAvatarPhoto?: string;
    /** Меню аватара: удаление */
    removeAvatarPhoto?: string;
    /** Файл аватара больше лимита (2 MB) */
    avatarFileTooLarge?: string;
    profileHero?: {
      pagePrivate?: string;
      pagePublic?: string;
      privateDescription?: string;
      publicDescription?: string;
      openArtistPage?: string;
    };
    /** Listener → artist upgrade (profile / settings). */
    becomeArtistLead?: string;
    becomeArtist?: string;
    upgradeToArtist?: {
      title?: string;
      artistBandNameLabel?: string;
      artistBandNamePlaceholder?: string;
      artistBandNameRequired?: string;
      cancel?: string;
      continue?: string;
      continuing?: string;
      close?: string;
      upgradeFailed?: string;
    };
    errorSavingText?: string;
    enterLink: string;
    addImage: string;
    addDivider: string;
    makeLink: string;
    heading1: string;
    heading2: string;
    heading3: string;
    heading4: string;
    paragraph: string;
    bold: string;
    italic: string;
    listItem: string;
    quote: string;
    startTyping: string;
    removeImage: string;
    articleId: string;
    articleTitle: string;
    enterArticleTitle: string;
    description: string;
    publicationDate: string;
    genre: string;
    bandMembers: string;
    sessionMusicians: string;
    producing: string;
    masteredBy: string;
    recordedAt: string;
    mixedAt: string;
    confirmDeleteArticle: string;
    confirmDeleteAlbum: string;
    confirmDeleteTrack: string;
    errorNotAuthorized: string;
    errorArticleIdNotFound: string;
    uploadAndPublishAlbums: string;
    albumsEmptyTitle: string;
    albumsEmptyDescription: string;
    createYourFirstAlbum: string;
    articlesEmptyTitle: string;
    articlesEmptyDescription: string;
    createArticle: string;
    uploading: string;
    dragImageHereOr: string;
    loading?: string;
    saving?: string;
    mixer?: {
      title: string;
      emptyTitle: string;
      emptyDescription: string;
      createAlbum: string;
      noAlbums?: string;
    };
    archive?: {
      title: string;
      subtitle: string;
      slotsUsed: string;
      inArchiveSince: string;
      remove: string;
      removing: string;
      slotAvailable: string;
      slotsAvailablePlural: string;
      emptySlotHint: string;
      discoverArtists: string;
      archiveFull: string;
      cooldownInfo: string;
      cooldownNext: string;
      cooldownDays: string;
      loading: string;
      loadError: string;
      removeError: string;
    };
    myPurchases?: {
      title: string;
      emptyTitle: string;
      emptyDescription: string;
      loadFailed: string;
      loadingPurchases: string;
      purchased: string;
      downloads: string;
      downloadAlbum: string;
      downloading: string;
      downloaded: string;
      download: string;
      tracks: string;
      downloadTrack: string;
      downloadFullAlbum: string;
      downloadAll: string;
      preparingDownload: string;
      removePurchase: string;
      removePurchaseConfirmTitle: string;
      removePurchaseConfirm: string;
      removePurchaseHint: string;
      removePurchaseFailed: string;
      errorDownloadingTrack: string;
      errorDownloadingAlbum: string;
    };
    profileSettingsModal?: {
      tabs: {
        general: string;
        profile: string;
        security: string;
      };
      fields: {
        bandName: string;
        primaryGenre: string;
        email: string;
        language: string;
        aboutBand: string;
        headerImages: string;
        currentPassword: string;
        newPassword: string;
        confirmPassword: string;
        zoom?: string;
      };
      placeholders: {
        bandName: string;
        aboutBand: string;
      };
      hints: {
        primaryGenreCatalog: string;
        publicSlug: string;
        aboutBand: string;
        headerImages: string;
        coverImage: string;
      };
      buttons: {
        selectFiles: string;
        changePassword: string;
        uploadCover: string;
        preview: string;
        setCover: string;
      };
      messages: {
        passwordUpdated: string;
        interfaceInDevelopment: string;
        coverEditTitle: string;
        coverEditInstruction: string;
        coverPreviewInstruction?: string;
        coverUploaded: string;
        coverUploadError: string;
        mobileAreaVisible: string;
        desktopAreaVisible: string;
      };
      validation: {
        enterCurrentPassword: string;
        enterNewPassword: string;
        passwordMinLength: string;
        passwordDifferent: string;
        passwordsNotMatch: string;
        fillAllFields: string;
        maxImages: string;
        invalidFileType: string;
        fileTooLarge: string;
        imageTooSmall: string;
        uploadError: string;
        networkError?: string;
      };
    };
    editAlbumModal?: {
      stepTitles: {
        step1: string;
        step2: string;
        step3: string;
        step4: string;
        step5: string;
      };
      fieldLabels: {
        artistGroupName: string;
        albumTitle: string;
        releaseDate: string;
        upcEan: string;
        albumArt: string;
        description: string;
        allowDownloadSale: string;
        regularPrice: string;
        preorderReleaseDate: string;
      };
      placeholders: {
        upcEan: string;
        releaseDate: string;
        preorderDate: string;
        description: string;
        dragImageHere: string;
        chooseFile: string;
      };
      buttons: {
        replace: string;
        next: string;
        previous: string;
        saveChanges: string;
        createAlbum: string;
        publishAlbum: string;
        saving: string;
        add: string;
      };
      status: {
        uploading: string;
        uploaded: string;
        publishedCover: string;
        error: string;
      };
      helpText: {
        controlDownloadSale: string;
        fansCanBuyNow: string;
      };
      radioOptions: {
        no: string;
        yes: string;
        acceptPreorders: string;
      };
      step1Validation?: {
        requiredTitle?: string;
        requiredReleaseDate?: string;
        requiredUpcEan?: string;
        requiredDescription?: string;
        requiredCover?: string;
        requiredRegularPrice?: string;
        requiredPreorderReleaseDate?: string;
      };
      step2?: {
        genre: string;
        tags: string;
        selectGenres: string;
        addTagPlaceholder: string;
        addTagButton: string;
        maxTagsReached: string;
        removeTag: string;
        /** Подпись под полем жанров при переходе на следующий шаг без выбора */
        requiredGenre?: string;
      };
      step3?: {
        recordedAt: string;
        mixedAt: string;
        masteredBy: string;
        addButton: string;
      };
      step4?: {
        albumCover: string;
        bandMembers: string;
        sessionMusicians: string;
        producer: string;
        addButton: string;
        photographer: string;
        photographerUrl: string;
        designer: string;
        designerUrl: string;
        name: string;
        role: string;
        urlOptional: string;
      };
      /** Ошибки навигации шага «Кредиты» — текст под конкретным блоком формы */
      step4Validation?: {
        requiredDesigner?: string;
        requiredBandMembers?: string;
        requiredProducer?: string;
      };
      step5?: {
        purchase: string;
        streaming: string;
        selectService: string;
        url: string;
        save: string;
        cancel: string;
      };
      /** Подтверждение выхода из режима редактирования строки списка без сохранения */
      discardInlineEdit?: {
        message?: string;
        stay?: string;
        discard?: string;
      };
      /** Переход к редактированию другой строки при несохранённом черновике */
      switchEditConfirm?: {
        message?: string;
        stay?: string;
        discard?: string;
      };
      /** Блок продажи альбома (ЮKassa и т.п.) */
      albumSale?: {
        loadingPayment: string;
        sectionTitle: string;
        connectPaymentHint: string;
        connectPaymentButton: string;
        saleIntro: string;
        saleRadiogroupAriaLabel: string;
      };
    };
  };
  /**
   * Direct album checkout modal copy. Cart-step copy was removed when we
   * switched from cart-based UX to direct purchase (`AlbumCheckoutModal`).
   */
  checkout?: {
    checkout?: {
      emailAddress?: string;
      agreeToOffer?: string;
      publicOffer?: string;
      agreeToPrivacy?: string;
      privacyPolicy?: string;
    };
    payment?: {
      proceedToPayment?: string;
      processing?: string;
      securePaymentInfo?: string;
    };
    validation?: {
      emailRequired?: string;
      emailInvalid?: string;
      agreeToOfferRequired?: string;
      agreeToPrivacyRequired?: string;
    };
    /**
     * Auth-gate copy shown to guests before they're allowed into checkout.
     * Гость → Sign in / Create account → возврат в checkout после auth.
     */
    authGate?: {
      title?: string;
      description?: string;
      benefitLibrary?: string;
      benefitDevices?: string;
      benefitSecure?: string;
      signIn?: string;
      createAccount?: string;
      switchToSignIn?: string;
      switchToCreateAccount?: string;
    };
  };
}

export interface Tracks {
  id: number;
  title: string;
  artist: string;
  src: string;
  cover: string;
}
