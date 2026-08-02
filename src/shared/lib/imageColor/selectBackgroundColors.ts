export type RGB = readonly [number, number, number];

export type Hsl = { h: number; s: number; l: number };

export type ColorRejectionReason =
  | 'near-white'
  | 'near-black'
  | 'near-gray'
  | 'bright-accent'
  | null;

export type ColorEvaluation = {
  rgb: RGB;
  hsl: Hsl;
  score: number;
  rejected: boolean;
  rejectionReason: ColorRejectionReason;
};

export type BackgroundColorSelection = {
  primary: RGB;
  secondary: RGB;
  evaluations: ColorEvaluation[];
  /** Which branch produced the gradient pair. */
  mode: 'color' | 'monochrome';
};

/**
 * Heuristic tuning for background colors extracted from album covers.
 *
 * These values were **not** calibrated on a production cover dataset or A/B tests.
 * They were chosen manually to:
 * - filter obvious non-background colors (white margins, black shadows, gray noise);
 * - deprioritize vivid logo/sticker accents (high S + wide RGB channel spread);
 * - prefer saturated mid-tone “mood” colors typical of cover art.
 *
 * Initial validation: synthetic palettes in unit tests (e.g. orange logo vs muted greens).
 * For real covers, enable `DEBUG_IMAGE_COLOR` and adjust groups below.
 *
 * All values use HSL components in 0–1 range unless noted as RGB spread (0–255).
 */
export const BACKGROUND_COLOR_TUNING = {
  /** Hard reject: paper white, bright borders. */
  rejection: {
    /** L ≥ this → near-white (strict mode). */
    nearWhiteLightness: 0.9,
    /** Off-white with almost no chroma (e.g. #f0f0ee). */
    nearWhiteLightnessSoft: 0.85,
    nearWhiteMaxSaturation: 0.1,
    /** L ≤ this → near-black. */
    nearBlackLightness: 0.1,
    /** S ≤ this → near-gray (achromatic noise). */
    nearGraySaturation: 0.15,
    /** Classic “neon sticker”: high S at very light or very dark L. */
    accentSaturation: 0.72,
    accentLightnessHigh: 0.72,
    accentLightnessLow: 0.18,
    /**
     * Logo/text accents at mid L (e.g. orange #f57812): high S plus large max(R,G,B)−min(R,G,B).
     * Spread is in 0–255; 130 ≈ rejects saturated colors spanning ~half the RGB cube.
     */
    accentChannelSpreadMin: 130,
    accentSpreadMinSaturation: 0.76,
  },

  /** Soft ranking among colors that pass rejection filters. */
  scoring: {
    /** Peak of Gaussian L preference — “mood” tones, not highlights/shadows. */
    idealLightness: 0.42,
    /** Width of L bell curve; larger = more tolerance for lighter/darker moods. */
    idealLightnessSpread: 0.2,
    /** Saturation score: floor and normalized range before oversaturation penalty. */
    saturationFloor: 0.12,
    saturationRange: 0.68,
    oversaturatedStart: 0.85,
    oversaturatedMultiplier: 1.5,
    /** Penalize L above/below these edges even if not rejected outright. */
    edgeLightnessHigh: 0.74,
    edgeLightnessLow: 0.2,
    edgeLightnessPenaltyMultiplier: 2.5,
    edgeLightnessMaxPenalty: 0.55,
    /** Mild penalty for bright or dark saturated accents that barely pass rejection. */
    mildAccentSatHigh: 0.62,
    mildAccentLightHigh: 0.62,
    mildAccentPenaltyBright: 0.25,
    mildAccentSatLow: 0.68,
    mildAccentLightLow: 0.24,
    mildAccentPenaltyDark: 0.2,
    /** Penalize wide channel spread when still saturated (logos without hitting hard reject). */
    spreadPenaltyMinSaturation: 0.55,
    spreadPenaltyStart: 100,
    spreadPenaltyRange: 140,
    spreadPenaltyMax: 0.35,
  },

  /** Secondary stop: prefer hue contrast with primary. */
  secondary: {
    /** Minimum hue distance (degrees) for a distinct second gradient stop. */
    minHueDistance: 25,
    /** When only one viable color: shift L and scale S from primary. */
    derivedLightnessShift: 0.14,
    derivedLightnessMin: 0.12,
    derivedLightnessMax: 0.9,
    derivedSaturationFactor: 0.88,
    derivedSaturationMin: 0.12,
  },

  fallback: {
    emptyPaletteRgb: [64, 64, 64] as RGB,
    relaxedPrimaryScore: 0.01,
  },

  /**
   * Monochrome branch: B&W / desaturated covers where the color heuristic
   * picks muddy brown-gray stops. Triggered only when the whole palette is
   * overwhelmingly achromatic.
   */
  monochrome: {
    /** S below this counts as an achromatic palette member. */
    lowSaturationThreshold: 0.22,
    /** Share of palette that must be achromatic (e.g. 0.7 → 7/10 colors). */
    minAchromaticRatio: 0.7,
    /** No strongly saturated accent anywhere in the palette. */
    maxPaletteSaturation: 0.35,
    /** Mean S across palette — catches uniformly muted B&W with noisy hues. */
    maxMeanSaturation: 0.17,
    /** Any color above this S forces the colorful branch (single green on gray cover). */
    colorfulVetoSaturation: 0.24,
    /** Target L for primary gray stop (graphite / mid-gray). */
    idealLightness: 0.38,
    /** Minimum |ΔL| between primary and secondary for a visible gradient. */
    minLightnessDistance: 0.12,
    /** Exclude paper-white stops from the gradient. */
    maxStopLightness: 0.9,
    /** Exclude crushed-black stops from the gradient. */
    minStopLightness: 0.1,
    /** When deriving a second stop from one gray: L shift (achromatic only). */
    derivedLightnessShift: 0.16,
  },
} as const;

