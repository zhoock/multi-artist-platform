import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLang } from '@app/providers/lang';
import { getJSON } from '@shared/api/http';
import {
  applySupportEmailToPrivacy,
  type PrivacyPageData,
} from '@shared/lib/applySupportEmailToPrivacy';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { buildLocalizedPublicPath } from '@shared/lib/i18n/routeLang';
import { buildPublicSiteUrl } from '@shared/lib/publicSiteOrigin';
import { buildPublicPageHreflangUrls } from '@shared/lib/seo/buildPublicPageHreflangUrls';
import { publicPageHreflangLinks } from '@shared/lib/seo/PublicPageHreflangLinks';
import { formatLegalPageDate } from '@shared/lib/i18n/formatLegalPageDate';
import '@pages/Offer/ui/style.scss';

function hasParagraphText(value: string): boolean {
  return value.trim().length > 0;
}

export function PrivacyPage() {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const [privacyData, setPrivacyData] = useState<PrivacyPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPrivacyData() {
      try {
        setLoading(true);
        setError(null);
        const data = await getJSON<PrivacyPageData>(`privacy-${lang}.json`);
        if (!cancelled) {
          setPrivacyData(applySupportEmailToPrivacy(data));
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load privacy policy data');
          setLoading(false);
        }
      }
    }

    loadPrivacyData();

    return () => {
      cancelled = true;
    };
  }, [lang]);

  const currentDate = formatLegalPageDate(lang);

  const pageTitle = ui?.links?.privacyPageTitle ?? 'Privacy';
  const pageDescription =
    ui?.links?.privacyPageDescription ??
    (lang === 'ru'
      ? 'Политика конфиденциальности и обработки персональных данных'
      : 'Privacy policy and personal data processing terms');
  const canonical = buildPublicSiteUrl(buildLocalizedPublicPath(lang, '/privacy'));
  const hreflang = buildPublicPageHreflangUrls((routeLang) =>
    buildLocalizedPublicPath(routeLang, '/privacy')
  );

  if (loading) {
    return (
      <div className="offer-page">
        <div className="offer-page__container">
          <p>{lang === 'ru' ? 'Загрузка...' : 'Loading...'}</p>
        </div>
      </div>
    );
  }

  if (error || !privacyData) {
    return (
      <div className="offer-page">
        <div className="offer-page__container">
          <p>{lang === 'ru' ? 'Ошибка загрузки данных' : 'Error loading data'}</p>
          {error && <p>{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{ui?.links?.privacyPageTitle ?? privacyData.title}</title>
        <meta name="description" content={pageDescription} />
        <link rel="canonical" href={canonical} />
        {publicPageHreflangLinks(hreflang)}
        <meta property="og:url" content={canonical} />
        <meta name="twitter:url" content={canonical} />
      </Helmet>
      <div className="offer-page">
        <div className="offer-page__container">
          <header className="offer-page__header">
            <h1 className="offer-page__title">
              {ui?.links?.privacyPageTitle ?? privacyData.title}
            </h1>
            <p className="offer-page__subtitle">{privacyData.subtitle}</p>

            <div className="offer-page__meta">
              <p>
                <strong>{privacyData.meta.dateLabel}</strong> {currentDate}
              </p>
              <p>
                <strong>{privacyData.meta.websiteLabel}</strong> {privacyData.meta.website}
              </p>
            </div>
          </header>

          <div className="offer-page__content">
            {hasParagraphText(privacyData.intro) ? (
              <p className="offer-page__intro">{privacyData.intro}</p>
            ) : null}

            {privacyData.sections.map((section, sectionIndex) => {
              const paragraphs = section.paragraphs.filter(hasParagraphText);
              const isLastSection = sectionIndex === privacyData.sections.length - 1;

              return (
                <section key={sectionIndex} className="offer-page__section">
                  <h2 className="offer-page__section-title">{section.title}</h2>
                  {paragraphs.map((paragraph, paragraphIndex) => (
                    <p key={paragraphIndex}>{paragraph}</p>
                  ))}
                  {isLastSection && (
                    <div className="offer-page__seller-info">
                      <p>
                        <strong>{privacyData.contactInfo.emailLabel}</strong>{' '}
                        {privacyData.contactInfo.email}
                      </p>
                      <p>
                        <strong>{privacyData.contactInfo.hoursLabel}</strong>{' '}
                        {privacyData.contactInfo.hours}
                      </p>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
