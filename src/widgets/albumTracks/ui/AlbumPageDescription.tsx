import { useLayoutEffect, useRef, useState } from 'react';
import { Text } from '@shared/ui/text';
import { PublicFullscreenTextModal } from '@shared/ui/publicFullscreenText';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useLang } from '@app/providers/lang';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import aboutStyles from '@pages/Home/ui/AboutSection.module.scss';

const PREVIEW_LINE_CLAMP = 3;
const DESCRIPTION_TEXT_CLASS = 'album-page-description__text';

type AlbumPageDescriptionProps = {
  description: string;
  albumTitle: string;
};

export function AlbumPageDescription({ description, albumTitle }: AlbumPageDescriptionProps) {
  const trimmed = description?.trim() ?? '';
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLong, setIsLong] = useState(false);
  const measureRef = useRef<HTMLParagraphElement>(null);
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const showLabel = ui?.buttons?.show ?? 'MORE';
  const albumTitleTrimmed = albumTitle?.trim() ?? '';
  const aboutAlbumTitleTemplate =
    ui?.titles?.aboutAlbumModalTitle ??
    (lang === 'ru' ? 'Об альбоме {albumTitle}' : 'About {albumTitle}');
  const popupTitle = aboutAlbumTitleTemplate.replace('{albumTitle}', albumTitleTrimmed);
  const closeAriaLabel = ui?.albumComments?.cancel ?? 'Close';

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
    const resolvedLineHeight = Number.isFinite(lineHeight) ? lineHeight : 24;
    const maxPreviewHeight = resolvedLineHeight * PREVIEW_LINE_CLAMP;
    setIsLong(el.scrollHeight > maxPreviewHeight + 1);
  }, [trimmed]);

  if (!trimmed) {
    return null;
  }

  return (
    <div className="album-page-description">
      <p
        ref={measureRef}
        className={`${DESCRIPTION_TEXT_CLASS} album-page-description__measure`}
        aria-hidden="true"
      >
        {trimmed}
      </p>

      {isLong ? (
        <>
          <button
            type="button"
            className={aboutStyles.aboutPreviewTrigger}
            onClick={() => setIsModalOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={isModalOpen}
          >
            <Text className={`${DESCRIPTION_TEXT_CLASS} ${aboutStyles.aboutTextPreview}`}>
              {trimmed}
            </Text>
            <span className={aboutStyles.aboutPreviewFade} aria-hidden="true" />
            <span className={aboutStyles.aboutPreviewMore} aria-hidden="true">
              {showLabel}
            </span>
          </button>

          <PublicFullscreenTextModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            title={popupTitle}
            closeAriaLabel={closeAriaLabel}
          >
            <Text className={DESCRIPTION_TEXT_CLASS}>{trimmed}</Text>
          </PublicFullscreenTextModal>
        </>
      ) : (
        <Text className={DESCRIPTION_TEXT_CLASS}>{trimmed}</Text>
      )}
    </div>
  );
}
