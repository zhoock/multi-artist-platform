import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useEffectiveSearchParams } from '@shared/lib/hooks/useEffectiveLocation';
import { Helmet } from 'react-helmet-async';

import { getImageUrl } from '@shared/api/albums';
import { optionalMediaSrc } from '@shared/lib/media/optionalMediaUrl';
import { renderMarkdownViaRichText } from '@shared/lib/richText';
import type { ArticledetailsProps } from '@models';
import { ArticleSkeleton } from './ArticleSkeleton';
import { ErrorMessage } from '@shared/ui/error-message';
import { ImageCarousel } from '@shared/ui/image-carousel';
import { useLang } from '@app/providers/lang';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { formatDateInWords, type LocaleKey } from '@entities/article/lib/formatDate';
import {
  resolveDetailCaption,
  parseCarouselImagesFromDetail,
  selectArticleByIdResolved,
  selectArticlesError,
  selectArticlesStatus,
  type RequestStatus,
} from '@entities/article';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import {
  buildArtistArticlesCatalogPath,
  buildArtistPagePath,
  buildPublicArticlePagePath,
} from '@shared/lib/seo/publicPagePaths';
import { resolveChildContextNavMode, useNavigationOrigin } from '@shared/lib/navigationContext';
import { ContextNav } from '@shared/ui/contextNav';
import { buildPublicSiteUrl } from '@shared/lib/publicSiteOrigin';
import { buildPublicPageHreflangUrls } from '@shared/lib/seo/buildPublicPageHreflangUrls';
import { publicPageHreflangLinks } from '@shared/lib/seo/PublicPageHreflangLinks';
import { ArtistArchiveLockIcon } from '@shared/ui/icons/ArtistArchiveLockIcon';
import { SubscriberContentLockIcon } from '@shared/ui/icons/SubscriberContentLockIcon';
import { useArchiveAccessModal } from '@shared/lib/archiveAccessModal';
import { ArchiveApiError } from '@shared/api/archive';
import { usePremiumSubscription } from '@features/premiumSubscription';
import {
  dispatchArchiveArtistAdded,
  refreshPremiumContentForArchiveChange,
} from '@features/artistArchive';
import { CollectionFullModal } from '@features/artistArchive/ui/CollectionFullModal';
import { useArtistArchiveStatus } from '@features/artistArchive/lib/useArtistArchiveStatus';
import { useArtistPageBuilderNav } from '@shared/ui/artistPageBuilder/useArtistPageBuilderNav';
import { useArtistPageAccess } from '@shared/lib/hooks/useArtistPageAccess';
import {
  resolveArticleLockedBodySize,
  resolveLockedArticleBodyBlocks,
  splitArticleDetailsForArchiveGate,
} from '@entities/article/lib/splitArticleDetailsForArchiveGate';
import {
  resolveArticlePaywallKind,
  resolveShowLockedArticleCard,
  type ArticlePaywallKind,
} from '@entities/article/lib/resolveArticlePaywallKind';
import { isArticlePaywallOverlayPending } from '@entities/article/lib/resolveArticlePaywallOverlay';
import { useSiteArtistDisplayName } from '@shared/lib/hooks/useSiteArtistDisplayName';
import '@entities/article/ui/style.scss';

