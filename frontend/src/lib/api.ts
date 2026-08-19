/**
 * Tiny fetch wrapper for talking to the backend.
 *
 * Always use relative `/api/...` paths — next.config.ts rewrites those to the
 * backend origin, so the browser sees a same-origin request (no CORS) and the
 * same code works in dev and prod without changing the URL.
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`/api${path.startsWith("/") ? path : `/${path}`}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status} ${res.statusText}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
}
