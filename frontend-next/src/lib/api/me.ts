import { request, withQuery } from "./client";
import type {
  AttentionItem,
  ContributionActivity,
  NotificationList,
  PinList,
  PinRef,
} from "./types";

export const MAX_PINS = 8;

export const meApi = {
  contributions: () =>
    request<ContributionActivity>("/me/contributions?range=last_year"),
  // API-GAP: pins — backend endpoint not built yet; served by MSW, with a local fallback in the shell.
  pins: () => request<PinList>("/me/pins"),
  setPins: (items: PinRef[], csrf: string | null) =>
    request<PinList>("/me/pins", {
      method: "PUT",
      json: { items: items.slice(0, MAX_PINS) },
      csrf,
    }),
  // GET /me/attention (normalizes both prototype {kind, detail} and backend {type, description})
  attention: async (): Promise<{ items: AttentionItem[] }> => {
    type RawAttention = {
      kind?: AttentionItem["kind"];
      type?: string;
      title: string;
      detail?: string;
      description?: string;
      href: string;
    };
    const res = await request<{ items: RawAttention[] }>("/me/attention");
    return {
      items: (res.items ?? []).map((item) => {
        const rawKind = item.kind ?? item.type ?? "provisioning";
        const kind: AttentionItem["kind"] =
          rawKind === "stuck_provisioning"
            ? "provisioning"
            : rawKind === "webhook_failing" ||
                rawKind === "provisioning" ||
                rawKind === "review_requested" ||
                rawKind === "changes_requested"
              ? rawKind
              : "provisioning";
        return {
          kind,
          title: item.title,
          detail: item.detail ?? item.description ?? "",
          href: item.href,
        };
      }),
    };
  },
  // API-GAP: notifications — GET /me/notifications
  notifications: (opts?: { unread?: boolean; cursor?: string }) =>
    request<NotificationList>(withQuery("/me/notifications", opts ?? {})),
  // API-GAP: notifications — POST /me/notifications/read
  markNotificationsRead: (ids: string[] | undefined, csrf: string | null) =>
    request<undefined>("/me/notifications/read", {
      method: "POST",
      json: ids ? { ids } : {},
      csrf,
    }),
};
