/**
 * Технические характеристики аудиофайла, сохранённые при загрузке.
 * Значения только из реального probe содержимого — никогда не выдумывать.
 */

export type AudioTechnicalMetadata = {
  /** Нормализованный контейнер: mp3, flac, wav, aiff, aac, … */
  audioContainer: string | null;
  audioCodec: string | null;
  /** Битрейт в бит/с */
  audioBitrate: number | null;
  /** Частота дискретизации в Гц */
  audioSampleRate: number | null;
  /** Разрядность в битах (для PCM/FLAC/…); для lossy обычно null */
  audioBitDepth: number | null;
  audioChannels: number | null;
  /** Длительность в секундах из probe */
  audioDuration: number | null;
  /** Размер исходного файла в байтах */
  audioFileSize: number | null;
};

export type AudioTechnicalMetadataInput = Partial<AudioTechnicalMetadata> | null | undefined;

/** Контейнеры, для которых в подписи приоритетны bit depth + sample rate. */
const LOSSLESS_CONTAINERS = new Set(['flac', 'wav', 'aiff', 'alac']);

/** Контейнеры, для которых в подписи приоритетен bitrate. */
const LOSSY_CONTAINERS = new Set(['mp3', 'aac', 'ogg', 'opus', 'wma']);

const CONTAINER_DISPLAY: Record<string, string> = {
  mp3: 'MP3',
  flac: 'FLAC',
  wav: 'WAV',
  aiff: 'AIFF',
  aac: 'AAC',
  alac: 'ALAC',
  ogg: 'OGG',
  opus: 'Opus',
  wma: 'WMA',
};

/** Порядок при списке форматов альбома. */
export const AUDIO_FORMAT_SORT_ORDER = [
  'WAV',
  'AIFF',
  'FLAC',
  'ALAC',
  'AAC',
  'MP3',
  'OGG',
  'Opus',
  'WMA',
];

export function emptyAudioTechnicalMetadata(): AudioTechnicalMetadata {
  return {
    audioContainer: null,
    audioCodec: null,
    audioBitrate: null,
    audioSampleRate: null,
    audioBitDepth: null,
    audioChannels: null,
    audioDuration: null,
    audioFileSize: null,
  };
}

function positiveInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value);
}

function positiveDurationSeconds(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

/**
 * Нормализует container/codec из music-metadata (или аналога) в короткий ключ.
 * Определение по содержимому probe, не по расширению имени файла.
 */
export function normalizeAudioContainer(
  container: string | undefined | null,
  codec: string | undefined | null
): string | null {
  const c = (container || '').trim().toLowerCase();
  const codecL = (codec || '').trim().toLowerCase();

  if (!c && !codecL) {
    return null;
  }

  if (c.includes('flac') || codecL === 'flac' || codecL.includes('flac')) {
    return 'flac';
  }
  if (c.includes('aiff') || c === 'aif' || codecL.includes('aiff')) {
    return 'aiff';
  }
  if (c.includes('wave') || c === 'wav' || c === 'riff') {
    return 'wav';
  }
  if (codecL.includes('alac') || c.includes('alac')) {
    return 'alac';
  }
  if (
    codecL.includes('aac') ||
    c === 'aac' ||
    c.includes('m4a/aac') ||
    (c.includes('mp4') && codecL.includes('aac')) ||
    (c.includes('m4a') && codecL.includes('aac'))
  ) {
    return 'aac';
  }
  if (
    codecL.includes('layer 3') ||
    codecL.includes('mp3') ||
    c === 'mp3' ||
    (c.includes('mpeg') && !codecL.includes('aac') && !codecL.includes('layer 2'))
  ) {
    return 'mp3';
  }
  if (codecL.includes('opus') || c.includes('opus')) {
    return 'opus';
  }
  if (c.includes('ogg') || codecL.includes('vorbis')) {
    return 'ogg';
  }
  if (c.includes('wma') || c.includes('asf') || codecL.includes('wma')) {
    return 'wma';
  }
  if (c.includes('m4a') || c === 'mp4' || c.includes('isom')) {
    // MP4/M4A без явного AAC/ALAC — контейнер как есть не угадываем в lossy/lossless
    if (codecL.includes('pcm')) {
      return 'wav';
    }
    return null;
  }

  // Уже короткий ключ
  if (CONTAINER_DISPLAY[c]) {
    return c;
  }

  return null;
}

export function normalizeAudioCodec(codec: string | undefined | null): string | null {
  const trimmed = (codec || '').trim();
  return trimmed ? trimmed.slice(0, 64) : null;
}

/** Собирает DTO из сырых полей probe (music-metadata `format` и т.п.). */
export function buildAudioTechnicalMetadata(raw: {
  container?: string | null;
  codec?: string | null;
  bitrate?: number | null;
  sampleRate?: number | null;
  bitsPerSample?: number | null;
  numberOfChannels?: number | null;
  duration?: number | null;
  fileSize?: number | null;
}): AudioTechnicalMetadata {
  const audioContainer = normalizeAudioContainer(raw.container, raw.codec);
  const audioBitDepth = positiveInt(raw.bitsPerSample);
  // Для типичных lossy bit depth из тегов часто отсутствует — оставляем null даже если 0/мусор
  const bitDepth = audioContainer && LOSSY_CONTAINERS.has(audioContainer) ? null : audioBitDepth;

  return {
    audioContainer,
    audioCodec: normalizeAudioCodec(raw.codec),
    audioBitrate: positiveInt(raw.bitrate),
    audioSampleRate: positiveInt(raw.sampleRate),
    audioBitDepth: bitDepth,
    audioChannels: positiveInt(raw.numberOfChannels),
    audioDuration: positiveDurationSeconds(raw.duration),
    audioFileSize: positiveInt(raw.fileSize),
  };
}

export function getAudioContainerDisplayLabel(container: string | null | undefined): string | null {
  if (!container) {
    return null;
  }
  const key = container.trim().toLowerCase();
  return CONTAINER_DISPLAY[key] ?? null;
}

/** Расширение для Storage по определённому контейнеру. */
export function audioContainerToExtension(container: string | null | undefined): string | null {
  if (!container) {
    return null;
  }
  const key = container.trim().toLowerCase();
  if (key === 'aiff') {
    return 'aiff';
  }
  if (CONTAINER_DISPLAY[key]) {
    return key === 'opus' ? 'opus' : key;
  }
  return null;
}

export function formatSampleRateLabel(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) {
    return '';
  }
  if (hz % 1000 === 0) {
    return `${hz / 1000} kHz`;
  }
  const khz = hz / 1000;
  const text = Number.isInteger(khz * 10) ? khz.toFixed(1) : String(Math.round(khz * 100) / 100);
  return `${text.replace(/\.0$/, '')} kHz`;
}

