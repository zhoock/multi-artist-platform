export type BlockImagePendingUpload = {
  status: 'uploading' | 'error';
  previewUrl: string;
  errorMessage?: string;
};
