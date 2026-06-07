// src/pages/StemsPlayground/components/MixerStemRow.tsx
import clsx from 'clsx';
import { StemIcon, type StemCategory } from '@entities/stem';

type MixerStemRowProps = {
  name: string;
  category: StemCategory;
  /** Громкость 0..1. */
  volume: number;
  muted: boolean;
  soloed: boolean;
  disabled?: boolean;
  soloLabel: string;
  muteLabel: string;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onToggleSolo: () => void;
};

/** Строка стема в микшере: иконка, название, слайдер громкости, Solo/Mute. */
export function MixerStemRow({
  name,
  category,
  volume,
  muted,
  soloed,
  disabled = false,
  soloLabel,
  muteLabel,
  onVolumeChange,
  onToggleMute,
  onToggleSolo,
}: MixerStemRowProps) {
  const percent = Math.round(volume * 100);

  return (
    <div className={clsx('mixer-stem', { 'mixer-stem--muted': muted, 'is-disabled': disabled })}>
      <span className="mixer-stem__icon">
        <StemIcon category={category} className="mixer-stem__icon-svg" />
      </span>
      <span className="mixer-stem__name">{name}</span>
      <input
        className="mixer-stem__slider"
        type="range"
        min={0}
        max={100}
        value={percent}
        disabled={disabled}
        aria-label={`${name}: ${percent}%`}
        style={{ '--progress-width': `${percent}%` } as React.CSSProperties}
        onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
        onInput={(e) => {
          const next = Number(e.currentTarget.value);
          e.currentTarget.style.setProperty('--progress-width', `${next}%`);
          onVolumeChange(next / 100);
        }}
      />
      <span className="mixer-stem__percent">{percent}%</span>
      <button
        type="button"
        className={clsx('mixer-stem__toggle', { 'is-active': soloed })}
        onClick={onToggleSolo}
        disabled={disabled}
        aria-pressed={soloed}
        aria-label={`${soloLabel}: ${name}`}
        title={soloLabel}
      >
        S
      </button>
      <button
        type="button"
        className={clsx('mixer-stem__toggle', { 'is-active': muted })}
        onClick={onToggleMute}
        disabled={disabled}
        aria-pressed={muted}
        aria-label={`${muteLabel}: ${name}`}
        title={muteLabel}
      >
        M
      </button>
    </div>
  );
}
