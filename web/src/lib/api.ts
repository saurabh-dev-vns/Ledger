/**
 * Browser client for the Express JSON API (docs/API.md).
 *
 * - Sends the session cookie (same origin, thanks to the Next.js rewrite).
 * - Adds the CSRF header on POST / PATCH / DELETE. The token comes from
 *   GET /api/session and is refreshed on its own if the server rejects it.
 * - Throws ApiError with a message that is safe to show to the person.
 * - A 401 (signed out) sends the browser to /login.
 */

import { hardNavigate } from "@/lib/nav";

export type SessionUser = { id: string; name: string };

export type PendingRestore = {
  name: string;
  purgeAt: string;
  windowDays: number;
};

export type SessionData = {
  user: SessionUser | null;
  csrfToken: string;
  pendingRestore: PendingRestore | null;
};

export type ApiResult<T> = { data: T; message?: string };

export class ApiError extends Error {
  status: number;
  /** Extra data some errors carry (e.g. the report form values on a 400). */
  data?: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

type Envelope<T> = {
  ok?: boolean;
  data?: T;
  message?: string;
  error?: string;
};

const GENERIC_ERROR = "Something went wrong. Please try again.";

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

async function send<T>(
  method: Method,
  path: string,
  body: unknown,
  canRetry: boolean,
): Promise<ApiResult<T>> {
  const changesData = method !== "GET";

  if (changesData && !csrfToken) {
    const session = await send<SessionData>("GET", "/api/session", undefined, false);
    csrfToken = session.data.csrfToken;
  }

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(changesData && csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Check your connection and try again.");
  }

  const json: Envelope<T> | null = await res.json().catch(() => null);

  // Expired CSRF token (e.g. the session was renewed in another tab): get a new one and retry once.
  if (res.status === 403 && changesData && canRetry) {
    csrfToken = null;
    return send<T>(method, path, body, false);
  }

  if (res.status === 401) {
    const isAuthCall = path.startsWith("/api/auth/") || path === "/api/session";
    if (!isAuthCall) hardNavigate("/login");
  }

  if (!res.ok || !json || json.ok === false) {
    throw new ApiError(res.status, json?.error || GENERIC_ERROR, json?.data);
  }

  // Login / register / restore start a fresh session and return a new token.
  const fresh = (json.data as { csrfToken?: unknown } | undefined)?.csrfToken;
  if (typeof fresh === "string") csrfToken = fresh;

  return { data: json.data as T, message: json.message };
}

export const api = {
  get: <T>(path: string) => send<T>("GET", path, undefined, true),
  post: <T = undefined>(path: string, body: unknown = {}) => send<T>("POST", path, body, true),
  patch: <T = undefined>(path: string, body: unknown = {}) => send<T>("PATCH", path, body, true),
  delete: <T = undefined>(path: string) => send<T>("DELETE", path, undefined, true),

  /** Who is signed in. Also stores the CSRF token for later requests. */
  async session(): Promise<SessionData> {
    const { data } = await send<SessionData>("GET", "/api/session", undefined, true);
    csrfToken = data.csrfToken;
    return data;
  },
};