export function formatBitrateLabel(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) {
    return '';
  }
  const kbps = Math.round(bps / 1000);
  if (kbps <= 0) {
    return '';
  }
  return `${kbps} kbps`;
}

/**
 * Подпись одной дорожки по сохранённым характеристикам.
 * Примеры: `FLAC 24-bit · 96 kHz`, `MP3 320 kbps`, `FLAC`.
 * Никогда не подставляет выдуманные bitrate / bit depth / sample rate.
 */
export function formatAudioTechnicalLabel(meta: AudioTechnicalMetadataInput): string {
  if (!meta) {
    return '';
  }

  const containerLabel = getAudioContainerDisplayLabel(meta.audioContainer);
  if (!containerLabel) {
    return '';
  }

  const container = (meta.audioContainer || '').toLowerCase();
  const bitDepth = positiveInt(meta.audioBitDepth);
  const sampleRate = positiveInt(meta.audioSampleRate);
  const bitrate = positiveInt(meta.audioBitrate);

  const preferLosslessDetail =
    LOSSLESS_CONTAINERS.has(container) || (bitDepth != null && !LOSSY_CONTAINERS.has(container));

  if (preferLosslessDetail) {
    const parts = [containerLabel];
    if (bitDepth != null) {
      parts.push(`${bitDepth}-bit`);
    }
    if (sampleRate != null) {
      const sr = formatSampleRateLabel(sampleRate);
      if (sr) {
        parts.push(sr);
      }
    }
    // `FLAC 24-bit · 96 kHz` — container+bit depth через пробел, sample rate через middot
    if (parts.length <= 2) {
      return parts.join(' ');
    }
    return `${parts[0]} ${parts[1]} · ${parts.slice(2).join(' · ')}`;
  }

  if (LOSSY_CONTAINERS.has(container) || bitrate != null) {
    if (bitrate != null) {
      const br = formatBitrateLabel(bitrate);
      return br ? `${containerLabel} ${br}` : containerLabel;
    }
    return containerLabel;
  }

  return containerLabel;
}

/**
 * Уникальные подписи форматов альбома (lossless-first), через ` · `.
 */
export function formatAlbumAudioTechnicalLabels(
  tracks: Array<AudioTechnicalMetadataInput | null | undefined>
): string {
  const seen = new Set<string>();
  for (const track of tracks) {
    const label = formatAudioTechnicalLabel(track);
    if (label) {
      seen.add(label);
    }
  }

  if (seen.size === 0) {
    return '';
  }

  return [...seen]
    .sort((a, b) => {
      const containerA = a.split(' ')[0] ?? a;
      const containerB = b.split(' ')[0] ?? b;
      const ai = AUDIO_FORMAT_SORT_ORDER.indexOf(containerA);
      const bi = AUDIO_FORMAT_SORT_ORDER.indexOf(containerB);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.localeCompare(b);
    })
    .join(' · ');
}

export function pickAudioTechnicalMetadata(
  track: AudioTechnicalMetadataInput & { src?: string | null }
): AudioTechnicalMetadata {
  return {
    audioContainer: track?.audioContainer ?? null,
    audioCodec: track?.audioCodec ?? null,
    audioBitrate: positiveInt(track?.audioBitrate ?? null),
    audioSampleRate: positiveInt(track?.audioSampleRate ?? null),
    audioBitDepth: positiveInt(track?.audioBitDepth ?? null),
    audioChannels: positiveInt(track?.audioChannels ?? null),
    audioDuration: positiveDurationSeconds(track?.audioDuration ?? null),
    audioFileSize: positiveInt(track?.audioFileSize ?? null),
  };
}
