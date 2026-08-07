import { useMemo, type ReactNode } from 'react';
import { Calendar } from 'lucide-react';

import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { getRenewalCountdownRemainingMs } from '@shared/lib/subscription/renewalCountdown';
import {
  useRenewalCountdown,
  useRenewalCountdownClock,
} from '@shared/lib/subscription/useRenewalCountdown';

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
  nextChargeAt?: string | null;
  expiresAt?: string | null;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function stripRelativePrefix(label: string, lang: 'ru' | 'en'): string {
  if (lang === 'ru' && label.startsWith('через ')) return label.slice(6);
  if (lang === 'en' && label.startsWith('in ')) return label.slice(3);
  return label;
}

function formatAccessUntilShort(
  iso: string,
  lang: 'ru' | 'en',
  remainingMs: number
): string | null {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;

    if (remainingMs > 0 && remainingMs < ONE_DAY_MS) {
      return date.toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    return date.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return null;
  }
}

function renderTemplateWithHighlights(
  template: string,
  values: Record<string, ReactNode>
): ReactNode {
  const tokenPattern = /\{(remaining|until|date)\}/;
  const parts = template.split(tokenPattern);

  return parts.map((part, index) => {
    if (part in values) {
      return (
        <BillingModalDateHighlight key={`${part}-${index}`}>
          {values[part as keyof typeof values]}
        </BillingModalDateHighlight>
      );
    }

    return part ? <span key={`text-${index}`}>{part}</span> : null;
  });
}

export function DisableAutoRenewConfirmModal({
  isOpen,
  nextChargeAt,
  expiresAt,
  loading = false,
  onCancel,
  onConfirm,
}: DisableAutoRenewConfirmModalProps) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const t = ui?.dashboard?.collection;
  const now = useRenewalCountdownClock();
  const renewalCountdown = useRenewalCountdown(nextChargeAt, expiresAt, lang);

  const copy = useMemo(
    () => ({
      title: t?.billingDisableAutoRenewTitle ?? 'Отключить автопродление?',
      intro:
        t?.billingDisableAutoRenewIntro ??
        'После отключения автопродления новые списания выполняться не будут.',
      accessTitle: t?.billingDisableAutoRenewAccessTitle ?? 'Доступ сохранится до конца периода',
      accessBodyRelative:
        t?.billingDisableAutoRenewAccessBodyRelative ??
        'Доступ сохранится ещё {remaining} (до {until})',
      accessBodyAbsolute:
        t?.billingDisableAutoRenewAccessBodyAbsolute ?? 'Доступ сохранится до {date}',
      afterNoteLine1:
        t?.billingDisableAutoRenewAfterNoteLine1 ??
        'После окончания текущего периода поддержка завершится.',
      afterNoteLine2:
        t?.billingDisableAutoRenewAfterNoteLine2 ?? 'Включить автопродление можно в любой момент.',
      confirm: t?.billingDisableAutoRenewConfirm ?? 'Отключить автопродление',
      cancel: ui?.buttons?.cancel ?? (lang === 'en' ? 'Cancel' : 'Отмена'),
      close: ui?.buttons?.articleLockedDialogClose ?? (lang === 'en' ? 'Close' : 'Закрыть'),
    }),
    [lang, t, ui?.buttons?.articleLockedDialogClose, ui?.buttons?.cancel]
  );

  const accessBody = useMemo(() => {
    const label = renewalCountdown.label;
    if (!label) return '—';

    if (renewalCountdown.isRelative && !renewalCountdown.isOverdue) {
      const targetIso = renewalCountdown.source === 'nextChargeAt' ? nextChargeAt : expiresAt;
      const remainingMs =
        targetIso && !Number.isNaN(new Date(targetIso).getTime())
          ? (getRenewalCountdownRemainingMs(targetIso, now) ?? 0)
          : 0;
      const until =
        targetIso && remainingMs > 0 ? formatAccessUntilShort(targetIso, lang, remainingMs) : null;
      const remaining = stripRelativePrefix(label, lang);

      if (until) {
        return renderTemplateWithHighlights(copy.accessBodyRelative, { remaining, until });
      }
    }

    return renderTemplateWithHighlights(copy.accessBodyAbsolute, { date: label });
  }, [
    copy.accessBodyAbsolute,
    copy.accessBodyRelative,
    expiresAt,
    lang,
    nextChargeAt,
    now,
    renewalCountdown.isOverdue,
    renewalCountdown.isRelative,
    renewalCountdown.label,
    renewalCountdown.source,
  ]);

  return (
    <BillingModalShell
      isOpen={isOpen}
      titleId="billing-disable-autorenew-title"
      title={copy.title}
      closeLabel={copy.close}
      loading={loading}
      onClose={onCancel}
      cancelLabel={copy.cancel}
      confirmLabel={copy.confirm}
      onConfirm={onConfirm}
    >
      <BillingModalIntro>{copy.intro}</BillingModalIntro>

      <BillingModalInfoCard icon={Calendar} title={copy.accessTitle}>
        <BillingModalInfoText title={renewalCountdown.title ?? undefined}>
          {accessBody}
        </BillingModalInfoText>
      </BillingModalInfoCard>

      <BillingModalNote>{copy.afterNoteLine1}</BillingModalNote>
      <BillingModalNote>{copy.afterNoteLine2}</BillingModalNote>
    </BillingModalShell>
  );
}
