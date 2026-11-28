import { path, request } from "./client";
import type {
  NotificationSettings,
  PersonalAccessToken,
  PersonalAccessTokenCreateResponse,
  SshPublicKey,
  UserPreferences,
  UserProfile,
  UserSessionInfo,
} from "./types";

export const settingsApi = {
  // Profile
  getProfile: () => request<UserProfile>("/me/profile"),
  updateProfile: (data: Partial<UserProfile>, csrf: string | null) =>
    request<UserProfile>("/me/profile", { method: "PATCH", json: data, csrf }),

  // SSH keys
  listSshKeys: () => request<SshPublicKey[]>("/me/ssh-keys"),
  addSshKey: (
    data: { label: string; public_key: string },
    csrf: string | null,
  ) =>
    request<SshPublicKey>("/me/ssh-keys", {
      method: "POST",
      json: data,
      csrf,
    }),
  removeSshKey: (id: string, csrf: string | null) =>
    request<undefined>(path`/me/ssh-keys/${id}`, { method: "DELETE", csrf }),
  restoreSshKey: (id: string, csrf: string | null) =>
    request<SshPublicKey>(path`/me/ssh-keys/${id}/restore`, {
      method: "POST",
      csrf,
    }),

  // Access tokens
  listTokens: () => request<PersonalAccessToken[]>("/me/tokens"),
  createToken: (
    data: {
      name: string;
      capability: "read" | "write";
      expires_in?: string | null;
    },
    csrf: string | null,
  ) =>
    request<PersonalAccessTokenCreateResponse>("/me/tokens", {
      method: "POST",
      json: data,
      csrf,
    }),
  revokeToken: (id: string, csrf: string | null) =>
    request<undefined>(path`/me/tokens/${id}`, { method: "DELETE", csrf }),

  // Sessions
  listSessions: () => request<UserSessionInfo[]>("/sessions"),
  revokeOtherSessions: (csrf: string | null) =>
    request<undefined>("/sessions/revoke-others", { method: "POST", csrf }),
  revokeSession: (id: string, csrf: string | null) =>
    request<undefined>(path`/sessions/${id}`, { method: "DELETE", csrf }),

  // Notification settings
  getNotificationSettings: () =>
    request<NotificationSettings>("/me/notification-settings"),
  updateNotificationSettings: (
    data: NotificationSettings,
    csrf: string | null,
  ) =>
    request<NotificationSettings>("/me/notification-settings", {
      method: "PUT",
      json: data,
      csrf,
    }),

  // Preferences (accent, graph default, compact, reduce motion)
  getPreferences: () => request<UserPreferences>("/me/preferences"),
  updatePreferences: (data: Partial<UserPreferences>, csrf: string | null) =>
    request<UserPreferences>("/me/preferences", {
      method: "PUT",
      json: data,
      csrf,
    }),
};
