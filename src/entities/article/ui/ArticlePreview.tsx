import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { ArticleProps } from '@/models';
import { useLang } from '@app/providers/lang';
import { formatDateInWords, LocaleKey } from '@entities/article/lib/formatDate';
import { withPublicArtistQuery } from '@shared/lib/artistQuery';
import { normalizeTrackVisibility } from '@shared/lib/tracks/trackVisibility';
import { ArticleCoverImage } from './ArticleCoverImage';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { SubscriberContentLockIcon } from '@shared/ui/icons/SubscriberContentLockIcon';
import { ArtistArchiveLockIcon } from '@shared/ui/icons/ArtistArchiveLockIcon';
import { useArchiveAccessModal } from '@shared/lib/archiveAccessModal';
import { usePremiumSubscription } from '@features/premiumSubscription';
import { useArtistArchiveStatus } from '@features/artistArchive/lib/useArtistArchiveStatus';
import { resolveArticlePaywallKind } from '@entities/article/lib/resolveArticlePaywallKind';
import './style.scss';

export function ArticlePreview({
  articleId,
  img,
  nameArticle,
  date,
  userId,
  articleLocked,
  visibility,
}: ArticleProps) {
  const { lang } = useLang() as { lang: LocaleKey };
  const { formatDate } = formatDateInWords[lang];
  const [searchParams] = useSearchParams();
  const artistSlug = searchParams.get('artist');
  const articlePath = withPublicArtistQuery(`/articles/${articleId}`, artistSlug);
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const navigate = useNavigate();
  const { isPremium, loading: premiumLoading } = usePremiumSubscription();
  const { artistInArchive } = useArtistArchiveStatus(userId);
  const { requestAccess } = useArchiveAccessModal();
  const handleLockedClick = () => {
    void requestAccess({
      artistUserId: userId,
      artistSlug,
      onAccessGranted: () => navigate(articlePath),
    });
  };

  const paywallKind = resolveArticlePaywallKind({
    articleLocked,
    isPremium,
    premiumLoading,
    artistInArchive,
  });

  const subscriptionOverlayTitle =
    ui?.titles?.articleSubscriptionLockedOverlayTitle ??
    (lang === 'en' ? 'Continue Reading' : 'Продолжить чтение');
  const subscriptionOverlayHint =
    ui?.titles?.articleSubscriptionLockedOverlayHint ??
    (lang === 'en'
      ? 'This article is available to subscribers.'
      : 'Эта статья доступна подписчикам.');

  const archiveOverlayTitle =
    ui?.titles?.articleArchiveLockedOverlayTitle ??
    (lang === 'en' ? 'Artist not in your Archive' : 'Артист не в вашем архиве');
  const archiveOverlayHint =
    ui?.titles?.articleArchiveLockedOverlayHint ??
    (lang === 'en'
      ? 'Add this artist to your Archive to continue reading.'
      : 'Добавьте артиста в архив, чтобы продолжить чтение.');

  const renewOverlayTitle =
    ui?.titles?.articleRenewLockedOverlayTitle ??
    (lang === 'en' ? 'Support inactive' : 'Поддержка неактивна');
  const renewOverlayHint =
    ui?.titles?.articleRenewLockedOverlayHint ??
    (lang === 'en'
      ? 'Renew your subscription to continue reading.'
      : 'Продлите подписку, чтобы продолжить чтение.');

  const legacyOverlayTitle =
    ui?.titles?.articleLockedOverlayTitle ??
    (lang === 'en' ? 'Subscribers only' : 'Только для подписчиков');
  const legacyOverlayHint =
    ui?.titles?.articleLockedOverlayHint ??
    (lang === 'en' ? 'Purchase an album to read this content.' : 'Оформите подписку, чтобы читать');

  const overlayTitle =
    paywallKind === 'archive'
      ? archiveOverlayTitle
      : paywallKind === 'renew'
        ? renewOverlayTitle
        : paywallKind === 'subscription' || paywallKind === 'pending'
          ? subscriptionOverlayTitle
          : legacyOverlayTitle;
  const overlayHint =
    paywallKind === 'archive'
      ? archiveOverlayHint
      : paywallKind === 'renew'
        ? renewOverlayHint
        : paywallKind === 'subscription' || paywallKind === 'pending'
          ? subscriptionOverlayHint
          : legacyOverlayHint;
  const OverlayIcon = paywallKind === 'archive' ? ArtistArchiveLockIcon : SubscriberContentLockIcon;

  const visibilityNorm = normalizeTrackVisibility(visibility);
  /** API явно ставит `false`, если есть доступ (в т.ч. владелец артиста). `undefined` трактуем как «нет поля» — для subscribers_only безопаснее показать замок. */
  const showLockedCard =
    articleLocked === true || (visibilityNorm === 'subscribers_only' && articleLocked !== false);

  if (!showLockedCard) {
    return (
      <article className="articles__card">
        <Link to={articlePath}>
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
      aria-label={`${overlayTitle}. ${nameArticle}`}
    >
      <button type="button" className="articles__card-hit" onClick={handleLockedClick}>
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
          <div className="articles__subscriber-overlay" aria-hidden="true">
            <OverlayIcon className="articles__subscriber-lock-icon" size={28} />
            <p className="articles__subscriber-overlay-title">{overlayTitle}</p>
            <p className="articles__subscriber-overlay-hint">{overlayHint}</p>
          </div>
        </div>
        <div className="articles__description articles__description--locked">
          {nameArticle}

          <time dateTime={date}>
            <small>{formatDate(date)}</small>
          </time>
        </div>
      </button>
    </article>
  );
}

export default ArticlePreview;