/** Shorthand for internal references to {@link BACKGROUND_COLOR_TUNING}. */
const T = BACKGROUND_COLOR_TUNING;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function rgbToHsl([r, g, b]: RGB): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const lightness = (max + min) / 2;

  if (delta === 0) {
    return { h: 0, s: 0, l: lightness };
  }

  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let hue = 0;
  switch (max) {
    case rn:
      hue = ((gn - bn) / delta + (gn < bn ? 6 : 0)) * 60;
      break;
    case gn:
      hue = ((bn - rn) / delta + 2) * 60;
      break;
    default:
      hue = ((rn - gn) / delta + 4) * 60;
      break;
  }

  return { h: hue, s: saturation, l: lightness };
}

function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function gaussianLightnessScore(lightness: number): number {
  const { idealLightness, idealLightnessSpread } = T.scoring;
  const distance = lightness - idealLightness;
  return Math.exp(-(distance * distance) / (2 * idealLightnessSpread * idealLightnessSpread));
}

function saturationScore(saturation: number): number {
  const { saturationFloor, saturationRange, oversaturatedStart, oversaturatedMultiplier } =
    T.scoring;
  const normalized = clamp((saturation - saturationFloor) / saturationRange, 0, 1);
  const oversaturatedPenalty =
    saturation > oversaturatedStart
      ? (saturation - oversaturatedStart) * oversaturatedMultiplier
      : 0;
  return clamp(normalized * (1 - oversaturatedPenalty), 0, 1);
}

function edgeLightnessPenalty(lightness: number): number {
  const {
    edgeLightnessHigh,
    edgeLightnessLow,
    edgeLightnessPenaltyMultiplier,
    edgeLightnessMaxPenalty,
  } = T.scoring;
  if (lightness > edgeLightnessHigh) {
    return clamp(
      (lightness - edgeLightnessHigh) * edgeLightnessPenaltyMultiplier,
      0,
      edgeLightnessMaxPenalty
    );
  }
  if (lightness < edgeLightnessLow) {
    return clamp(
      (edgeLightnessLow - lightness) * edgeLightnessPenaltyMultiplier,
      0,
      edgeLightnessMaxPenalty
    );
  }
  return 0;
}

