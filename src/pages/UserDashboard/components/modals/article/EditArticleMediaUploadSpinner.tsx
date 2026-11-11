import clsx from 'clsx';

import { DashboardSpinner } from '@shared/ui/dashboard';

type EditArticleMediaUploadSpinnerProps = {
  className?: string;
};

/** Same spinner animation as carousel add slot (`edit-article-v2__carousel-edit-add-spinner`). */
export function EditArticleMediaUploadSpinner({ className }: EditArticleMediaUploadSpinnerProps) {
  return (
    <DashboardSpinner className={clsx('edit-article-v2__carousel-edit-add-spinner', className)} />
  );
}
