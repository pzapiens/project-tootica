/**
 * Tiny fetch wrapper for talking to the backend.
 *
 * Always use relative `/api/...` paths — next.config.ts rewrites those to the
 * backend origin, so the browser sees a same-origin request (no CORS) and the
 * same code works in dev and prod without changing the URL.
 *
 * `credentials: "include"` makes the browser send/receive the auth cookies
 * (`access_token` / `refresh_token`) the backend sets on login — the app is
 * cookie-based, there are no bearer tokens.
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`/api${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!res.ok) {
    throw await toApiError(res);
  }

  // 204 No Content (e.g. logout) has no body to parse.
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

/**
 * Error thrown by {@link apiFetch} for non-2xx responses. Carries the HTTP
 * status and the backend's human-readable `{ error }` message so callers can
 * branch on `status` (e.g. 401 → bad credentials) and show `message` directly.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Parse the backend error shape into an {@link ApiError}. Validation errors
 * carry an `issues` array with specific, human-readable messages (e.g. which
 * password rule failed) — prefer those over the generic top-level
 * "Validation failed" so the user sees something actionable.
 */
async function toApiError(res: Response): Promise<ApiError> {
  let message = `${res.status} ${res.statusText}`;
  try {
    const body = (await res.json()) as {
      error?: string;
      issues?: Array<{ message?: string }>;
    };
    const issueMessages =
      body?.issues?.map((i) => i.message).filter((m): m is string => Boolean(m)) ?? [];
    if (issueMessages.length > 0) {
      // De-duplicate and join as sentences, so a multi-rule failure is readable.
      message = Array.from(new Set(issueMessages)).join(". ");
      if (!/[.!?]$/.test(message)) message += ".";
    } else if (body?.error) {
      message = body.error;
    }
  } catch {
    // Non-JSON body — keep the status-line fallback.
  }
  return new ApiError(res.status, message);
}

export interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
}

/* --------------------------------------------------------------------- Auth */

export type Role =
  | "SUPER_ADMIN"
  | "CLIENT_ADMIN"
  | "DOCTOR"
  | "RECEPTIONIST"
  | "GUEST_DOCTOR";

/** Public user shape returned by the auth endpoints (never includes secrets). */
export interface PublicUser {
  id: string;
  email: string;
  title: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: Role;
  clinicId: string | null;
  status: "ACTIVE" | "SUSPENDED";
  accessStartDate: string | null;
  accessEndDate: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A clinic (tenant) as returned to the client. */
export interface Clinic {
  id: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED" | "INACTIVE";
  plan: "FREE" | "BASIC" | "PRO" | "ENTERPRISE";
  createdAt: string;
}

/** `POST /auth/login`, `POST /auth/refresh`. */
export interface AuthResponse {
  user: PublicUser;
}

/** `GET /auth/me` — the caller plus their clinic (null for a super admin). */
export interface MeResponse {
  user: PublicUser;
  clinic: Clinic | null;
}

/** A branch (`GET /api/branches`, `GET /api/super-admin/branches`). */
export interface BranchSummary {
  id: string;
  clinicId: string;
  code: string;
  name: string;
  picName: string | null;
  contact: string | null;
}

/** A clinic in the super-admin cross-tenant list (`GET /api/super-admin/clinics`). */
export interface SuperAdminClinic {
  id: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED" | "INACTIVE";
  plan: "FREE" | "BASIC" | "PRO" | "ENTERPRISE";
  createdAt: string;
  picName: string | null;
  contact: string | null;
}

/** Account types offered in the "Add Account" form → backend roles. */
export const ACCOUNT_TYPES = [
  { value: "ADMIN", label: "Admin" },
  { value: "DOCTOR", label: "Doctor" },
  { value: "RECEPTIONIST", label: "Receptionist" },
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number]["value"];

/** Honorific / preference options. */
export const TITLE_OPTIONS = ["Mr", "Mrs", "Ms", "Dr"] as const;

/** Best-effort display name for a user: full name → first name → email local part. */
export function displayName(user: Pick<PublicUser, "firstName" | "lastName" | "email">): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (full) return full;
  return user.email.split("@")[0];
}

/**
 * The honorific to address a user by: "Dr" for doctors (from their role),
 * otherwise their stored title (e.g. "Mr", "Mrs") if any.
 */
export function honorific(user: Pick<PublicUser, "title" | "role">): string {
  if (user.role === "DOCTOR" || user.role === "GUEST_DOCTOR") return "Dr";
  return user.title ?? "";
}

/**
 * First name for greetings, prefixed with "Dr" only for doctors. Non-doctor
 * titles (Mr/Mrs/Ms) are intentionally omitted from greetings.
 */
export function greetingLabel(
  user: Pick<PublicUser, "role" | "firstName" | "email">,
): string {
  const first = user.firstName?.trim() || user.email.split("@")[0];
  const isDoctor = user.role === "DOCTOR" || user.role === "GUEST_DOCTOR";
  return isDoctor ? `Dr ${first}` : first;
}

/** `POST /auth/verify-otp`. */
export interface VerifyOtpResponse {
  resetToken: string;
}

/** Endpoints that only return a status message (forgot/reset/set-password). */
export interface MessageResponse {
  message: string;
}
