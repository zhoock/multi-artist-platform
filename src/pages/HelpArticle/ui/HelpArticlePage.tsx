import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

import { getUserImageUrl } from '@shared/api/albums';
import { optionalMediaSrc } from '@shared/lib/media/optionalMediaUrl';
import { renderMarkdownViaRichText } from '@shared/lib/richText';
import type { ArticledetailsProps } from '@models';
import { ArticleSkeleton } from '@pages/Article/ui/ArticleSkeleton';
import { ErrorMessage } from '@shared/ui/error-message';
import { ImageCarousel } from '@shared/ui/image-carousel';
import { Menu as MenuIcon, X as XIcon } from 'lucide-react';
import { useLang } from '@app/providers/lang';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { formatDateInWords, type LocaleKey } from '@entities/article/lib/formatDate';
import { resolveDetailCaption, parseCarouselImagesFromDetail } from '@entities/article';
import {
  selectHelpArticleById,
  selectHelpArticlesError,
  selectHelpArticlesStatus,
  selectHelpArticlesData,
  fetchHelpArticles,
} from '@entities/helpArticle';
import { buildPublicSiteUrl } from '@shared/lib/publicSiteOrigin';
import type { RequestStatus } from '@entities/article';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import './style.scss';
import '@entities/article/ui/style.scss';

// Категории статей помощи
type HelpArticleCategory = {
  id: string;
  title: {
    en: string;
    ru: string;
  };
  articles: {
    id: string;
    title: {
      en: string;
      ru: string;
    };
  }[];
};

const categories: HelpArticleCategory[] = [
  {
    id: 'sales-tools',
    title: {
      en: 'SALES TOOLS',
      ru: 'ИНСТРУМЕНТЫ ДЛЯ ПРОДАЖИ',
    },
    articles: [
      {
        id: 'paypal-stripe-payment',
        title: {
          en: 'Getting paid through PayPal and Stripe',
          ru: 'Получение оплаты через PayPal и Stripe',
        },
      },
    ],
  },
];

