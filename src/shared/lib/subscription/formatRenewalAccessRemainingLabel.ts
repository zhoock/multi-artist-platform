import {
  formatRenewalChargeDate,
  getRenewalCountdownRemainingMs,
  type RenewalCountdownDisplay,
} from './renewalCountdown';

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

function applyTemplate(template: string, values: Record<string, string>): string {
  return template.replace(
    /\{(remaining|until|date)\}/g,
    (token) => values[token.slice(1, -1)] ?? ''
  );
}

export function formatRenewalAccessRemainingLabel(params: {
  countdown: RenewalCountdownDisplay;
  targetIso?: string | null;
  lang: 'ru' | 'en';
  now: Date;
  templates: {
    relative: string;
    absolute: string;
  };
}): { label: string; title: string | null } {
  const { countdown, targetIso, lang, now, templates } = params;
  const label = countdown.label;

  if (!label) {
    return { label: '—', title: countdown.title };
  }

  if (countdown.isRelative && !countdown.isOverdue) {
    const remainingMs =
      targetIso && !Number.isNaN(new Date(targetIso).getTime())
        ? (getRenewalCountdownRemainingMs(targetIso, now) ?? 0)
        : 0;
    const until =
      targetIso && remainingMs > 0 ? formatAccessUntilShort(targetIso, lang, remainingMs) : null;
    const remaining = stripRelativePrefix(label, lang);

    if (until) {
      return {
        label: applyTemplate(templates.relative, { remaining, until }),
        title: countdown.title,
      };
    }
  }

  const absoluteDate =
    countdown.isOverdue && targetIso ? (formatRenewalChargeDate(targetIso, lang) ?? label) : label;

  return {
    label: applyTemplate(templates.absolute, { date: absoluteDate }),
    title: countdown.title,
  };
}
