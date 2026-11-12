export function formatNotificationRelativeTime(iso: string, lang: string): string {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diff = now - d.getTime();
    const sec = Math.floor(diff / 1000);
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
    const day = Math.floor(hr / 24);
    const locale = lang === 'ru' ? 'ru' : 'en';
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    if (min < 1) return rtf.format(0, 'second');
    if (min < 60) return rtf.format(-min, 'minute');
    if (hr < 24) return rtf.format(-hr, 'hour');
    if (day < 7) return rtf.format(-day, 'day');
    return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return iso;
  }
}
