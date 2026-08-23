/**
 * Client-side mirror of the backend password policy (see
 * `backend/src/modules/auth/schema.ts`): at least 8 characters, with an
 * uppercase letter, a number and a special character. Used for immediate,
 * per-keystroke feedback — the backend still enforces the same rules on submit.
 */

export interface PasswordRule {
  /** Short label for the live checklist, e.g. "An uppercase letter". */
  label: string;
  /** Full-sentence message for the submit-time error. */
  message: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    label: "At least 8 characters",
    message: "Password must be at least 8 characters.",
    test: (p) => p.length >= 8,
  },
  {
    label: "An uppercase letter",
    message: "Password must contain an uppercase letter.",
    test: (p) => /[A-Z]/.test(p),
  },
  {
    label: "A number",
    message: "Password must contain a number.",
    test: (p) => /[0-9]/.test(p),
  },
  {
    label: "A special character",
    message: "Password must contain a special character.",
    test: (p) => /[^A-Za-z0-9]/.test(p),
  },
];

/** Per-rule pass/fail for a password — drives the live checklist. */
export function checkPassword(password: string): Array<{ label: string; met: boolean }> {
  return PASSWORD_RULES.map((rule) => ({ label: rule.label, met: rule.test(password) }));
}

/** Returns the first unmet-rule message, or null when the password is valid. */
export function passwordPolicyError(password: string): string | null {
  return PASSWORD_RULES.find((rule) => !rule.test(password))?.message ?? null;
}
