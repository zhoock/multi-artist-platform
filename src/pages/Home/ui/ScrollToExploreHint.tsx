import { useLang } from '@app/providers/lang';
import { UNIVERSE_SCENE_OVERLAY_ATTR } from '@shared/lib/universeSceneOverlay';
import './ScrollToExploreHint.scss';

const LABELS = {
  en: 'Scroll to explore',
  ru: 'Прокрутите, чтобы исследовать',
} as const;

export function ScrollToExploreHint() {
  const { lang } = useLang();
  const label = LABELS[lang === 'ru' ? 'ru' : 'en'];

  return (
    <p
      className="universe-scroll-hint"
      aria-hidden="true"
      {...{ [UNIVERSE_SCENE_OVERLAY_ATTR]: '' }}
    >
      <span className="universe-scroll-hint__icon" aria-hidden>
        <svg
          className="universe-scroll-hint__mouse"
          viewBox="0 0 24 34"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="5" y="3" width="14" height="24" rx="7" stroke="currentColor" strokeWidth="1.5" />
          <line
            className="universe-scroll-hint__wheel"
            x1="12"
            y1="9"
            x2="12"
            y2="14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="universe-scroll-hint__label">{label}</span>
    </p>
  );
}
