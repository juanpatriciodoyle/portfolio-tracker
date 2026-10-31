/** Longest text the engine looks at. A bill is a few pages; anything beyond is noise. */
export const MAX_TEXT_CHARS = 200_000;
const MAX_LINE_CHARS = 400;
const MIN_READABLE_CHARACTERS = 20;

/** Lower case with accents removed, so "Telefónica" and "TELEFONICA" read the same. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Control characters become spaces, line ends are unified, and absurdly long lines are cut. */
export function cleanLines(text: string): string[] {
  return text
    .slice(0, MAX_TEXT_CHARS)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\t/g, ' ')
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim().slice(0, MAX_LINE_CHARS))
    .filter((line) => line.length > 0);
}

/** A scanned PDF has no text layer: a few stray characters do not make a document readable. */
export function hasReadableText(lines: readonly string[]): boolean {
  const readable = lines.join(' ').match(/[\p{L}\p{N}]/gu);
  return (readable?.length ?? 0) >= MIN_READABLE_CHARACTERS;
}
