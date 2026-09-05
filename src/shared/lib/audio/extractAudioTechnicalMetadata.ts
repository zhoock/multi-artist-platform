import {
  buildAudioTechnicalMetadata,
  emptyAudioTechnicalMetadata,
  type AudioTechnicalMetadata,
} from './audioTechnicalMetadata';

/**
 * Извлекает технические характеристики из содержимого аудиофайла (не из расширения).
 * Использует music-metadata (эквивалент ffprobe для веб-клиента).
 * Размер файла берётся из Blob.size (реальный размер загружаемого объекта).
 */
export async function extractAudioTechnicalMetadata(file: Blob): Promise<AudioTechnicalMetadata> {
  const fileSize = typeof file.size === 'number' && file.size > 0 ? file.size : null;

  try {
    const { parseBlob } = await import('music-metadata');
    const metadata = await parseBlob(file, { duration: true });
    return buildAudioTechnicalMetadata({
      container: metadata.format.container,
      codec: metadata.format.codec,
      bitrate: metadata.format.bitrate,
      sampleRate: metadata.format.sampleRate,
      bitsPerSample: metadata.format.bitsPerSample,
      numberOfChannels: metadata.format.numberOfChannels,
      duration: metadata.format.duration,
      fileSize,
    });
  } catch (error) {
    console.warn('⚠️ [extractAudioTechnicalMetadata] Failed to probe audio file:', error);
    return {
      ...emptyAudioTechnicalMetadata(),
      audioFileSize: fileSize,
    };
  }
}
