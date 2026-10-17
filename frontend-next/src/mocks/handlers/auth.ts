import { http, HttpResponse } from "msw";
import { db, USERS, type UserKey } from "../db";
import { API, apiError, csrfFailure, unauthorized } from "./util";

const publicUser = (key: UserKey) => {
  const { password: _password, ...user } = USERS[key];
  return user;
};

export const authHandlers = [
  http.get(`${API}/auth/me`, () =>
    db.session ? HttpResponse.json(publicUser(db.session)) : unauthorized(),
  ),
  http.get(`${API}/auth/csrf`, () =>
    HttpResponse.json({ csrf_token: db.csrf }),
  ),
  http.post(`${API}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
    };
    const key = (Object.keys(USERS) as UserKey[]).find(
      (k) => USERS[k].email === body.email?.toLowerCase(),
    );
    // Same response for unknown email and wrong password (no account enumeration).
    if (!key || USERS[key].password !== body.password)
      return apiError(401, "Invalid email or password.", "invalid_credentials");
    db.session = key;
    db.csrf = `mock-csrf-${key}`;
    return HttpResponse.json({ user: publicUser(key), csrf_token: db.csrf });
  }),
  http.post(`${API}/auth/logout`, ({ request }) => {
    const bad = csrfFailure(request);
    if (bad) return bad;
    db.session = null;
    return new HttpResponse(null, { status: 204 });
  }),
  http.post(`${API}/auth/register`, () =>
    apiError(
      403,
      "Registration is closed on this demo forge.",
      "registration_closed",
    ),
  ),
];
