import { http, HttpResponse } from "msw";
import type {
  NotificationSettings,
  PersonalAccessToken,
  PersonalAccessTokenCreateResponse,
  SshPublicKey,
  UserPreferences,
  UserProfile,
} from "~/lib/api/types";
import { db } from "../db";
import {
  NOTIFICATION_SETTINGS,
  ORG_NAMES,
  PREFERENCES,
  PROFILE,
  SESSIONS,
  SSH_KEYS,
  TOKENS,
} from "../fixtures/settings";
import { API, apiError, csrfFailure, unauthorized } from "./util";

// Mutable copies for the session
let profile: UserProfile = { ...PROFILE };
let sshKeys: SshPublicKey[] = SSH_KEYS.map((k) => ({ ...k }));
let tokens: PersonalAccessToken[] = TOKENS.map((t) => ({ ...t }));
let notifSettings: NotificationSettings = { ...NOTIFICATION_SETTINGS };
let prefs: UserPreferences = { ...PREFERENCES };
let nextSkId = 10;
let nextTokId = 10;

export function resetSettingsMocks() {
  profile = { ...PROFILE };
  sshKeys = SSH_KEYS.map((k) => ({ ...k }));
  tokens = TOKENS.map((t) => ({ ...t }));
  notifSettings = { ...NOTIFICATION_SETTINGS };
  prefs = { ...PREFERENCES };
  nextSkId = 10;
  nextTokId = 10;
}

