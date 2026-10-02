import { uploadFile } from '@shared/api/storage';
import { sanitizeFileName } from '@shared/lib/sanitizeFileName';
import { uniqueUploadFileSuffix } from '@shared/lib/uniqueUploadFileSuffix';

export async function uploadArticleBlockImage(file: File): Promise<string | null> {
  const fileExtension = file.name.split('.').pop() || 'jpg';
  const baseFileName = file.name.replace(/\.[^/.]+$/, '');
  const rawFileName = `article_${uniqueUploadFileSuffix()}_${baseFileName}.${fileExtension}`;
  // upload-file stores sanitizeFileName(rawFileName). Persist that object key, not the raw photo name.
  const imageKey = sanitizeFileName(rawFileName);

  const url = await uploadFile({
    file,
    category: 'articles',
    fileName: imageKey,
  });

  return url ? imageKey : null;
}
