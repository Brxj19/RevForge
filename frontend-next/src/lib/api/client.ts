import type { ApiErrorDetail } from "./types";

/**
 * Error thrown for every non-2xx response and for network failures (status 0).
 * Carries the envelope's code and request id so 5xx screens can show a reference (I1).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly details?: ApiErrorDetail[];

  constructor(
    message: string,
    status: number,
    extra: {
      code?: string;
      requestId?: string;
      details?: ApiErrorDetail[];
    } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = extra.code;
    this.requestId = extra.requestId;
    this.details = extra.details;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

/**
 * Builds API paths with every interpolated value passed through encodeURIComponent (F7):
 * path`/organizations/${org}/repositories/${repo}` never lets a slug add path segments.
 */
export function path(
  strings: TemplateStringsArray,
  ...values: (string | number)[]
): string {
  return strings.reduce(
    (acc, s, i) =>
      acc + s + (i < values.length ? encodeSegment(values[i]) : ""),
    "",
  );
}

/**
 * encodeURIComponent leaves "." and ".." alone, and URL resolution treats them (and %2E%2E) as dot
 * segments: …/repositories/.. would call …/organizations/sigma/. No valid slug is a dot segment,
 * so refuse to build the request at all.
 */
function encodeSegment(value: string | number | undefined): string {
  const s = String(value ?? "");
  if (s === "." || s === "..")
    throw new ApiError("Invalid path segment.", 400, { code: "invalid_path" });
  return encodeURIComponent(s);
}

/** Appends a query string, dropping undefined/null/empty values. */
export function withQuery(
  p: string,
  query: Record<string, string | number | boolean | null | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query))
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  const qs = params.toString();
  return qs ? `${p}?${qs}` : p;
}

const BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
export const API_PREFIX = "/api/v1";

export interface RequestOptions extends Omit<RequestInit, "body"> {
  /** CSRF token for state-changing requests (from useAuth().csrf()). */
  csrf?: string | null;
  /** JSON body. */
  json?: unknown;
  body?: BodyInit | null;
  /** "blob" returns the raw body (downloads); errors still parse the JSON envelope. */
  responseType?: "json" | "blob";
}

/** Absolute URL for a path relative to /api/v1, for <img src> and download links that bypass request(). */
export function apiUrl(p: string): string {
  return `${BASE}${p.startsWith("/api") ? p : `${API_PREFIX}${p}`}`;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

interface EnvelopeLike {
  error?: {
    code?: string;
    message?: string;
    request_id?: string;
    details?: ApiErrorDetail[];
  };
  detail?: unknown;
}

/**
 * The single HTTP entry point (architecture.md §3.1). Same-origin by default (`/api` is proxied in
 * dev), credentials included, JSON in and out, CSRF header on mutations, error envelope parsed.
 * `p` is relative to /api/v1 unless it starts with "/api" or "/health".
 */
export async function request<T>(
  p: string,
  options: RequestOptions = {},
): Promise<T> {
  const { csrf, json, headers: init, responseType, ...rest } = options;
  const method = (rest.method ?? "GET").toUpperCase();
  const headers = new Headers(init);
  headers.set("Accept", responseType === "blob" ? "*/*" : "application/json");
  let body = rest.body;
  if (json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(json);
  }
  if (!SAFE_METHODS.has(method) && csrf) headers.set("X-CSRF-Token", csrf);

  const url = `${BASE}${p.startsWith("/api") || p.startsWith("/health") ? p : `${API_PREFIX}${p}`}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      method,
      headers,
      body,
      credentials: "include",
    });
  } catch (cause) {
    throw new ApiError(
      "Can't reach the forge. Check your connection and try again.",
      0,
      {
        code: "network_error",
        details:
          cause instanceof Error ? [{ message: cause.message }] : undefined,
      },
    );
  }

  if (!response.ok) {
    let payload: EnvelopeLike | undefined;
    try {
      payload = (await response.json()) as EnvelopeLike;
    } catch {
      payload = undefined;
    }
    const env =
      payload && typeof payload === "object" ? payload.error : undefined;
    const fallback =
      typeof payload?.detail === "string" ? payload.detail : undefined;
    throw new ApiError(
      env?.message ?? fallback ?? `Request failed (${response.status}).`,
      response.status,
      {
        code: env?.code,
        requestId:
          env?.request_id ?? response.headers.get("X-Request-ID") ?? undefined,
        details: env?.details,
      },
    );
  }

  if (responseType === "blob") return (await response.blob()) as T;
  if (response.status === 204 || response.headers.get("Content-Length") === "0")
    return undefined as T;
  const type = response.headers.get("Content-Type") ?? "";
  if (!type.includes("json")) return (await response.text()) as T;
  return (await response.json()) as T;
}

/** True for errors worth retrying: network failures and 5xx (F3). Bugs and bad JSON are not. */
export function isRetryable(error: unknown): boolean {
  return (
    error instanceof ApiError && (error.status === 0 || error.status >= 500)
  );
}
