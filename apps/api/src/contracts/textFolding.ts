/** Lower case with accents removed, so "Telefónica" and "TELEFONICA" read the same. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
