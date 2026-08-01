import { writeNavigationToastIntent } from './toastNavigationPersistence';

export function armAccountDeletedToast(): void {
  writeNavigationToastIntent({ kind: 'account-deleted' });
}
