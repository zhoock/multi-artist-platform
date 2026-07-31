import { Link } from 'react-router-dom';
import { useEffectiveSearchParams } from '@shared/lib/hooks/useEffectiveLocation';
import type { ArticleProps } from '@/models';
import { useLang } from '@app/providers/lang';
import { formatDateInWords, LocaleKey } from '@entities/article/lib/formatDate';
import { buildPublicArticlePagePath } from '@shared/lib/seo/publicPagePaths';
import { ArticleCoverImage } from './ArticleCoverImage';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { SubscriberContentLockIcon } from '@shared/ui/icons/SubscriberContentLockIcon';
import { ArtistArchiveLockIcon } from '@shared/ui/icons/ArtistArchiveLockIcon';
import { usePremiumSubscription } from '@features/premiumSubscription';
import { useArtistArchiveStatus } from '@features/artistArchive/lib/useArtistArchiveStatus';
import {
  resolveArticlePaywallKind,
  resolveShowLockedArticleCard,
} from '@entities/article/lib/resolveArticlePaywallKind';
import { isArticlePaywallOverlayPending } from '@entities/article/lib/resolveArticlePaywallOverlay';
import './style.scss';

export function ArticlePreview({
  articleId,
  img,
  nameArticle,
  date,
  userId,
  articleLocked,
  visibility,
  monetizationEnabled = true,
}: ArticleProps & {
  /** When false, never show subscriber/collection paywall chrome. */ monetizationEnabled?: boolean;
}) {
  const { lang } = useLang() as { lang: LocaleKey };
  const { formatDate } = formatDateInWords[lang];
  const [searchParams] = useEffectiveSearchParams();
  const artistSlug = searchParams.get('artist');
  const articleTo = buildPublicArticlePagePath(lang, articleId, artistSlug);
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const { isPremium, loading: premiumLoading } = usePremiumSubscription();
  const {
    artistInArchive,
    artistActiveInArchive,
    loading: archiveLoading,
  } = useArtistArchiveStatus(userId);

  const showLockedCard = resolveShowLockedArticleCard({
    monetizationEnabled,
    articleLocked,
    visibility,
  });

  const paywallKind = resolveArticlePaywallKind({
    articleLocked: showLockedCard,
    isPremium,
    premiumLoading,
    archiveLoading,
    artistInArchive,
    artistActiveInArchive,
  });

  const overlayPending = isArticlePaywallOverlayPending({
    showLocked: showLockedCard,
    paywallKind,
    premiumLoading,
    archiveLoading,
  });

  const subscriptionOverlayTitle =
    ui?.titles?.articleSubscriptionLockedOverlayTitle ??
    (lang === 'en' ? 'Support required' : 'Нужна поддержка');
  const subscriptionOverlayHint =
    ui?.titles?.articleSubscriptionLockedOverlayHint ??
    (lang === 'en' ? 'Read the full article.' : 'Чтобы читать полностью.');

  const archiveOverlayTitle =
    ui?.titles?.articleArchiveLockedOverlayTitle ??
    (lang === 'en' ? 'Add to collection' : 'Добавьте в коллекцию');
  const archiveOverlayHint =
    ui?.titles?.articleArchiveLockedOverlayHint ??
    (lang === 'en' ? 'Read the full article.' : 'Чтобы читать полностью.');

  const activateOverlayTitle =
    ui?.titles?.articleActivateLockedOverlayTitle ??
    (lang === 'en' ? 'Activate artist' : 'Активируйте артиста');
  const activateOverlayHint =
    ui?.titles?.articleActivateLockedOverlayHint ??
    (lang === 'en' ? 'Read the full article.' : 'Чтобы читать статью полностью.');

  const renewOverlayTitle =
    ui?.titles?.articleRenewLockedOverlayTitle ??
    (lang === 'en' ? 'Support inactive' : 'Поддержка неактивна');
  const renewOverlayHint =
    ui?.titles?.articleRenewLockedOverlayHint ??
    (lang === 'en'
      ? 'Renew support to continue reading.'
      : 'Продлите поддержку, чтобы продолжить чтение.');

  const legacyOverlayTitle =
    ui?.titles?.articleLockedOverlayTitle ??
    (lang === 'en' ? 'Subscribers only' : 'Только для подписчиков');
  const legacyOverlayHint =
    ui?.titles?.articleLockedOverlayHint ??
    (lang === 'en'
      ? 'Active artist support required to read.'
      : 'Нужна активная поддержка, чтобы читать');

  const overlayTitle =
    paywallKind === 'archive'
      ? archiveOverlayTitle
      : paywallKind === 'activate'
        ? activateOverlayTitle
        : paywallKind === 'renew'
          ? renewOverlayTitle
          : paywallKind === 'subscription'
            ? subscriptionOverlayTitle
            : legacyOverlayTitle;
  const overlayHint =
    paywallKind === 'archive'
      ? archiveOverlayHint
      : paywallKind === 'activate'
        ? activateOverlayHint
        : paywallKind === 'renew'
          ? renewOverlayHint
          : paywallKind === 'subscription'
            ? subscriptionOverlayHint
            : legacyOverlayHint;
  const OverlayIcon =
    paywallKind === 'archive' || paywallKind === 'activate'
      ? ArtistArchiveLockIcon
      : SubscriberContentLockIcon;

  if (!showLockedCard || paywallKind === 'none') {
    return (
      <article className="articles__card">
        <Link to={articleTo}>
          <div className="articles__picture">
            <ArticleCoverImage
              img={img}
              userId={userId}
              role="public"
              alt={nameArticle}
              loading="lazy"
              decoding="async"
              debugLabel={`ArticlePreview:${articleId}`}
            />
          </div>
          <div className="articles__description">
            {nameArticle}

            <time dateTime={date}>
              <small>{formatDate(date)}</small>
            </time>
          </div>
        </Link>
      </article>
    );
  }

  return (
    <article
      className="articles__card articles__card--subscriber-locked"
      aria-label={overlayPending ? nameArticle : `${overlayTitle}. ${nameArticle}`}
    >
      <Link to={articleTo} className="articles__card-hit">
        <div className="articles__picture">
          <ArticleCoverImage
            img={img}
            userId={userId}
            role="public"
            alt=""
            loading="lazy"
            decoding="async"
            debugLabel={`ArticlePreview:${articleId}`}
          />
          <div
            className={`articles__subscriber-overlay${
              overlayPending ? ' articles__subscriber-overlay--pending' : ''
            }`}
            aria-hidden="true"
          >
            {overlayPending ? (
              <>
                <span className="articles__subscriber-overlay-skeleton articles__subscriber-overlay-skeleton--icon" />
                <span className="articles__subscriber-overlay-skeleton articles__subscriber-overlay-skeleton--title" />
                <span className="articles__subscriber-overlay-skeleton articles__subscriber-overlay-skeleton--hint" />
              </>
            ) : (
              <>
                <OverlayIcon className="articles__subscriber-lock-icon" size={28} />
                <p className="articles__subscriber-overlay-title">{overlayTitle}</p>
                <p className="articles__subscriber-overlay-hint">{overlayHint}</p>
              </>
            )}
          </div>
        </div>
        <div className="articles__description articles__description--locked">
          {nameArticle}

          <time dateTime={date}>
            <small>{formatDate(date)}</small>
          </time>
        </div>
      </Link>
    </article>
  );
}

export default ArticlePreview;
