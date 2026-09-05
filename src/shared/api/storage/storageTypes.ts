import type { ImageCategory } from '@config/user';

export interface UploadFileOptions {
  userId?: string;
  category: ImageCategory;
  file: File | Blob;
  fileName: string;
  contentType?: string;
  upsert?: boolean;
  /** При замене обложки статьи — ключ предыдущего файла в БД (имя в Storage), чтобы удалить старые объекты с другим baseName */
  previousImageKey?: string;
}

export interface GetFileUrlOptions {
  userId?: string;
  category: ImageCategory;
  fileName: string;
  expiresIn?: number;
}
