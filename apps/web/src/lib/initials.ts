/** The letters of a monogram badge: first and last name, so "Juan Patricio Doyle" is "JD". Empty when there is no name. */
export function initialsOf(fullName: string | null | undefined): string {
  const words = (fullName ?? '').trim().split(/\s+/).filter((word) => word !== '');
  if (words.length === 0) return '';
  const letter = (word: string) => (word.codePointAt(0) === undefined ? '' : String.fromCodePoint(word.codePointAt(0) as number).toLocaleUpperCase());
  return words.length === 1 ? letter(words[0]) : letter(words[0]) + letter(words[words.length - 1]);
}
