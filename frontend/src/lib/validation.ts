/** Shared client-side field validators (mirrored by the backend Zod schemas). */

/**
 * Indian phone number: the `91` country code + 10 digits (an optional leading
 * `+`, and spaces/dashes, are allowed). Empty is treated as valid since the
 * contact fields are optional — callers requiring a value should check that
 * separately.
 */
export function phoneError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const cleaned = v.replace(/[\s-]/g, "");
  if (!/^\+?91\d{10}$/.test(cleaned)) {
    return "Enter a valid phone number: +91 followed by 10 digits.";
  }
  return null;
}