export const settingsHandlers = [
  // API-GAP: phase-4a-settings — GET /me/profile
  http.get(`${API}/me/profile`, () => {
    if (!db.session) return unauthorized();
    return HttpResponse.json(profile);
  }),

  // API-GAP: phase-4a-settings — PATCH /me/profile
  http.patch(`${API}/me/profile`, async ({ request }) => {
    if (!db.session) return unauthorized();
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    const body = (await request.json()) as Partial<UserProfile>;
    if (body.display_name !== undefined)
      profile.display_name = body.display_name;
    if (body.email !== undefined) profile.email = body.email;
    if (body.author_aliases !== undefined)
      profile.author_aliases = body.author_aliases;
    return HttpResponse.json(profile);
  }),

  // API-GAP: phase-4a-settings — GET /me/ssh-keys
  http.get(`${API}/me/ssh-keys`, () => {
    if (!db.session) return unauthorized();
    return HttpResponse.json(sshKeys);
  }),

  // API-GAP: phase-4a-settings — POST /me/ssh-keys
  http.post(`${API}/me/ssh-keys`, async ({ request }) => {
    if (!db.session) return unauthorized();
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    const body = (await request.json()) as {
      label: string;
      public_key: string;
    };
    if (!body.public_key?.startsWith("ssh-"))
      return apiError(422, "Key must start with ssh-.", "validation_error");
    nextSkId++;
    const key: SshPublicKey = {
      id: `sk-${String(nextSkId).padStart(3, "0")}`,
      label: body.label || "Untitled key",
      key_type: body.public_key.startsWith("ssh-ed25519")
        ? "ed25519"
        : "rsa-4096",
      fingerprint_sha256: `SHA256:${Math.random().toString(36).slice(2, 14)}`,
      created_at: new Date().toISOString(),
      last_used_at: null,
      revoked_at: null,
    };
    sshKeys = [key, ...sshKeys];
    return HttpResponse.json(key, { status: 201 });
  }),

  // API-GAP: phase-4a-settings — DELETE /me/ssh-keys/:id
  http.delete(`${API}/me/ssh-keys/:id`, ({ params, request }) => {
    if (!db.session) return unauthorized();
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    const key = sshKeys.find((k) => k.id === String(params.id));
    if (!key) return apiError(404, "Key not found.");
    key.revoked_at = new Date().toISOString();
    return new HttpResponse(null, { status: 204 });
  }),

  // API-GAP: phase-4a-settings — POST /me/ssh-keys/:id/restore
  http.post(`${API}/me/ssh-keys/:id/restore`, ({ params, request }) => {
    if (!db.session) return unauthorized();
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    const key = sshKeys.find((k) => k.id === String(params.id));
    if (!key) return apiError(404, "Key not found.");
    key.revoked_at = null;
    return HttpResponse.json(key);
  }),

  // API-GAP: phase-4a-settings — GET /me/tokens
  http.get(`${API}/me/tokens`, () => {
    if (!db.session) return unauthorized();
    const withOrg = tokens.map((t) => ({
      ...t,
      organization_name: t.organization_id
        ? (ORG_NAMES[t.organization_id] ?? null)
        : null,
    }));
    return HttpResponse.json(withOrg);
  }),

  // API-GAP: phase-4a-settings — POST /me/tokens
  http.post(`${API}/me/tokens`, async ({ request }) => {
    if (!db.session) return unauthorized();
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    const body = (await request.json()) as {
      name: string;
      capability: "read" | "write";
      expires_in?: string | null;
    };
    nextTokId++;
    const expiresAt = body.expires_in
      ? new Date(Date.now() + parseDuration(body.expires_in)).toISOString()
      : null;
    const token: PersonalAccessTokenCreateResponse = {
      id: `tok-${String(nextTokId).padStart(3, "0")}`,
      name: body.name || "Untitled",
      token_prefix: `rf_pat_…${nextTokId}x`,
      capability: body.capability,
      organization_id: null,
      repository_id: null,
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
      last_used_at: null,
      revoked_at: null,
      plaintext_token: `rf_pat_${randomHex(32)}`,
    };
    tokens = [token, ...tokens];
    return HttpResponse.json(token, { status: 201 });
  }),

  // API-GAP: phase-4a-settings — DELETE /me/tokens/:id
  http.delete(`${API}/me/tokens/:id`, ({ params, request }) => {
    if (!db.session) return unauthorized();
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    const idx = tokens.findIndex((t) => t.id === String(params.id));
    if (idx === -1) return apiError(404, "Token not found.");
    tokens.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  // API-GAP: phase-4a-settings — GET /sessions
  http.get(`${API}/sessions`, () => {
    if (!db.session) return unauthorized();
    return HttpResponse.json(SESSIONS);
  }),

  // API-GAP: phase-4a-settings — POST /sessions/revoke-others
  http.post(`${API}/sessions/revoke-others`, ({ request }) => {
    if (!db.session) return unauthorized();
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    return new HttpResponse(null, { status: 204 });
  }),

  // API-GAP: phase-4a-settings — DELETE /sessions/:id
  http.delete(`${API}/sessions/:id`, ({ params, request }) => {
    if (!db.session) return unauthorized();
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    const session = SESSIONS.find((s) => s.id === String(params.id));
    if (!session) return apiError(404, "Session not found.");
    if (session.is_current)
      return apiError(409, "Cannot revoke the current session.");
    return new HttpResponse(null, { status: 204 });
  }),

  // API-GAP: phase-4a-settings — GET /me/notification-settings
  http.get(`${API}/me/notification-settings`, () => {
    if (!db.session) return unauthorized();
    return HttpResponse.json(notifSettings);
  }),

  // API-GAP: phase-4a-settings — PUT /me/notification-settings
  http.put(`${API}/me/notification-settings`, async ({ request }) => {
    if (!db.session) return unauthorized();
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    const body = (await request.json()) as NotificationSettings;
    // Preserve locked channels
    for (const key of Object.keys(notifSettings)) {
      if (notifSettings[key]?.locked) {
        body[key] = notifSettings[key]!;
      }
    }
    notifSettings = body;
    return HttpResponse.json(notifSettings);
  }),

  // API-GAP: phase-4a-settings — GET /me/preferences
  http.get(`${API}/me/preferences`, () => {
    if (!db.session) return unauthorized();
    return HttpResponse.json(prefs);
  }),

  // API-GAP: phase-4a-settings — PUT /me/preferences
  http.put(`${API}/me/preferences`, async ({ request }) => {
    if (!db.session) return unauthorized();
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    const body = (await request.json()) as Partial<UserPreferences>;
    prefs = { ...prefs, ...body };
    return HttpResponse.json(prefs);
  }),
];

function parseDuration(d: string): number {
  const match = /^(\d+)([dmy])$/.exec(d);
  if (!match) return 30 * 86400000;
  const n = Number(match[1]);
  if (match[2] === "d") return n * 86400000;
  if (match[2] === "m") return n * 30 * 86400000;
  return n * 365 * 86400000;
}

function randomHex(len: number): string {
  return Array.from({ length: len }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
}
