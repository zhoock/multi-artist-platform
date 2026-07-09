export { getTrackById } from './getTrackById';

export function formatTrackText(text: string): string {
  let formatted = text.replace(/\t/g, ' ');

  formatted = formatted.replace(/,([^\s\n\d])/g, ', $1');
  formatted = formatted.replace(/;([^\s\n])/g, '; $1');
  formatted = formatted.replace(/:([^\s\n])/g, ': $1');

  formatted = formatted.replace(/[ ]+/g, ' ');
  formatted = formatted.replace(/\n{3,}/g, '\n\n');

  formatted = formatted
    .split('\n')
    .map((line) => line.trim())
    .join('\n');

  return formatted.trim();
}

export function splitTextIntoLines(text: string): string[] {
  return text.split('\n').filter((line) => line.trim().length > 0);
}

export function countLines(text: string): number {
  return splitTextIntoLines(text).length;
}