export function ArticlePage() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  const { lang } = useLang();
  const locale = useMemo(() => lang as LocaleKey, [lang]);
  const { articleId = '' } = useParams<{ articleId: string }>();
  const [searchParams] = useEffectiveSearchParams();
  const artistSlug = searchParams.get('artist');

  useEffect(() => {
    const onArchiveChanged = () => {
      refreshPremiumContentForArchiveChange(dispatch, artistSlug);
    };
    window.addEventListener('archive:changed', onArchiveChanged);
    return () => window.removeEventListener('archive:changed', onArchiveChanged);
  }, [artistSlug, dispatch]);
  const homePath = buildArtistPagePath(lang, artistSlug?.trim() ?? '');
  const articlesListPath = buildArtistArticlesCatalogPath(lang, artistSlug?.trim() ?? '');
  const articlesStatus = useAppSelector((state) => selectArticlesStatus(state));
  const articlesError = useAppSelector((state) => selectArticlesError(state));
  const article = useAppSelector((state) => selectArticleByIdResolved(state, articleId));
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const { displayName: siteArtistName } = useSiteArtistDisplayName(lang, { artistSlug });
  const navigationOrigin = useNavigationOrigin();
  const contextNavMode = resolveChildContextNavMode(navigationOrigin);
  const { formatDate } = formatDateInWords[locale];

  function Block({
    title,
    subtitle,
    content,
    img,
    caption,
    images,
    type,
    userId,
    blockKind,
  }: ArticledetailsProps) {
    const mediaCaption = resolveDetailCaption({ caption }) ?? '';
    const imageList = images && Array.isArray(images) ? images : Array.isArray(img) ? img : null;
    const carouselItems =
      type === 'carousel' && imageList
        ? parseCarouselImagesFromDetail({ type, images: imageList, caption, img })
        : imageList && imageList.length >= 2
          ? parseCarouselImagesFromDetail({
              type: 'carousel',
              images: imageList,
              caption,
              img,
            })
          : null;
    const carouselSlides =
      carouselItems && carouselItems.length >= 2
        ? carouselItems.map((item) => ({ src: item.imageKey, caption: item.caption }))
        : null;
    const singleImage =
      imageList?.length === 1
        ? imageList[0].imageKey
        : !imageList && img && typeof img === 'string'
          ? img
          : null;

    return (
      <>
        {title && <h3>{renderMarkdownViaRichText(title)}</h3>}
        {carouselSlides && carouselSlides.length > 0 && (
          <div className="uncollapse">
            <ImageCarousel slides={carouselSlides} category="articles" userId={userId} />
          </div>
        )}
        {singleImage && (
          <figure className="article__media-figure">
            <img
              src={optionalMediaSrc(
                getImageUrl(
                  singleImage,
                  '.jpg',
                  userId ? { userId, category: 'articles' } : undefined
                ),
                'ArticlePage:singleImage',
                { hasUserId: !!userId }
              )}
              alt={mediaCaption}
              loading="lazy"
              decoding="async"
            />
            {mediaCaption ? (
              <figcaption className="article__media-caption">{mediaCaption}</figcaption>
            ) : null}
          </figure>
        )}
        {subtitle && <h4>{renderMarkdownViaRichText(subtitle)}</h4>}

        {/* Разделитель */}
        {typeof content === 'string' && content === '---' ? (
          <hr />
        ) : typeof content === 'string' && blockKind === 'quote' ? (
          <blockquote className="article__quote">{renderMarkdownViaRichText(content)}</blockquote>
        ) : typeof content === 'string' ? (
          <p>{renderMarkdownViaRichText(content)}</p>
        ) : (
          <ul>
            {content?.map((item, i) => {
              const text = typeof item === 'string' ? item : item.text;
              const key = typeof item === 'string' ? i : item.id;
              return <li key={key}>{renderMarkdownViaRichText(text)}</li>;
            })}
          </ul>
        )}
      </>
    );
  }

  // Данные загружаются через loader

  return (
    <section className="article main-background" aria-label="Блок со статьёй">
      <div className="wrapper">
        <ContextNav
          mode={contextNavMode}
          artistName={siteArtistName}
          artistTo={homePath}
          listLabel={ui?.titles?.articles}
          listTo={articlesListPath}
        />

        <ArticleContent
          status={articlesStatus}
          error={articlesError}
          article={article}
          formatDate={formatDate}
          lang={locale}
          artistSlug={artistSlug}
          renderBlock={Block}
        />
      </div>
    </section>
  );
}

