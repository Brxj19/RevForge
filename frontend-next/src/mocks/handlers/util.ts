import { HttpResponse } from "msw";
import { db, nextRequestId } from "../db";

export const API = "*/api/v1";

/** Same error envelope as the backend (I1). */
export function apiError(
  status: number,
  message: string,
  code = "http_error",
  details?: unknown,
) {
  const request_id = nextRequestId();
  return HttpResponse.json(
    { error: { code, message, request_id, ...(details ? { details } : {}) } },
    { status, headers: { "X-Request-ID": request_id } },
  );
}

export const notFound = () => apiError(404, "Not Found");
export const unauthorized = () => apiError(401, "Authentication required.");

/** Mirrors require_csrf: mutations need the session's token. */
export function csrfFailure(request: Request) {
  return request.headers.get("X-CSRF-Token") === db.csrf
    ? null
    : apiError(403, "CSRF token missing or invalid.", "csrf_failed");
}
