import { uploadFile } from '@shared/api/storage';
import { uniqueUploadFileSuffix } from '@shared/lib/uniqueUploadFileSuffix';

export async function uploadArticleBlockImage(file: File): Promise<string | null> {
  const fileExtension = file.name.split('.').pop() || 'jpg';
  const baseFileName = file.name.replace(/\.[^/.]+$/, '');
  const fileName = `article_${uniqueUploadFileSuffix()}_${baseFileName}.${fileExtension}`;

  const url = await uploadFile({
    file,
    category: 'articles',
    fileName,
  });

  return url ? fileName : null;
}
