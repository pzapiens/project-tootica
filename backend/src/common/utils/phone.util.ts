/**
 * Normalizes a raw phone string to a comparable canonical form: keeps a single
 * leading "+" (if present) and the digits, dropping spaces, dashes, parens and
 * other separators. So "+1 (415) 555-0100" and "+1-415-555-0100" both become
 * "+14155550100". Used both when persisting `User.phone` and when resolving a
 * phone-based login, so the two always match. Returns null for empty input.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  return hasPlus ? `+${digits}` : digits;
}

/**
 * Heuristic: does this identifier look like an email (contains "@") rather than
 * a phone number? Used to route a single login identifier field to the right
 * lookup. Phone validation proper happens via normalization + the DB lookup.
 */
export function looksLikeEmail(identifier: string): boolean {
  return identifier.includes('@');
}
