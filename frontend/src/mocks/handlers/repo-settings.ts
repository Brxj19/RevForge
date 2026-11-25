import { http, HttpResponse } from "msw";
import type {
  RepositoryUpdateRequest,
  Webhook,
  WebhookCreateRequest,
  WebhookCreateResponse,
  WebhookDelivery,
  WebhookSecretRotateResponse,
} from "~/lib/api/types";
import { db, findRepo, nextRequestId, roleFor } from "../db";
import {
  REPO_PERMISSIONS,
  WEBHOOK_DELIVERIES,
  WEBHOOKS,
} from "../fixtures/repo-settings";
import { API, apiError, csrfFailure, notFound, unauthorized } from "./util";

const R = `${API}/organizations/:org/repositories/:repo`;

function requireAdmin(params: Record<string, unknown>) {
  if (!db.session) return unauthorized();
  const r = findRepo(String(params.org), String(params.repo));
  if (!r) return notFound();
  const role = roleFor(db.session, r);
  if (role !== "admin") return apiError(403, "Repository admin required.");
  return null;
}

export const repoSettingsHandlers = [
  // PATCH /organizations/:org/repositories/:repo — update repo settings
  http.patch(R, async ({ request, params }) => {
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    const denied = requireAdmin(params);
    if (denied) return denied;
    const body = (await request.json()) as RepositoryUpdateRequest;
    const r = findRepo(String(params.org), String(params.repo));
    if (!r) return notFound();
    // Return updated detail stub
    return HttpResponse.json({
      id: "00000000-0000-4000-a000-000000000001",
      organization_id: "00000000-0000-4000-9000-000000000001",
      organization_slug: r.org,
      slug: body.slug ?? r.slug,
      display_name: body.display_name ?? r.slug,
      description: body.description ?? r.description,
      visibility: body.visibility ?? r.visibility,
      created_by_user_id: "00000000-0000-4000-8000-000000000001",
      created_at: "2026-07-13T20:00:00.000Z",
      updated_at: new Date().toISOString(),
      archived_at: body.archived ? new Date().toISOString() : null,
      provisioning_state: r.state,
      provisioned_at: r.state === "ready" ? "2026-07-13T20:00:05.000Z" : null,
      is_browsable: r.state === "ready",
      viewer_role: "admin",
      can_manage: true,
      inherited_access: false,
      phase_status: "ready",
    });
  }),

  // DELETE /organizations/:org/repositories/:repo — I37
  http.delete(R, async ({ request, params }) => {
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    const denied = requireAdmin(params);
    if (denied) return denied;
    return new HttpResponse(null, { status: 204 });
  }),

  // GET /organizations/:org/repositories/:repo/permissions — I29
  http.get(`${R}/permissions`, ({ params }) => {
    if (!db.session) return unauthorized();
    const r = findRepo(String(params.org), String(params.repo));
    if (!r) return notFound();
    const role = roleFor(db.session, r);
    if (role !== "admin") return apiError(403, "Repository admin required.");
    return HttpResponse.json(REPO_PERMISSIONS);
  }),

  // PATCH /organizations/:org/repositories/:repo/transport — API-GAP: transport-toggle
  http.patch(`${R}/transport`, async ({ request, params }) => {
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    const denied = requireAdmin(params);
    if (denied) return denied;
    // API-GAP: transport-toggle — accept the body but only return the stub shape
    await request.json();
    // Return the same transport shape as GET R/transport with toggled values
    const r = findRepo(String(params.org), String(params.repo));
    if (!r) return notFound();
    return HttpResponse.json({
      repository: {
        organization_slug: r.org,
        repository_slug: r.slug,
        provisioning_state: r.state,
        is_browsable: r.state === "ready",
        viewer_role: "admin",
        can_read: true,
        can_write: true,
      },
      https: {
        enabled: true,
        clone_url: `https://revforge.sigma.dev/hg/${r.org}/${r.slug}`,
        clone_command: `hg clone https://revforge.sigma.dev/hg/${r.org}/${r.slug}`,
        username_hint: "your-email@sigma.dev",
        password_hint: "Personal access token",
      },
      ssh: {
        enabled: true,
        clone_url: `ssh://hg@revforge.sigma.dev/${r.org}/${r.slug}`,
        clone_command: `hg clone ssh://hg@revforge.sigma.dev/${r.org}/${r.slug}`,
        username: "hg",
        port: 22,
        authorized_keys_path_hint: "/home/hg/.ssh/authorized_keys",
      },
      setup: {
        has_active_token: true,
        has_active_ssh_key: true,
        recommended_next_step: "ready",
      },
    });
  }),

  // --- Webhooks ---

  // GET .../webhooks
  http.get(`${R}/webhooks`, ({ params }) => {
    const denied = requireAdmin(params);
    if (denied) return denied;
    // Only sigma-reckitt has webhook data
    const r = findRepo(String(params.org), String(params.repo));
    if (r && (r.slug === "sigma-reckitt" || r.slug === "payments-api")) {
      return HttpResponse.json(WEBHOOKS);
    }
    return HttpResponse.json([]);
  }),

  // POST .../webhooks — secret returned once (I5, I6)
  http.post(`${R}/webhooks`, async ({ request, params }) => {
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    const denied = requireAdmin(params);
    if (denied) return denied;
    const body = (await request.json()) as WebhookCreateRequest;
    const newWebhook: Webhook = {
      id: String(WEBHOOKS.length + 1),
      repository_id: "00000000-0000-4000-a000-000000000001",
      url: body.url,
      event_types: body.event_types,
      is_active: true,
      created_by_user_id: "00000000-0000-4000-8000-000000000001",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const response: WebhookCreateResponse = {
      webhook: newWebhook,
      secret: `whsec_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
    };
    return HttpResponse.json(response, { status: 201 });
  }),

  // GET .../webhooks/:webhookId
  http.get(`${R}/webhooks/:webhookId`, ({ params }) => {
    const denied = requireAdmin(params);
    if (denied) return denied;
    const wh = WEBHOOKS.find((w) => w.id === String(params.webhookId));
    if (!wh) return notFound();
    return HttpResponse.json(wh);
  }),

  // DELETE .../webhooks/:webhookId
  http.delete(`${R}/webhooks/:webhookId`, async ({ request, params }) => {
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    const denied = requireAdmin(params);
    if (denied) return denied;
    return new HttpResponse(null, { status: 204 });
  }),

  // GET .../webhooks/:webhookId/deliveries
  http.get(`${R}/webhooks/:webhookId/deliveries`, ({ params }) => {
    const denied = requireAdmin(params);
    if (denied) return denied;
    const deliveries = WEBHOOK_DELIVERIES.filter(
      (d) => d.webhook_id === String(params.webhookId),
    );
    return HttpResponse.json(deliveries);
  }),

  // POST .../webhooks/:webhookId/ping
  http.post(`${R}/webhooks/:webhookId/ping`, async ({ request, params }) => {
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    const denied = requireAdmin(params);
    if (denied) return denied;
    const whId = String(params.webhookId);
    const delivery: WebhookDelivery = {
      id: `ping-${nextRequestId()}`,
      webhook_id: whId,
      event_type: "ping",
      request_url: WEBHOOKS.find((w) => w.id === whId)?.url ?? "",
      response_status_code: 200,
      status: "delivered",
      retry_count: 0,
      error_message: null,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };
    return HttpResponse.json(delivery);
  }),

  // POST .../webhooks/:webhookId/rotate-secret
  http.post(
    `${R}/webhooks/:webhookId/rotate-secret`,
    async ({ request, params }) => {
      const csrf = csrfFailure(request);
      if (csrf) return csrf;
      const denied = requireAdmin(params);
      if (denied) return denied;
      const response: WebhookSecretRotateResponse = {
        secret: `whsec_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      };
      return HttpResponse.json(response);
    },
  ),

  // POST .../webhooks/:webhookId/deliveries/:deliveryId/redeliver
  http.post(
    `${R}/webhooks/:webhookId/deliveries/:deliveryId/redeliver`,
    async ({ request, params }) => {
      const csrf = csrfFailure(request);
      if (csrf) return csrf;
      const denied = requireAdmin(params);
      if (denied) return denied;
      const whId = String(params.webhookId);
      const dlId = String(params.deliveryId);
      const original = WEBHOOK_DELIVERIES.find((d) => d.id === dlId);
      const delivery: WebhookDelivery = {
        id: `redeliver-${nextRequestId()}`,
        webhook_id: whId,
        event_type: original?.event_type ?? "push",
        request_url: original?.request_url ?? "",
        response_status_code: 200,
        status: "delivered",
        retry_count: 0,
        error_message: null,
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      };
      return HttpResponse.json(delivery);
    },
  ),
];
