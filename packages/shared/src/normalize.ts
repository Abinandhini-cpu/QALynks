/**
 * Normalises free text for duplicate comparison: case-folded, punctuation
 * removed, whitespace collapsed.
 */
export function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
