import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLang } from '@app/providers/lang';
import { getJSON } from '@shared/api/http';
import {
  applySupportEmailToUserAgreement,
  type UserAgreementPageData,
} from '@shared/lib/applySupportEmailToUserAgreement';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { buildLocalizedPublicPath } from '@shared/lib/i18n/routeLang';
import { buildPublicSiteUrl } from '@shared/lib/publicSiteOrigin';
import { buildPublicPageHreflangUrls } from '@shared/lib/seo/buildPublicPageHreflangUrls';
import { publicPageHreflangLinks } from '@shared/lib/seo/PublicPageHreflangLinks';
import '@pages/Offer/ui/style.scss';

function hasParagraphText(value: string): boolean {
  return value.trim().length > 0;
}

export function UserAgreementPage() {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const [agreementData, setAgreementData] = useState<UserAgreementPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const data = await getJSON<UserAgreementPageData>(`user-agreement-${lang}.json`);
        if (!cancelled) {
          setAgreementData(applySupportEmailToUserAgreement(data));
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load user agreement');
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [lang]);

  const pageTitle = ui?.links?.userAgreementPageTitle ?? agreementData?.title ?? 'User Agreement';
  const pageDescription =
    ui?.links?.userAgreementPageDescription ??
    (lang === 'ru'
      ? 'Пользовательское соглашение и условия размещения контента'
      : 'User Agreement and content terms');
  const canonical = buildPublicSiteUrl(buildLocalizedPublicPath(lang, '/user-agreement'));
  const hreflang = buildPublicPageHreflangUrls((routeLang) =>
    buildLocalizedPublicPath(routeLang, '/user-agreement')
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

  if (error || !agreementData) {
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
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <link rel="canonical" href={canonical} />
        {publicPageHreflangLinks(hreflang)}
        <meta property="og:url" content={canonical} />
        <meta name="twitter:url" content={canonical} />
      </Helmet>
      <div className="offer-page">
        <div className="offer-page__container">
          <header className="offer-page__header">
            <h1 className="offer-page__title">{pageTitle}</h1>
            <p className="offer-page__subtitle">{agreementData.subtitle}</p>

            <div className="offer-page__meta">
              <p>
                <strong>{agreementData.meta.versionLabel}</strong> {agreementData.meta.version}
              </p>
              <p>
                <strong>{agreementData.meta.effectiveDateLabel}</strong>{' '}
                {agreementData.meta.effectiveDate}
              </p>
              <p>
                <strong>{agreementData.meta.websiteLabel}</strong> {agreementData.meta.website}
              </p>
            </div>
          </header>

          <div className="offer-page__content">
            {hasParagraphText(agreementData.intro) ? (
              <p className="offer-page__intro">{agreementData.intro}</p>
            ) : null}

            {agreementData.sections.map((section, sectionIndex) => {
              const paragraphs = section.paragraphs.filter(hasParagraphText);
              const isLastSection = sectionIndex === agreementData.sections.length - 1;

              return (
                <section key={sectionIndex} className="offer-page__section">
                  <h2 className="offer-page__section-title">{section.title}</h2>
                  {paragraphs.map((paragraph, paragraphIndex) => (
                    <p key={paragraphIndex}>{paragraph}</p>
                  ))}
                  {isLastSection && (
                    <div className="offer-page__seller-info">
                      <p>
                        <strong>{agreementData.contactInfo.emailLabel}</strong>{' '}
                        {agreementData.contactInfo.email}
                      </p>
                      <p>
                        <strong>{agreementData.contactInfo.hoursLabel}</strong>{' '}
                        {agreementData.contactInfo.hours}
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