function mildAccentPenalty(saturation: number, lightness: number): number {
  const {
    mildAccentSatHigh,
    mildAccentLightHigh,
    mildAccentPenaltyBright,
    mildAccentSatLow,
    mildAccentLightLow,
    mildAccentPenaltyDark,
  } = T.scoring;
  if (saturation > mildAccentSatHigh && lightness > mildAccentLightHigh) {
    return mildAccentPenaltyBright;
  }
  if (saturation > mildAccentSatLow && lightness < mildAccentLightLow) {
    return mildAccentPenaltyDark;
  }
  return 0;
}

function channelSpread([r, g, b]: RGB): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function getRejectionReason(rgb: RGB, hsl: Hsl): ColorRejectionReason {
  const { s, l } = hsl;
  const spread = channelSpread(rgb);
  const R = T.rejection;

  if (l >= R.nearWhiteLightness) {
    return 'near-white';
  }
  if (l >= R.nearWhiteLightnessSoft && s <= R.nearWhiteMaxSaturation) {
    return 'near-white';
  }
  if (l <= R.nearBlackLightness) {
    return 'near-black';
  }
  if (s <= R.nearGraySaturation) {
    return 'near-gray';
  }
  if (s >= R.accentSaturation && (l >= R.accentLightnessHigh || l <= R.accentLightnessLow)) {
    return 'bright-accent';
  }
  if (s >= R.accentSpreadMinSaturation && spread >= R.accentChannelSpreadMin) {
    return 'bright-accent';
  }

  return null;
}

function scoreColor(rgb: RGB, hsl: Hsl, rejectionReason: ColorRejectionReason): number {
  if (rejectionReason) {
    return 0;
  }

  const { spreadPenaltyMinSaturation, spreadPenaltyStart, spreadPenaltyRange, spreadPenaltyMax } =
    T.scoring;
  const lightnessComponent = gaussianLightnessScore(hsl.l);
  const saturationComponent = saturationScore(hsl.s);
  const edgePenalty = edgeLightnessPenalty(hsl.l);
  const accentPenalty = mildAccentPenalty(hsl.s, hsl.l);
  const spread = channelSpread(rgb);
  const spreadPenalty =
    hsl.s > spreadPenaltyMinSaturation && spread > spreadPenaltyStart
      ? clamp((spread - spreadPenaltyStart) / spreadPenaltyRange, 0, spreadPenaltyMax)
      : 0;

  return clamp(
    lightnessComponent *
      saturationComponent *
      (1 - edgePenalty) *
      (1 - accentPenalty) *
      (1 - spreadPenalty),
    0,
    1
  );
}

function evaluatePaletteColor(rgb: RGB, strict: boolean): ColorEvaluation {
  const hsl = rgbToHsl(rgb);
  const rejectionReason = strict
    ? getRejectionReason(rgb, hsl)
    : getRejectionReasonRelaxed(rgb, hsl);

  return {
    rgb,
    hsl,
    rejected: rejectionReason != null,
    rejectionReason,
    score: scoreColor(rgb, hsl, rejectionReason),
  };
}

function getRejectionReasonRelaxed(_rgb: RGB, hsl: Hsl): ColorRejectionReason {
  const R = T.rejection;
  if (hsl.l >= R.nearWhiteLightness) {
    return 'near-white';
  }
  if (hsl.l >= R.nearWhiteLightnessSoft && hsl.s <= R.nearWhiteMaxSaturation) {
    return 'near-white';
  }
  if (hsl.l <= R.nearBlackLightness) {
    return 'near-black';
  }
  return null;
}

