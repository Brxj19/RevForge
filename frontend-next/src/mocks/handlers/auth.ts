import { http, HttpResponse } from "msw";
import { isReservedSlug } from "~/lib/reserved";
import { db, USERS, type UserKey } from "../db";
import { API, apiError, csrfFailure, unauthorized } from "./util";

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/;

const publicUser = (key: UserKey) => {
  const { password: _password, ...user } = USERS[key];
  return user;
};

export const authHandlers = [
  http.get(`${API}/auth/me`, () => {
    if (db.sessionIdleExpired) {
      return apiError(
        401,
        "Your session expired after 30 minutes without activity.",
        "session_idle_timeout",
        undefined,
        { reason: "idle_timeout" },
      );
    }
    return db.session
      ? HttpResponse.json(publicUser(db.session))
      : unauthorized();
  }),
  http.get(`${API}/auth/csrf`, () =>
    HttpResponse.json({ csrf_token: db.csrf }),
  ),
  http.post(`${API}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      remember_me?: boolean;
    };
    const email = (body.email ?? "").trim().toLowerCase();

    if (email === "locked@sigma.dev" || db.loginLocked[email]) {
      return apiError(
        429,
        "Too many sign-in attempts. Try again later.",
        "login_locked",
        undefined,
        { headers: { "Retry-After": "840" } },
      );
    }

    if (email === "suspended@sigma.dev") {
      return apiError(403, "This account is suspended.", "account_suspended");
    }

    if (email === "unverified@sigma.dev") {
      return apiError(
        403,
        "Verify your email before signing in.",
        "email_not_verified",
      );
    }

    const key = (Object.keys(USERS) as UserKey[]).find(
      (k) => USERS[k].email === email,
    );

    if (key && db.adminUserState[USERS[key].id]?.is_active === false) {
      return apiError(403, "This account is suspended.", "account_suspended");
    }

    // Same response for unknown email and wrong password (no account enumeration).
    if (!key || USERS[key].password !== body.password) {
      const failures = (db.loginFailures[email] ?? 0) + 1;
      db.loginFailures[email] = failures;
      if (failures >= 5) {
        db.loginLocked[email] = true;
        return apiError(
          429,
          "Too many sign-in attempts. Try again later.",
          "login_locked",
          undefined,
          { headers: { "Retry-After": "840" } },
        );
      }
      return apiError(401, "Invalid email or password.", "invalid_credentials");
    }

    Reflect.deleteProperty(db.loginFailures, email);
    Reflect.deleteProperty(db.loginLocked, email);
    db.sessionIdleExpired = false;
    db.session = key;
    db.csrf = `mock-csrf-${key}`;
    return HttpResponse.json({ user: publicUser(key), csrf_token: db.csrf });
  }),
  http.post(`${API}/auth/logout`, ({ request }) => {
    const bad = csrfFailure(request);
    if (bad) return bad;
    db.session = null;
    db.sessionIdleExpired = false;
    return new HttpResponse(null, { status: 204 });
  }),
  http.post(`${API}/auth/register`, async ({ request }) => {
    const body = (await request.json()) as {
      email?: string;
      display_name?: string;
      password?: string;
      handle?: string;
    };
    const email = (body.email ?? "").trim().toLowerCase();
    const displayName = (body.display_name ?? "").trim();
    const password = body.password ?? "";
    const handle = body.handle?.trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return apiError(422, "Enter a valid email address.", "validation_error");
    }
    if (!displayName) {
      return apiError(422, "Name is required.", "validation_error");
    }
    if (password.length < 12) {
      return apiError(
        422,
        "Password must be at least 12 characters.",
        "validation_error",
      );
    }
    if (handle) {
      if (isReservedSlug(handle)) {
        return apiError(422, "That username is reserved.", "handle_reserved");
      }
      if (!HANDLE_RE.test(handle)) {
        return apiError(
          422,
          "Use 2 to 39 lowercase letters, numbers or dashes.",
          "validation_error",
        );
      }
      if (Object.values(USERS).some((u) => u.handle === handle)) {
        return apiError(409, "That username is already taken.", "handle_taken");
      }
    }

    db.pendingVerifications[`verify-${email}`] = email;
    return HttpResponse.json(
      {
        status: "accepted" as const,
        message:
          "If that address can be used on this forge, we’ve sent a link to finish setting up your account.",
      },
      { status: 202 },
    );
  }),
  http.post(`${API}/auth/verify-email`, async ({ request }) => {
    const body = (await request.json()) as { token?: string };
    const token = body.token?.trim() ?? "";
    if (token === "valid-verify-token" || token in db.pendingVerifications) {
      Reflect.deleteProperty(db.pendingVerifications, token);
      return HttpResponse.json({ verified: true });
    }
    return apiError(
      400,
      "That verification link is invalid or has expired.",
      "invalid_or_expired_token",
    );
  }),
  http.post(`${API}/auth/verify-email/resend`, async () => {
    return HttpResponse.json(
      {
        status: "accepted" as const,
        message:
          "If that address can be used on this forge, we’ve sent a link to finish setting up your account.",
      },
      { status: 202 },
    );
  }),
  http.post(`${API}/auth/password-reset`, async () => {
    return HttpResponse.json(
      {
        status: "accepted" as const,
        message:
          "If an account uses that address, it has a reset link now.",
      },
      { status: 202 },
    );
  }),
  http.post(`${API}/auth/password-reset/confirm`, async ({ request }) => {
    const body = (await request.json()) as {
      token?: string;
      new_password?: string;
    };
    const token = body.token?.trim() ?? "";
    const newPassword = body.new_password ?? "";
    if (newPassword.length < 12) {
      return apiError(
        422,
        "Password must be at least 12 characters.",
        "validation_error",
      );
    }
    if (token === "valid-reset-token" || token in db.pendingResets) {
      Reflect.deleteProperty(db.pendingResets, token);
      return HttpResponse.json({ reset: true });
    }
    return apiError(
      400,
      "That reset link is invalid or has expired.",
      "invalid_or_expired_token",
    );
  }),
];