export function HelpArticlePage() {
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  const { lang } = useLang();
  const dispatch = useAppDispatch();
  const locale = useMemo(() => lang as LocaleKey, [lang]);
  const { articleId = '' } = useParams<{ articleId: string }>();
  const helpArticlesStatus = useAppSelector((state) => selectHelpArticlesStatus(state, lang));
  const helpArticlesError = useAppSelector((state) => selectHelpArticlesError(state, lang));
  const helpArticle = useAppSelector((state) => selectHelpArticleById(state, lang, articleId));
  const helpArticles = useAppSelector((state) => selectHelpArticlesData(state, lang));
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const { formatDate } = formatDateInWords[locale];

  // Состояние видимости сайдбара (сохраняем в localStorage)
  // На мобильных устройствах по умолчанию скрыт, на десктопе - открыт
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem('help-article-sidebar-open');
    if (saved !== null) {
      return saved === 'true';
    }
    // По умолчанию: на мобильных скрыт, на десктопе открыт
    return window.innerWidth >= 768;
  });

  // Загружаем данные, если они еще не загружены (данные могут быть загружены через loader, но если статус idle - запускаем загрузку)
  useEffect(() => {
    if (helpArticlesStatus === 'idle') {
      dispatch(fetchHelpArticles({ lang }));
    }
  }, [helpArticlesStatus, lang, dispatch]);

  // Сохраняем состояние сайдбара в localStorage
  useEffect(() => {
    localStorage.setItem('help-article-sidebar-open', String(isSidebarOpen));
  }, [isSidebarOpen]);

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  // Обновляем категории на основе реальных данных статей
  const categoriesWithData = useMemo(() => {
    return categories.map((category) => ({
      ...category,
      articles: category.articles.filter((article) =>
        helpArticles.some((a) => a.articleId === article.id)
      ),
    }));
  }, [helpArticles]);

  // Функция для создания якоря из текста
  const createAnchor = (text: string): string => {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  // Извлекаем навигационные элементы из статьи (subtitle и title)
  const articleNavigation = useMemo(() => {
    if (!helpArticle) return [];
    const nav: Array<{ id: string; text: string; level: number }> = [];
    helpArticle.details.forEach((detail) => {
      if (detail.subtitle) {
        nav.push({
          id: createAnchor(detail.subtitle),
          text: detail.subtitle,
          level: 1,
        });
      }
      if (detail.title) {
        nav.push({
          id: createAnchor(detail.title),
          text: detail.title,
          level: 2,
        });
      }
    });
    return nav;
  }, [helpArticle]);

  // Плавная прокрутка к якорю
  const scrollToAnchor = (anchorId: string) => {
    const element = document.getElementById(anchorId);
    if (element) {
      const offset = 80; // Отступ сверху
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
    }
  };

  return (
    <section className="help-article main-background" aria-label="Блок со статьёй помощи">
      <div
        className={`wrapper help-article__wrapper ${isSidebarOpen ? 'help-article__wrapper--sidebar-open' : 'help-article__wrapper--sidebar-closed'}`}
      >
        {/* Overlay для мобильных устройств */}
        {isSidebarOpen && (
          <div className="help-article__overlay" onClick={closeSidebar} aria-hidden="true" />
        )}

        {/* Кнопка переключения сайдбара */}
        <button
          type="button"
          className="help-article__sidebar-toggle"
          onClick={toggleSidebar}
          aria-label={
            isSidebarOpen
              ? lang === 'en'
                ? 'Hide sidebar'
                : 'Скрыть боковое меню'
              : lang === 'en'
                ? 'Show sidebar'
                : 'Показать боковое меню'
          }
          aria-expanded={isSidebarOpen}
        >
          {isSidebarOpen ? (
            <XIcon {...dashboardActionIconProps({ size: 20 })} />
          ) : (
            <MenuIcon {...dashboardActionIconProps({ size: 20 })} />
          )}
        </button>

        <aside
          className={`help-article__sidebar ${isSidebarOpen ? 'help-article__sidebar--open' : 'help-article__sidebar--closed'}`}
        >
          <nav className="help-article__nav">
            <Link to="/articles" className="help-article__back-link">
              {lang === 'en' ? '« All articles' : '« Все статьи'}
            </Link>

            {categoriesWithData.map((category) => (
              <div key={category.id} className="help-article__category">
                <h3 className="help-article__category-title">{category.title[lang]}</h3>
                <ul className="help-article__article-list">
                  {category.articles.map((article) => {
                    const isActive = article.id === articleId;
                    return (
                      <li key={article.id} className="help-article__article-item">
                        <Link
                          to={`/help/articles/${article.id}`}
                          className={`help-article__article-link ${isActive ? 'help-article__article-link--active' : ''}`}
                          aria-current={isActive ? 'page' : undefined}
                          onClick={() => {
                            // Закрываем сайдбар на мобильных устройствах при клике на ссылку
                            if (window.innerWidth < 768) {
                              setIsSidebarOpen(false);
                            }
                          }}
                        >
                          {article.title[lang]}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            {/* Навигация по разделам статьи */}
            {articleNavigation.length > 0 && (
              <div className="help-article__article-navigation">
                <h3 className="help-article__navigation-title">
                  {lang === 'en' ? 'In this article' : 'В этой статье'}
                </h3>
                <ul className="help-article__navigation-list">
                  {articleNavigation.map((item) => (
                    <li
                      key={item.id}
                      className={`help-article__navigation-item help-article__navigation-item--level-${item.level}`}
                    >
                      <a
                        href={`#${item.id}`}
                        className="help-article__navigation-link"
                        onClick={(e) => {
                          e.preventDefault();
                          scrollToAnchor(item.id);
                          // Закрываем сайдбар на мобильных устройствах
                          if (window.innerWidth < 768) {
                            setIsSidebarOpen(false);
                          }
                        }}
                      >
                        {item.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </nav>
        </aside>

        <div className="help-article__content">
          <ArticleContent
            status={helpArticlesStatus}
            error={helpArticlesError}
            article={helpArticle}
            formatDate={formatDate}
            lang={locale}
            createAnchor={createAnchor}
          />
        </div>
      </div>
    </section>
  );
}

type ArticleContentProps = {
  status: RequestStatus;
  error: string | null;
  article: ReturnType<typeof selectHelpArticleById>;
  formatDate: (value: string) => string;
  lang: LocaleKey;
  createAnchor: (text: string) => string;
};

function ArticleContent({
  status,
  error,
  article,
  formatDate,
  lang,
  createAnchor,
}: ArticleContentProps) {
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
  const seoDesc = article.description;
  const canonical = buildPublicSiteUrl(`/help/articles/${encodeURIComponent(article.articleId)}`);

  // Создаем Block с доступом к createAnchor
  const BlockWithAnchor = (details: ArticledetailsProps) => {
    const titleId = details.title ? createAnchor(details.title) : undefined;
    const subtitleId = details.subtitle ? createAnchor(details.subtitle) : undefined;
    const mediaOwnerId = details.userId ?? article.userId ?? undefined;
    const mediaCaption = resolveDetailCaption(details) ?? '';
    const carouselItems =
      Array.isArray(details.img) && details.img.length >= 2
        ? parseCarouselImagesFromDetail({
            type: 'carousel',
            images: details.img,
            caption: details.caption,
            alt: details.alt,
            img: details.img,
          })
        : null;
    const carouselSlides =
      carouselItems && carouselItems.length >= 2
        ? carouselItems.map((item) => ({ src: item.imageKey, caption: item.caption }))
        : null;

    return (
      <>
        {details.title && <h3 id={titleId}>{renderMarkdownViaRichText(details.title)}</h3>}
        {details.img &&
          (carouselSlides ? (
            <div className="uncollapse">
              <ImageCarousel slides={carouselSlides} category="articles" userId={mediaOwnerId} />
            </div>
          ) : (
            <figure className="article__media-figure">
              <img
                src={optionalMediaSrc(
                  getUserImageUrl(
                    details.img as string,
                    'articles',
                    '.jpg',
                    undefined,
                    mediaOwnerId
                  ),
                  'HelpArticlePage:blockImage',
                  { articleId: article.articleId, hasMediaOwnerId: !!mediaOwnerId }
                )}
                alt={mediaCaption}
                loading="lazy"
                decoding="async"
              />
              {mediaCaption ? (
                <figcaption className="article__media-caption">{mediaCaption}</figcaption>
              ) : null}
            </figure>
          ))}
        {details.subtitle && <h4 id={subtitleId}>{renderMarkdownViaRichText(details.subtitle)}</h4>}

        {typeof details.content === 'string' ? (
          <p>{renderMarkdownViaRichText(details.content)}</p>
        ) : (
          <ul>
            {details.content?.map((item, i) => {
              const text = typeof item === 'string' ? item : item.text;
              const key = typeof item === 'string' ? i : item.id;
              return <li key={key}>{renderMarkdownViaRichText(text)}</li>;
            })}
          </ul>
        )}
      </>
    );
  };

  return (
    <>
      <Helmet>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDesc} />
        <meta property="og:title" content={seoTitle} />
        <meta property="og:description" content={seoDesc} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonical} />
        <meta name="twitter:url" content={canonical} />
        <link rel="canonical" href={canonical} />
      </Helmet>

      <h1 className="help-article__title">{article.nameArticle}</h1>
      <time dateTime={article.date} className="help-article__date">
        <small>
          {lang === 'en' ? 'Last updated: ' : 'Последнее обновление: '}
          {formatDate(article.date)} {lang === 'en' ? '' : 'г.'}
        </small>
      </time>

      <div className="help-article__body">
        {article.details.map((d, index) => (
          <Fragment key={d.blockId ?? d.id ?? index}>{BlockWithAnchor(d)}</Fragment>
        ))}
      </div>
    </>
  );
}

export default HelpArticlePage;