function pickPrimary(evaluations: ColorEvaluation[]): ColorEvaluation | null {
  return (
    [...evaluations]
      .filter((entry) => !entry.rejected && entry.score > 0)
      .sort((a, b) => b.score - a.score)[0] ?? null
  );
}

function rgbEquals(a: RGB, b: RGB): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function pickSecondary(
  evaluations: ColorEvaluation[],
  primary: ColorEvaluation
): ColorEvaluation | null {
  const candidates = evaluations
    .filter((entry) => !entry.rejected && entry.score > 0)
    .filter((entry) => !rgbEquals(entry.rgb, primary.rgb))
    .sort((a, b) => b.score - a.score);

  const hueDistinct = candidates.find(
    (entry) => hueDistance(entry.hsl.h, primary.hsl.h) >= T.secondary.minHueDistance
  );
  if (hueDistinct) {
    return hueDistinct;
  }

  return candidates[0] ?? null;
}

function hslToRgb(h: number, s: number, l: number): RGB {
  if (s === 0) {
    const gray = Math.round(l * 255);
    return [gray, gray, gray];
  }

  const hueToRgb = (p: number, q: number, t: number) => {
    let channel = t;
    if (channel < 0) channel += 1;
    if (channel > 1) channel -= 1;
    if (channel < 1 / 6) return p + (q - p) * 6 * channel;
    if (channel < 1 / 2) return q;
    if (channel < 2 / 3) return p + (q - p) * (2 / 3 - channel) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = h / 360;

  return [
    Math.round(hueToRgb(p, q, hk + 1 / 3) * 255),
    Math.round(hueToRgb(p, q, hk) * 255),
    Math.round(hueToRgb(p, q, hk - 1 / 3) * 255),
  ];
}

function deriveSecondaryFromPrimary(primary: RGB): RGB {
  const hsl = rgbToHsl(primary);
  const { idealLightness } = T.scoring;
  const {
    derivedLightnessShift,
    derivedLightnessMin,
    derivedLightnessMax,
    derivedSaturationFactor,
    derivedSaturationMin,
  } = T.secondary;
  const nextLightness =
    hsl.l > idealLightness
      ? clamp(hsl.l - derivedLightnessShift, derivedLightnessMin, derivedLightnessMax)
      : clamp(hsl.l + derivedLightnessShift, derivedLightnessMin, derivedLightnessMax);
  const nextSaturation = clamp(hsl.s * derivedSaturationFactor, derivedSaturationMin, 1);

  return hslToRgb(hsl.h, nextSaturation, nextLightness);
}

function averagePalette(palette: readonly RGB[]): RGB {
  if (palette.length === 0) {
    return [...T.fallback.emptyPaletteRgb];
  }

  const totals = palette.reduce(
    (acc, [r, g, b]) => [acc[0] + r, acc[1] + g, acc[2] + b],
    [0, 0, 0]
  );

  return [
    Math.round(totals[0] / palette.length),
    Math.round(totals[1] / palette.length),
    Math.round(totals[2] / palette.length),
  ] as RGB;
}

/** Force neutral gray so warm/cool cast from compression does not tint the gradient. */
export function neutralizeToGray(rgb: RGB): RGB {
  const value = Math.round(rgbToHsl(rgb).l * 255);
  return [value, value, value];
}

/**
 * True when the cover palette is overwhelmingly achromatic (B&W / silver / graphite).
 * Colorful albums with one gray border pixel should not qualify.
 */
export function isMonochromePalette(palette: readonly RGB[]): boolean {
  const normalized = palette.filter((color) => color.length === 3);
  if (normalized.length === 0) {
    return false;
  }

  const M = T.monochrome;
  const hsls = normalized.map((rgb) => rgbToHsl(rgb));
  const achromaticCount = hsls.filter((hsl) => hsl.s <= M.lowSaturationThreshold).length;
  const maxSaturation = Math.max(...hsls.map((hsl) => hsl.s));
  const meanSaturation = hsls.reduce((sum, hsl) => sum + hsl.s, 0) / hsls.length;
  const hasColorfulMember = hsls.some((hsl) => hsl.s > M.colorfulVetoSaturation);

  if (hasColorfulMember) {
    return false;
  }

  return (
    achromaticCount / normalized.length >= M.minAchromaticRatio &&
    maxSaturation <= M.maxPaletteSaturation &&
    meanSaturation <= M.maxMeanSaturation
  );
}

function evaluateMonochromeStop(rgb: RGB, role: 'primary' | 'secondary'): ColorEvaluation {
  const hsl = rgbToHsl(rgb);
  return {
    rgb,
    hsl: { h: 0, s: 0, l: hsl.l },
    rejected: false,
    rejectionReason: null,
    score: role === 'primary' ? 1 : 0.8,
  };
}

function selectMonochromeBackgroundColors(palette: readonly RGB[]): BackgroundColorSelection {
  const M = T.monochrome;
  const normalized = palette.filter((color) => color.length === 3);

  const grayCandidates = normalized
    .map((rgb) => neutralizeToGray(rgb))
    .filter((rgb) => {
      const { l } = rgbToHsl(rgb);
      return l >= M.minStopLightness && l <= M.maxStopLightness;
    });

  const uniqueGrays = grayCandidates.filter(
    (rgb, index, list) => list.findIndex((other) => rgbEquals(other, rgb)) === index
  );

  const fallbackGray = neutralizeToGray(averagePalette(normalized));
  const candidates = uniqueGrays.length > 0 ? uniqueGrays : [fallbackGray];

  const withLightness = candidates.map((rgb) => ({
    rgb,
    l: rgbToHsl(rgb).l,
  }));

  const primaryEntry = withLightness.reduce((best, current) =>
    Math.abs(current.l - M.idealLightness) < Math.abs(best.l - M.idealLightness) ? current : best
  );

  const secondaryEntry =
    withLightness
      .filter((entry) => !rgbEquals(entry.rgb, primaryEntry.rgb))
      .filter((entry) => Math.abs(entry.l - primaryEntry.l) >= M.minLightnessDistance)
      .sort((a, b) => Math.abs(b.l - primaryEntry.l) - Math.abs(a.l - primaryEntry.l))[0] ??
    (() => {
      const shiftedL = clamp(
        primaryEntry.l > M.idealLightness
          ? primaryEntry.l - M.derivedLightnessShift
          : primaryEntry.l + M.derivedLightnessShift,
        M.minStopLightness,
        M.maxStopLightness
      );
      const value = Math.round(shiftedL * 255);
      return { rgb: [value, value, value] as RGB, l: shiftedL };
    })();

  const evaluations = normalized.map((rgb) => {
    const neutral = neutralizeToGray(rgb);
    const hsl = rgbToHsl(rgb);
    const isAchromatic = hsl.s <= M.lowSaturationThreshold;
    return {
      rgb: neutral,
      hsl: { h: 0, s: 0, l: hsl.l },
      score: isAchromatic ? 1 - Math.abs(hsl.l - M.idealLightness) : 0,
      rejected: !isAchromatic,
      rejectionReason: isAchromatic ? null : ('near-gray' as ColorRejectionReason),
    };
  });

  return {
    primary: primaryEntry.rgb,
    secondary: secondaryEntry.rgb,
    evaluations: [
      evaluateMonochromeStop(primaryEntry.rgb, 'primary'),
      evaluateMonochromeStop(secondaryEntry.rgb, 'secondary'),
      ...evaluations,
    ],
    mode: 'monochrome',
  };
}

function evaluateColorPalette(palette: readonly RGB[]): BackgroundColorSelection {
  const normalizedPalette = palette.filter((color) => color.length === 3);
  if (normalizedPalette.length === 0) {
    const fallback = [...T.fallback.emptyPaletteRgb] as RGB;
    const evaluation = evaluatePaletteColor(fallback, true);
    return {
      primary: fallback,
      secondary: deriveSecondaryFromPrimary(fallback),
      evaluations: [evaluation],
      mode: 'color',
    };
  }

  let evaluations = normalizedPalette.map((rgb) => evaluatePaletteColor(rgb, true));
  let primaryEntry = pickPrimary(evaluations);

  if (!primaryEntry) {
    evaluations = normalizedPalette.map((rgb) => evaluatePaletteColor(rgb, false));
    primaryEntry = pickPrimary(evaluations);
  }

  if (!primaryEntry) {
    const fallback = averagePalette(normalizedPalette);
    primaryEntry = evaluatePaletteColor(fallback, false);
    primaryEntry.score = T.fallback.relaxedPrimaryScore;
    primaryEntry.rejected = false;
    primaryEntry.rejectionReason = null;
    evaluations = [primaryEntry];
  }

  const secondaryEntry = pickSecondary(evaluations, primaryEntry);
  const secondary = secondaryEntry?.rgb ?? deriveSecondaryFromPrimary(primaryEntry.rgb);

  return {
    primary: primaryEntry.rgb,
    secondary,
    evaluations,
    mode: 'color',
  };
}

function evaluatePalette(palette: readonly RGB[]): BackgroundColorSelection {
  const normalizedPalette = palette.filter((color) => color.length === 3);
  if (isMonochromePalette(normalizedPalette)) {
    return selectMonochromeBackgroundColors(normalizedPalette);
  }

  return evaluateColorPalette(normalizedPalette);
}

export function selectBackgroundColors(palette: readonly RGB[]): { primary: RGB; secondary: RGB } {
  const selection = evaluatePalette(palette);
  return {
    primary: selection.primary,
    secondary: selection.secondary,
  };
}

export function selectBackgroundColorsWithDetails(
  palette: readonly RGB[]
): BackgroundColorSelection {
  return evaluatePalette(palette);
}

export function formatRgbTuple([r, g, b]: RGB): string {
  return `rgb(${r}, ${g}, ${b})`;
}

const RGB_STRING_PATTERN = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i;

export function parseRgbString(value: string): RGB {
  const match = value.match(RGB_STRING_PATTERN);
  if (!match) {
    throw new Error(`Invalid rgb() string: "${value}"`);
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isImageColorDebugEnabled(): boolean {
  if (typeof process !== 'undefined' && process.env.DEBUG_IMAGE_COLOR === 'true') {
    return true;
  }

  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('DEBUG_IMAGE_COLOR') === '1';
  }

  return false;
}

export function logBackgroundColorSelection(
  coverKey: string,
  palette: RGB[],
  selection: BackgroundColorSelection,
  meta?: { imageSource?: string; quality?: number }
): void {
  console.group(`[useImageColor:debug] cover="${coverKey}"`);
  if (meta?.imageSource) {
    console.log('image source:', meta.imageSource);
  }
  if (meta?.quality != null) {
    console.log('quality:', meta.quality);
  }

  console.log('selection mode:', selection.mode);
  console.log('isMonochromePalette:', isMonochromePalette(palette));
  console.log('raw palette:', palette);
  console.table(
    selection.evaluations.map((entry, index) => ({
      index,
      rgb: formatRgbTuple(entry.rgb),
      h: entry.hsl.h.toFixed(1),
      s: entry.hsl.s.toFixed(3),
      l: entry.hsl.l.toFixed(3),
      score: entry.score.toFixed(4),
      rejected: entry.rejected,
      reason: entry.rejectionReason ?? '',
    }))
  );
  console.log('selected gradient pair:', {
    primary: formatRgbTuple(selection.primary),
    secondary: formatRgbTuple(selection.secondary),
  });
  console.groupEnd();
}
