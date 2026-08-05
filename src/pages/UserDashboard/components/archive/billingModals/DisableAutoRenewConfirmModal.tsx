import { useMemo } from 'react';
import { AlertCircle, Calendar } from 'lucide-react';

import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';

import {
  BillingModalDateHighlight,
  BillingModalInfoCard,
  BillingModalInfoText,
  BillingModalIntro,
  BillingModalNote,
  BillingModalShell,
} from './BillingModalShell';

export type DisableAutoRenewConfirmModalProps = {
  isOpen: boolean;
  expiresLabel: string | null;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DisableAutoRenewConfirmModal({
  isOpen,
  expiresLabel,
  loading = false,
  onCancel,
  onConfirm,
}: DisableAutoRenewConfirmModalProps) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const t = ui?.dashboard?.collection;

  const copy = useMemo(
    () => ({
      title: t?.billingDisableAutoRenewTitle ?? 'Отключить автопродление?',
      intro:
        t?.billingDisableAutoRenewIntro ??
        'Автопродление позволяет продлевать поддержку автоматически по окончании оплаченного периода.',
      accessTitle: t?.billingDisableAutoRenewAccessTitle ?? 'Доступ сохранится до конца периода',
      accessBodyTemplate:
        t?.billingDisableAutoRenewAccessBody ??
        'Вы по-прежнему сможете использовать коллекцию до {date}.',
      afterNote:
        t?.billingDisableAutoRenewAfterNote ??
        'После этой даты подписка не продлится автоматически. Вы сможете возобновить поддержку в любой момент.',
      confirm: t?.billingDisableAutoRenewConfirm ?? 'Отключить автопродление',
      footerNote: t?.billingModalImmediateEffect ?? 'Изменения вступят в силу немедленно',
      cancel: ui?.buttons?.cancel ?? (lang === 'en' ? 'Cancel' : 'Отмена'),
      close: ui?.buttons?.articleLockedDialogClose ?? (lang === 'en' ? 'Close' : 'Закрыть'),
    }),
    [lang, t, ui?.buttons?.articleLockedDialogClose, ui?.buttons?.cancel]
  );

  const date = expiresLabel ?? '—';
  const accessBodyParts = copy.accessBodyTemplate.split('{date}');

  return (
    <BillingModalShell
      isOpen={isOpen}
      titleId="billing-disable-autorenew-title"
      headerIcon={AlertCircle}
      title={copy.title}
      closeLabel={copy.close}
      loading={loading}
      onClose={onCancel}
      footerNote={copy.footerNote}
      cancelLabel={copy.cancel}
      confirmLabel={copy.confirm}
      onConfirm={onConfirm}
    >
      <BillingModalIntro>{copy.intro}</BillingModalIntro>

      <BillingModalInfoCard icon={Calendar} title={copy.accessTitle}>
        <BillingModalInfoText>
          {accessBodyParts[0]}
          <BillingModalDateHighlight>{date}</BillingModalDateHighlight>
          {accessBodyParts[1] ?? ''}
        </BillingModalInfoText>
      </BillingModalInfoCard>

      <BillingModalNote>{copy.afterNote}</BillingModalNote>
    </BillingModalShell>
  );
}
