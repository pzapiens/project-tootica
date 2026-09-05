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
  let res = await rawFetch(path, init);

  // The access token is short-lived (15m); a longer-lived refresh cookie can
  // silently renew it. On a 401, refresh once and retry so a mid-session expiry
  // (e.g. the availability check fired after a while on a form) doesn't surface
  // as an error. Skip for the auth endpoints that must not loop / re-auth.
  if (res.status === 401 && !skipRefresh(path)) {
    const renewed = await refreshSession();
    if (renewed) res = await rawFetch(path, init);
  }

  if (!res.ok) {
    throw await toApiError(res);
  }

  // 204 No Content (e.g. logout) has no body to parse.
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

/** The underlying request: prefixes `/api`, sends cookies + the branch header. */
function rawFetch(path: string, init?: RequestInit): Promise<Response> {
  const branchCode = currentBranchCode();
  const clinicId = activeClinicId();
  return fetch(`/api${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      // Tells the backend which branch is being viewed, so doctors,
      // appointments and analytics are partitioned per branch. Taken from the
      // `[code]` segment of the current dashboard URL.
      ...(branchCode ? { "X-Branch-Code": branchCode } : {}),
      // Super admins have no clinic of their own; this names the clinic they're
      // drilling into so tenant routes resolve to it. Ignored by the backend for
      // every other role (they're scoped by their own token), so it's safe to
      // always attach when present.
      ...(clinicId ? { "X-Clinic-Id": clinicId } : {}),
      ...init?.headers,
    },
  });
}

// Don't try to refresh for the refresh call itself (would loop) or login (a 401
// there means bad credentials, not an expired session).
function skipRefresh(path: string): boolean {
  return path.startsWith("/auth/refresh") || path.startsWith("/auth/login");
}

// A single in-flight refresh shared by concurrent 401s, so a burst of expired
// requests triggers exactly one `/auth/refresh`.
let refreshInFlight: Promise<boolean> | null = null;
function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch("/api/auth/refresh", { method: "POST", credentials: "include" })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/**
 * The active branch code — the `[code]` segment of a
 * `/clinic-selection/{code}/…` dashboard URL. Returns null outside that area
 * (e.g. login, clinic selection), where requests stay clinic-wide.
 */
function currentBranchCode(): string | null {
  if (typeof window === "undefined") return null;
  const match = window.location.pathname.match(/\/clinic-selection\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// Super-admin only: the clinic being viewed. A super admin has no clinic of
// their own, so tenant-scoped requests must name one explicitly (X-Clinic-Id).
// Persisted in sessionStorage so it survives dashboard navigation / refresh
// within the tab; scoped to the tab so two clinics can be open side by side.
const ACTIVE_CLINIC_KEY = "tootica.activeClinicId";

/** Remember the clinic a super admin is drilling into (see {@link activeClinicId}). */
export function setActiveClinicId(clinicId: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(ACTIVE_CLINIC_KEY, clinicId);
}

/** Forget the drilled-into clinic (on logout or returning to the clinic list). */
export function clearActiveClinicId(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(ACTIVE_CLINIC_KEY);
}

function activeClinicId(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(ACTIVE_CLINIC_KEY);
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
  /** Branch a doctor/receptionist is pinned to (null for clinic-wide admins). */
  branchId: string | null;
  status: "ACTIVE" | "SUSPENDED";
  /** True until the user completes the forced first-login password reset. */
  mustResetPassword: boolean;
  /** When the user accepted the Terms & Conditions (null until they have). */
  termsAcceptedAt: string | null;
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
  /** Human-friendly code, e.g. "CL-000123". */
  code: string | null;
  name: string;
  status: "ACTIVE" | "SUSPENDED" | "INACTIVE";
  plan: "FREE" | "BASIC" | "PRO" | "ENTERPRISE";
  createdAt: string;
  picName: string | null;
  contact: string | null;
}

/**
 * A staff account under a clinic (`GET /api/super-admin/clinics/:id/accounts`).
 * Used by the super-admin "Manage Accounts" popup.
 */
export interface ClinicAccount {
  id: string;
  email: string;
  title: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: Role;
  status: "ACTIVE" | "SUSPENDED";
  /** Branch a doctor/receptionist is assigned to (null for clinic admins). */
  branchId: string | null;
  branchName: string | null;
  branchCode: string | null;
  createdAt: string;
}

/** Human-readable label for a role (e.g. shown as a badge in the accounts list). */
export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  CLIENT_ADMIN: "Admin",
  DOCTOR: "Doctor",
  RECEPTIONIST: "Receptionist",
  GUEST_DOCTOR: "Guest Doctor",
};

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

/**
 * `POST /api/super-admin/accounts` — the created account plus the one-time
 * temporary password to hand to the new user (shown once, never retrievable).
 */
export interface CreatedAccount {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  phone: string | null;
  role: Role;
  clinicId: string | null;
  status: "ACTIVE" | "SUSPENDED";
  temporaryPassword: string;
  /** Whether the temporary password was emailed to the new user. */
  emailSent: boolean;
}

/** `GET /api/analytics/summary` — clinic counts + appointment status breakdown. */
export interface AnalyticsSummary {
  patients: number;
  doctors: number;
  appointments: number;
  upcomingAppointments: number;
  byStatus: {
    total: number;
    completed: number;
    pending: number;
    cancelled: number;
  };
}

/** Backend appointment status enum. */
export type AppointmentStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

/**
 * A row from `GET /api/appointments` — the appointment with its patient and
 * doctor joined (names resolved) for the dashboard table / calendar.
 */
export interface AppointmentListItem {
  id: string;
  /** Human-friendly code, e.g. "APT-20260830-0001". */
  code: string | null;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  /** Structured consultation type (e.g. "Teeth Whitening"); null if unset. */
  consultationType: string | null;
  /** Where the enquiry came from (e.g. "Google Search"); null if unset. */
  sourceOfEnquiry: string | null;
  notes: string | null;
  patient: {
    id: string;
    code: string | null;
    name: string;
    phone: string | null;
    email: string | null;
    dob: string | null;
    gender: string | null;
  };
  doctor: {
    id: string;
    name: string | null;
    specialization: string | null;
  };
}

/** A patient record (`GET`/`POST /api/patients`). */
export interface Patient {
  id: string;
  /** Human-friendly code, e.g. "PAT-000001". */
  code: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  gender: string | null;
  dob: string | null;
  medicalNotes: string | null;
  createdAt: string;
}

/** A doctor with a resolved display name (`GET /api/doctors`). */
export interface DoctorSummary {
  id: string;
  /** Human-friendly code, e.g. "DOC-000001". */
  code: string | null;
  userId: string;
  name: string | null;
  email: string | null;
  /**
   * `DOCTOR` = an employed doctor with a login (managed via the account flow);
   * `GUEST_DOCTOR` = a visiting doctor added on the Doctors page (editable here).
   */
  role: Role;
  specialization: string | null;
  licenseNumber: string | null;
  phone: string | null;
  bio: string | null;
  branchId: string | null;
  branchName: string | null;
  branchCode: string | null;
  createdAt: string;
}

/** One doctor's availability for a day (`GET /api/appointments/availability`). */
export interface DoctorAvailability {
  id: string;
  name: string | null;
  specialization: string | null;
  bookings: { start: string; end: string; patientName: string }[];
  /** Free for the requested slot; null when no from/to was given. */
  available: boolean | null;
  reason: "outside-hours" | "conflict" | "break" | null;
}

/** `GET /api/appointments/availability` response. */
export interface AvailabilityResponse {
  businessHours: { open: string; close: string };
  /** Clinic breaks (e.g. lunch) to block out on the availability chart. */
  breaks: { start: string; end: string; label: string }[];
  date: string;
  /** Whether the requested slot is within business hours; null when no slot. */
  withinHours: boolean | null;
  doctors: DoctorAvailability[];
}

/** `POST /auth/verify-otp`. */
export interface VerifyOtpResponse {
  resetToken: string;
}

/** Endpoints that only return a status message (forgot/reset/set-password). */
export interface MessageResponse {
  message: string;
}
