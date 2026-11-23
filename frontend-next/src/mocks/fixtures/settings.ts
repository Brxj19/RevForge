import type {
  NotificationSettings,
  PersonalAccessToken,
  SshPublicKey,
  UserPreferences,
  UserProfile,
  UserSessionInfo,
} from "~/lib/api/types";

const days = (n: number) =>
  new Date(Date.UTC(2026, 9, 5) - n * 86400000).toISOString();

export const PROFILE: UserProfile = {
  display_name: "Brxj19",
  email: "brajesh@sigma.dev",
  author_aliases: ["Brajesh <brajesh@laptop>"],
};

export const SSH_KEYS: SshPublicKey[] = [
  {
    id: "sk-001",
    label: "MacBook Pro",
    key_type: "ed25519",
    fingerprint_sha256: "SHA256:9vK2xR4mLq8YpZ5sN7hW3jD6tA0cBfEg1iO2uP4pQ1",
    created_at: days(90),
    last_used_at: days(0.7),
    revoked_at: null,
  },
  {
    id: "sk-002",
    label: "Old work laptop",
    key_type: "rsa-4096",
    fingerprint_sha256: "SHA256:Xc81kM3vT6nRqW9yL2jF8pB5sH0dE4gI7aU1oN3aa0",
    created_at: days(400),
    last_used_at: days(120),
    revoked_at: days(90),
  },
];

export const TOKENS: PersonalAccessToken[] = [
  {
    id: "tok-001",
    name: "CI runner",
    token_prefix: "rf_pat_…497x",
    capability: "write",
    organization_id: "00000000-0000-4000-9000-000000000001",
    repository_id: null,
    expires_at: days(-23),
    created_at: days(60),
    last_used_at: days(0.08),
    revoked_at: null,
  },
  {
    id: "tok-002",
    name: "Laptop backup",
    token_prefix: "rf_pat_…847x",
    capability: "read",
    organization_id: "00000000-0000-4000-9000-000000000001",
    repository_id: null,
    expires_at: days(-180),
    created_at: days(30),
    last_used_at: days(21),
    revoked_at: null,
  },
  {
    id: "tok-003",
    name: "Old deploy key",
    token_prefix: "rf_pat_…21x",
    capability: "read",
    organization_id: "00000000-0000-4000-9000-000000000002",
    repository_id: null,
    expires_at: days(4),
    created_at: days(400),
    last_used_at: days(60),
    revoked_at: null,
  },
];

export const SESSIONS: UserSessionInfo[] = [
  {
    id: "sess-001",
    created_at: days(5),
    expires_at: days(-25),
    revoked_at: null,
    last_seen_at: new Date().toISOString(),
    is_current: true,
  },
  {
    id: "sess-002",
    created_at: days(3),
    expires_at: days(-27),
    revoked_at: null,
    last_seen_at: days(3),
    is_current: false,
  },
];

export const NOTIFICATION_SETTINGS: NotificationSettings = {
  review_requested: { in_app: true, email: true },
  review_on_your_pr: { in_app: true, email: true },
  mentions: { in_app: true, email: true },
  merged_or_closed: { in_app: true, email: false },
  webhook_failures: { in_app: true, email: true },
  sign_in_new_device: { in_app: true, email: true, locked: true },
};

export const PREFERENCES: UserPreferences = {
  accent: "default",
  graph_default: true,
  compact: false,
  reduce_motion: false,
};

/** Token org display names, keyed by org ID. */
export const ORG_NAMES: Record<string, string> = {
  "00000000-0000-4000-9000-000000000001": "sigma",
  "00000000-0000-4000-9000-000000000002": "acme-labs",
};
