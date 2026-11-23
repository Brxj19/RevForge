// Fixtures for repo settings screens (Phase 4C/D).
import type {
  RepositoryAccessEntry,
  Webhook,
  WebhookDelivery,
} from "~/lib/api/types";
import { USERS } from "./forge";

const T0 = "2026-07-13T20:00:00.000Z";

export const REPO_PERMISSIONS: RepositoryAccessEntry[] = [
  {
    user_id: USERS.brxj19.id,
    display_name: USERS.brxj19.display_name,
    email: USERS.brxj19.email,
    role: "owner",
    source: "org_role",
  },
  {
    user_id: USERS.tatwa.id,
    display_name: USERS.tatwa.display_name,
    email: USERS.tatwa.email,
    role: "admin",
    source: "org_role",
  },
  {
    user_id: "00000000-0000-4000-8000-000000000003",
    display_name: "Priya Sharma",
    email: "priya@sigma.dev",
    role: "write",
    source: "direct",
  },
  {
    user_id: "00000000-0000-4000-8000-000000000004",
    display_name: "Arjun Nair",
    email: "arjun@sigma.dev",
    role: "read",
    source: "org_role",
  },
];

export const WEBHOOKS: Webhook[] = [
  {
    id: "1",
    repository_id: "00000000-0000-4000-a000-000000000001",
    url: "https://ci.sigma.dev/hooks/revforge",
    event_types: ["push", "tag"],
    is_active: true,
    created_by_user_id: USERS.brxj19.id,
    created_at: T0,
    updated_at: "2026-10-01T12:00:00.000Z",
  },
];

export const WEBHOOK_DELIVERIES: WebhookDelivery[] = [
  {
    id: "d1",
    webhook_id: "1",
    event_type: "push",
    request_url: "https://ci.sigma.dev/hooks/revforge",
    response_status_code: 200,
    status: "delivered",
    retry_count: 0,
    error_message: null,
    created_at: "2026-10-20T10:00:00.000Z",
    completed_at: "2026-10-20T10:00:00.184Z",
  },
  {
    id: "d2",
    webhook_id: "1",
    event_type: "push",
    request_url: "https://ci.sigma.dev/hooks/revforge",
    response_status_code: 502,
    status: "failed",
    retry_count: 2,
    error_message: "Bad Gateway",
    created_at: "2026-10-15T14:30:00.000Z",
    completed_at: "2026-10-15T14:30:03.021Z",
  },
  {
    id: "d3",
    webhook_id: "1",
    event_type: "push",
    request_url: "https://ci.sigma.dev/hooks/revforge",
    response_status_code: 502,
    status: "failed",
    retry_count: 2,
    error_message: "Bad Gateway",
    created_at: "2026-10-15T14:00:00.000Z",
    completed_at: "2026-10-15T14:00:03.010Z",
  },
  {
    id: "d4",
    webhook_id: "1",
    event_type: "tag",
    request_url: "https://ci.sigma.dev/hooks/revforge",
    response_status_code: 502,
    status: "failed",
    retry_count: 2,
    error_message: "Bad Gateway",
    created_at: "2026-10-15T13:00:00.000Z",
    completed_at: "2026-10-15T13:00:02.998Z",
  },
  {
    id: "d5",
    webhook_id: "1",
    event_type: "push",
    request_url: "https://ci.sigma.dev/hooks/revforge",
    response_status_code: 204,
    status: "delivered",
    retry_count: 0,
    error_message: null,
    created_at: "2026-10-14T09:00:00.000Z",
    completed_at: "2026-10-14T09:00:00.096Z",
  },
  {
    id: "d6",
    webhook_id: "1",
    event_type: "ping",
    request_url: "https://ci.sigma.dev/hooks/revforge",
    response_status_code: 200,
    status: "delivered",
    retry_count: 0,
    error_message: null,
    created_at: "2026-10-13T12:00:00.000Z",
    completed_at: "2026-10-13T12:00:00.071Z",
  },
];
