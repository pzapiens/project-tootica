/** Shared client-side field validators (mirrored by the backend Zod schemas). */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Email address. An empty value is allowed unless `required` (callers may still
 * create with an empty optional email), but any non-empty value MUST be a valid
 * email format — otherwise an error is returned even for optional fields.
 */
export function emailError(value: string, required = false): string | null {
  const v = value.trim();
  if (!v) return required ? "Email is required." : null;
  if (!EMAIL_RE.test(v)) return "Enter a valid email address.";
  return null;
}

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

/**
 * The country code is always +91. Mobile inputs store just the 10-digit local
 * part; these helpers extract it from a stored value, validate it, and compose
 * the full `+91…` value to send to the backend.
 */

/** Strip any `+91`/`91`/formatting from a stored value → the 10-digit local part. */
export function phoneLocalPart(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  const local = digits.startsWith("91") && digits.length > 10 ? digits.slice(2) : digits;
  return local.slice(0, 10);
}

/** Keep only up to 10 digits (used as the mobile input's onChange filter). */
export function phoneDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

/**
 * Validate the 10-digit local part. Empty is allowed unless `required`; a
 * non-empty value must be exactly 10 digits.
 */
export function phoneDigitsError(digits: string, required = false): string | null {
  const d = (digits ?? "").replace(/\D/g, "");
  if (!d) return required ? "Contact number is required." : null;
  if (d.length !== 10) return "Enter a valid mobile number: 10 digits after +91.";
  return null;
}

/** Compose the stored/submitted value (`+91##########`) from the local part. */
export function phoneWithCc(digits: string): string {
  const d = phoneDigits(digits);
  return d ? `+91${d}` : "";
}
