// Auth-aware HTTP client for the Django DRF + SimpleJWT API.
// Handles token storage, silent refresh on 401, and the device-id header.

const ACCESS_KEY = "ycomps.access";
const REFRESH_KEY = "ycomps.refresh";

// Resolve an absolute URL for the Django API. In production this is baked to
// the same-origin base (nginx proxies /api, /media), so the browser stays
// same-origin with no CORS. In local dev it points straight at the Django
// server (exposed via CORS) — mirroring how WebSockets already connect.
export function apiUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");
  return `${base}/api/v1${path}`;
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function setTokens(access: string, refresh?: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCESS_KEY, access);
  if (refresh) window.localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

function deviceId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem("ycomps.deviceId");
  if (!id) {
    id = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem("ycomps.deviceId", id);
  }
  return id;
}

let refreshPromise: Promise<boolean> | null = null;

export async function refreshAccessToken(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(apiUrl("/auth/token/refresh/"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh }),
        });
        const data = await res.json();
        if (res.ok && data.access) {
          setTokens(data.access, data.refresh || refresh);
          return true;
        }
        clearTokens();
        return false;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown, message?: string) {
    super(message || `Request failed (${status})`);
    this.status = status;
    this.detail = detail;
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** By default fetch() buffers JSON; use raw for multipart etc. */
  raw?: boolean;
}

export function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const doFetch = async (): Promise<Response> => {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-YCOMPS-Device-ID": deviceId(),
      ...(options.headers || {}),
    };
    if (options.body !== undefined && !(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    return fetch(apiUrl(path), {
      method: options.method || "GET",
      headers,
      body:
        options.body instanceof FormData
          ? options.body
          : options.body !== undefined
            ? JSON.stringify(options.body)
            : undefined,
    });
  };

  return doFetch().then(async (res) => {
    if (res.status === 401 && getRefreshToken()) {
      const ok = await refreshAccessToken();
      if (ok) {
        const retry = await doFetch();
        return handleResponse<T>(retry);
      }
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
    return handleResponse<T>(res);
  });
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    throw new ApiError(res.status, data);
  }
  return data as T;
}

export function apiErrorMessage(err: unknown, fallback = "Something went wrong."): string {
  if (err instanceof ApiError) {
    if (typeof err.detail === "string") return err.detail;
    const d = err.detail as Record<string, unknown> | null;
    if (d && typeof d.detail === "string") return d.detail;
    if (d) {
      for (const value of Object.values(d)) {
        if (Array.isArray(value)) {
          const s = value.filter((v): v is string => typeof v === "string").join(", ");
          if (s) return s;
        }
        if (typeof value === "string") return value;
      }
    }
    return fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "X-YCOMPS-Device-ID": deviceId(),
      ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
    },
    body: form,
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}