type ArticleContentProps = {
  status: RequestStatus;
  error: string | null;
  article: ReturnType<typeof selectArticleByIdResolved>;
  formatDate: (value: string) => string;
  lang: LocaleKey;
  artistSlug: string | null;
  renderBlock: (details: ArticledetailsProps) => JSX.Element;
};

function ArticleContent({
  status,
  error,
  article,
  formatDate,
  lang,
  artistSlug,
  renderBlock,
}: ArticleContentProps) {
  const dispatch = useAppDispatch();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const { isPremium, loading: premiumLoading } = usePremiumSubscription();
  const {
    artistInArchive,
    artistActiveInArchive,
    loading: archiveLoading,
    addToArchive,
    adding: archiveAdding,
    activateInArchive,
    activating: archiveActivating,
    buttonState: archiveButtonState,
  } = useArtistArchiveStatus(article?.userId);
  const { monetizationEnabled } = useArtistPageAccess(artistSlug?.trim() ?? '');
  const { open } = useArchiveAccessModal();
  const { openDashboard } = useArtistPageBuilderNav();
  const [archiveFullOpen, setArchiveFullOpen] = useState(false);

  const showLockedArticle = useMemo(
    () =>
      resolveShowLockedArticleCard({
        monetizationEnabled,
        articleLocked: article?.articleLocked,
        visibility: article?.visibility,
      }),
    [article?.articleLocked, article?.visibility, monetizationEnabled]
  );

  const paywallKind = useMemo(
    () =>
      showLockedArticle
        ? resolveArticlePaywallKind({
            articleLocked: true,
            isPremium,
            premiumLoading,
            archiveLoading,
            artistInArchive,
            artistActiveInArchive,
          })
        : 'none',
    [
      archiveLoading,
      artistActiveInArchive,
      artistInArchive,
      isPremium,
      premiumLoading,
      showLockedArticle,
    ]
  );

  /** Keep content gated while entitlements resolve (`pending`) to avoid a brief unlock flash. */
  const isPaywalled = paywallKind !== 'none';

  const overlayPending = isArticlePaywallOverlayPending({
    showLocked: showLockedArticle,
    paywallKind,
    premiumLoading,
    archiveLoading,
  });

  const subscriptionGateTitle =
    ui?.titles?.articleSubscriptionLockedOverlayTitle ??
    (lang === 'en' ? 'Support required' : 'Нужна поддержка');
  const subscriptionGateHint =
    ui?.titles?.articleSubscriptionLockedOverlayHint ??
    (lang === 'en' ? 'Read the full article.' : 'Чтобы читать полностью.');
  const subscriptionCtaLabel =
    ui?.buttons?.articleSubscriptionLockedCta ??
    (lang === 'en' ? 'Start Support' : 'Начать поддержку');

  const archiveGateTitle =
    ui?.titles?.articleArchiveLockedOverlayTitle ??
    (lang === 'en' ? 'Add to collection' : 'Добавьте в коллекцию');
  const archiveGateHint =
    ui?.titles?.articleArchiveLockedOverlayHint ??
    (lang === 'en' ? 'Read the full article.' : 'Чтобы читать полностью.');
  const archiveCtaLabel =
    ui?.buttons?.artistArchiveAdd ?? (lang === 'en' ? 'Add to Collection' : 'Добавить в коллекцию');
  const archiveAddingLabel =
    ui?.buttons?.artistArchiveAdding ?? (lang === 'en' ? 'Adding…' : 'Добавляем…');
  const archiveInCollectionLabel =
    ui?.buttons?.artistCollectionIn ??
    ui?.buttons?.artistArchiveInArchive ??
    (lang === 'en' ? 'In Collection' : 'В коллекции');

  const activateGateTitle =
    ui?.titles?.articleActivateLockedOverlayTitle ??
    (lang === 'en' ? 'Activate artist' : 'Активируйте артиста');
  const activateGateHint =
    ui?.titles?.articleActivateLockedGateHint ??
    (lang === 'en' ? 'Read the full article.' : 'Чтобы читать статью полностью.');
  const activateCtaLabel =
    ui?.buttons?.articleActivateLockedCta ?? (lang === 'en' ? 'Activate' : 'Активировать');
  const activateLoadingLabel =
    ui?.buttons?.artistArchiveActivating ?? (lang === 'en' ? 'Activating…' : 'Активируем…');

  const renewGateTitle =
    ui?.titles?.articleRenewLockedOverlayTitle ??
    (lang === 'en' ? 'Support inactive' : 'Поддержка неактивна');
  const renewGateHint =
    ui?.titles?.articleRenewLockedOverlayHint ??
    (lang === 'en'
      ? 'Renew support to continue reading.'
      : 'Продлите поддержку, чтобы продолжить чтение.');
  const renewCtaLabel =
    ui?.buttons?.artistCollectionRenew ?? (lang === 'en' ? 'Renew Support' : 'Продлить поддержку');

  const handleSubscriptionGate = () => {
    open({
      artistUserId: article?.userId,
      artistSlug: artistSlug ?? undefined,
    });
  };

  const handleRenewGate = () => {
    open({
      artistUserId: article?.userId,
      artistSlug: artistSlug ?? undefined,
    });
  };

  const handleArchiveGate = useCallback(async () => {
    const artistUserId = article?.userId?.trim();
    if (!artistUserId) return;

    if (archiveButtonState === 'not_premium' || archiveButtonState === 'subscription_inactive') {
      open({
        artistUserId,
        artistSlug: artistSlug ?? undefined,
      });
      return;
    }

    if (archiveButtonState === 'archive_full') {
      setArchiveFullOpen(true);
      return;
    }

    if (archiveButtonState !== 'can_add' || archiveAdding) return;

    try {
      await addToArchive();
      dispatchArchiveArtistAdded(artistUserId, artistSlug ?? undefined);
      refreshPremiumContentForArchiveChange(dispatch, artistSlug, { immediate: true });
    } catch (err) {
      if (err instanceof ArchiveApiError && err.code === 'ARCHIVE_SLOTS_LIMIT') {
        setArchiveFullOpen(true);
      }
    }
  }, [
    addToArchive,
    archiveAdding,
    archiveButtonState,
    artistSlug,
    article?.userId,
    dispatch,
    open,
  ]);

  const handleActivateGate = useCallback(async () => {
    if (archiveButtonState !== 'in_collection_inactive' || archiveActivating) return;

    try {
      await activateInArchive();
      refreshPremiumContentForArchiveChange(dispatch, artistSlug, { immediate: true });
    } catch (err) {
      if (
        err instanceof ArchiveApiError &&
        (err.code === 'ARCHIVE_SLOTS_LIMIT' || err.code === 'ARCHIVE_ACTIVATION_LIMIT')
      ) {
        setArchiveFullOpen(true);
      }
    }
  }, [activateInArchive, archiveActivating, archiveButtonState, artistSlug, dispatch]);

  const articleDetailsSplit = useMemo(
    () =>
      article && isPaywalled
        ? splitArticleDetailsForArchiveGate(article.details)
        : { previewDetails: [], lockedDetails: [] },
    [article, isPaywalled]
  );
  const { previewDetails } = articleDetailsSplit;
  const lockedBodyBlocks = useMemo(
    () =>
      article && isPaywalled
        ? resolveLockedArticleBodyBlocks(article.details, articleDetailsSplit)
        : [],
    [article, articleDetailsSplit, isPaywalled]
  );
  const lockedBodySize = useMemo(
    () => resolveArticleLockedBodySize(lockedBodyBlocks, article?.description?.length ?? 0),
    [lockedBodyBlocks, article?.description]
  );

  if (!article) {
    if (status === 'loading' || status === 'idle') {
      return <ArticleSkeleton />;
    }

    if (status === 'failed') {
      return (
        <ErrorMessage
          error={
            error ?? (lang === 'en' ? 'Failed to load article' : 'Не удалось загрузить статью')
          }
        />
      );
    }

    return <ErrorMessage error={lang === 'en' ? 'Article not found' : 'Статья не найдена'} />;
  }

  const seoTitle = article.nameArticle;
  const paywallSeoHint =
    paywallKind === 'subscription'
      ? subscriptionGateHint
      : paywallKind === 'renew'
        ? renewGateHint
        : paywallKind === 'activate'
          ? activateGateHint
          : paywallKind === 'archive'
            ? archiveGateHint
            : article.description;
  const seoDesc = isPaywalled ? paywallSeoHint : article.description;
  const canonical = buildPublicSiteUrl(
    buildPublicArticlePagePath(lang, article.articleId, artistSlug)
  );
  const hreflang = buildPublicPageHreflangUrls((routeLang) =>
    buildPublicArticlePagePath(routeLang, article.articleId, artistSlug)
  );

  const renderDetailBlocks = (blocks: typeof article.details, keyPrefix: string) =>
    blocks.map((d, index) => (
      <Fragment key={`${keyPrefix}-${d.blockId ?? d.id ?? index}`}>
        {renderBlock({ ...d, userId: article.userId })}
      </Fragment>
    ));

  const renderPaywallGate = (kind: Exclude<ArticlePaywallKind, 'none' | 'pending'>) => {
    if (kind === 'renew') {
      return (
        <div
          className="article__archive-gate article__archive-gate--inline article__archive-gate--subscription article__archive-gate--renew"
          role="region"
          aria-labelledby="article-renew-gate-title"
        >
          <div className="article__archive-gate-rule" aria-hidden="true" />
          <SubscriberContentLockIcon className="article__archive-gate-icon" size={28} />
          <h3 id="article-renew-gate-title" className="article__archive-gate-title">
            {renewGateTitle}
          </h3>
          <p className="article__archive-gate-hint">{renewGateHint}</p>
          <button type="button" className="article__archive-gate-cta" onClick={handleRenewGate}>
            {renewCtaLabel}
          </button>
          <div className="article__archive-gate-rule" aria-hidden="true" />
        </div>
      );
    }

    if (kind === 'activate') {
      return (
        <div
          className="article__archive-gate article__archive-gate--inline"
          role="region"
          aria-labelledby="article-activate-gate-title"
        >
          <div className="article__archive-gate-rule" aria-hidden="true" />
          <ArtistArchiveLockIcon className="article__archive-gate-icon" size={28} />
          <h3 id="article-activate-gate-title" className="article__archive-gate-title">
            {activateGateTitle}
          </h3>
          <p className="article__archive-gate-hint">{activateGateHint}</p>
          <button
            type="button"
            className="article__archive-gate-cta"
            disabled={archiveActivating}
            aria-busy={archiveActivating}
            onClick={() => void handleActivateGate()}
          >
            {archiveActivating ? activateLoadingLabel : activateCtaLabel}
          </button>
          <div className="article__archive-gate-rule" aria-hidden="true" />
        </div>
      );
    }

    const isSubscription = kind === 'subscription';
    const gateTitle = isSubscription ? subscriptionGateTitle : archiveGateTitle;
    const gateHint = isSubscription ? subscriptionGateHint : archiveGateHint;
    const gateCta = isSubscription
      ? subscriptionCtaLabel
      : archiveAdding
        ? archiveAddingLabel
        : archiveButtonState === 'in_collection_active'
          ? archiveInCollectionLabel
          : archiveCtaLabel;
    const gateTitleId = isSubscription
      ? 'article-subscription-gate-title'
      : 'article-archive-gate-title';
    const GateIcon = isSubscription ? SubscriberContentLockIcon : ArtistArchiveLockIcon;
    const gateButtonDisabled =
      !isSubscription &&
      (archiveAdding ||
        archiveButtonState === 'in_collection_active' ||
        archiveButtonState === 'loading');

    return (
      <div
        className={`article__archive-gate article__archive-gate--inline${
          isSubscription ? ' article__archive-gate--subscription' : ''
        }`}
        role="region"
        aria-labelledby={gateTitleId}
      >
        <div className="article__archive-gate-rule" aria-hidden="true" />
        <GateIcon className="article__archive-gate-icon" size={28} />
        <h3 id={gateTitleId} className="article__archive-gate-title">
          {gateTitle}
        </h3>
        <p className="article__archive-gate-hint">{gateHint}</p>
        <button
          type="button"
          className="article__archive-gate-cta"
          disabled={gateButtonDisabled}
          aria-busy={!isSubscription && archiveAdding}
          onClick={isSubscription ? handleSubscriptionGate : () => void handleArchiveGate()}
        >
          {gateCta}
        </button>
        <div className="article__archive-gate-rule" aria-hidden="true" />
      </div>
    );
  };

  let articleBody: ReactNode;
  if (isPaywalled) {
    articleBody = (
      <>
        <div className="article__paywall">
          <div className="article__paywall-approach">
            {previewDetails.length > 0 && (
              <div className="article__paywall-approach-preview">
                {renderDetailBlocks(previewDetails, 'preview')}
              </div>
            )}
          </div>
          {overlayPending ? (
            <div
              className="article__archive-gate article__archive-gate--inline article__archive-gate--pending"
              aria-hidden="true"
            >
              <div className="article__archive-gate-rule" aria-hidden="true" />
              <span className="article__archive-gate-skeleton article__archive-gate-skeleton--icon" />
              <span className="article__archive-gate-skeleton article__archive-gate-skeleton--title" />
              <span className="article__archive-gate-skeleton article__archive-gate-skeleton--hint" />
              <span className="article__archive-gate-skeleton article__archive-gate-skeleton--cta" />
              <div className="article__archive-gate-rule" aria-hidden="true" />
            </div>
          ) : paywallKind !== 'pending' ? (
            renderPaywallGate(paywallKind)
          ) : null}
          <div
            className={`article__paywall-tail article__paywall-tail--${lockedBodySize}`}
            aria-hidden="true"
          >
            {lockedBodyBlocks.length > 0 ? (
              renderDetailBlocks(lockedBodyBlocks, 'locked')
            ) : article.description ? (
              <p className="article__paywall-tail-fallback">{article.description}</p>
            ) : (
              <div className="article__paywall-tail-placeholder" />
            )}
            <div className="article__paywall-fade-bottom" aria-hidden="true" />
          </div>
        </div>
      </>
    );
  } else {
    articleBody = renderDetailBlocks(article.details, 'detail');
  }

  return (
    <>
      <Helmet>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDesc} />
        <meta property="og:title" content={seoTitle} />
        <meta property="og:description" content={seoDesc} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonical} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seoTitle} />
        <meta name="twitter:description" content={seoDesc} />
        <meta name="twitter:url" content={canonical} />
        <link rel="canonical" href={canonical} />
        {publicPageHreflangLinks(hreflang)}
      </Helmet>

      <time dateTime={article.date}>
        <small>
          {formatDate(article.date)} {lang === 'en' ? '' : 'г.'}
        </small>
      </time>
      <h2>{article.nameArticle}</h2>

      {articleBody}

      <CollectionFullModal
        isOpen={archiveFullOpen}
        onClose={() => setArchiveFullOpen(false)}
        onUpgradePlan={() => {
          open({
            artistUserId: article.userId,
            artistSlug: artistSlug ?? undefined,
          });
        }}
        onManageCollection={() => openDashboard('collection')}
      />
    </>
  );
}

export default ArticlePage;
