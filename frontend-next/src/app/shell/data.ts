import { useLocation } from "@solidjs/router";
import {
  createMutation,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import { createEffect, createMemo } from "solid-js";
import {
  ApiError,
  MAX_PINS,
  meApi,
  orgsApi,
  reposApi,
  request,
  type PinRef,
} from "~/lib/api";
import { qk } from "~/lib/query-keys";
import { isReservedSlug } from "~/lib/reserved";
import { showToast } from "~/ui/Toast";
import { useAuth } from "../auth";

export function createOrgsQuery() {
  const auth = useAuth();
  return createQuery(() => ({
    queryKey: qk.orgs,
    queryFn: () => orgsApi.list(),
    enabled: auth.status() === "authenticated",
    staleTime: 60_000,
  }));
}

/** Every repository the viewer can see in their organizations (pin menu, palette projects). */
export function createAllReposQuery() {
  const auth = useAuth();
  const orgs = createOrgsQuery();
  return createQuery(() => ({
    queryKey: [...qk.allRepos, (orgs.data ?? []).map((o) => o.slug).join(",")],
    queryFn: async () => {
      // The list endpoint returns summaries without organization_slug; we know it from the org.
      const lists = await Promise.all(
        (orgs.data ?? []).map(async (o) =>
          (await reposApi.list(o.slug, { includeArchived: true })).map((r) => ({
            ...r,
            organization_slug: o.slug,
          })),
        ),
      );
      return lists.flat();
    },
    enabled: auth.status() === "authenticated" && !!orgs.data,
    staleTime: 60_000,
  }));
}

export function createHealthQuery() {
  return createQuery(() => ({
    queryKey: qk.health,
    queryFn: () => request<{ status: string }>("/api/v1/health"),
    refetchInterval: 60_000,
    retry: false,
  }));
}

/** API-GAP: admin — GET /me/break-glass → active session | null. Only platform admins ask. */
export interface BreakGlassSession {
  id: string;
  org: string;
  repo: string;
  reason: string;
  expires_at: string;
}

export function createBreakGlassQuery() {
  const auth = useAuth();
  return createQuery(() => ({
    queryKey: qk.breakGlass,
    queryFn: async () => {
      try {
        return await request<BreakGlassSession | null>("/me/break-glass");
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.status === 405))
          return null;
        throw e;
      }
    },
    enabled: auth.isPlatformAdmin(),
    staleTime: 30_000,
  }));
}

const pinsKey = (userId: string) => `revforge.pins.${userId}`;

function readLocalPins(userId: string): PinRef[] {
  try {
    const v = JSON.parse(
      localStorage.getItem(pinsKey(userId)) ?? "[]",
    ) as unknown;
    return Array.isArray(v)
      ? (v as PinRef[]).filter(
          (p) => typeof p?.org === "string" && typeof p?.repo === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function writeLocalPins(userId: string, pins: PinRef[]) {
  try {
    localStorage.setItem(pinsKey(userId), JSON.stringify(pins));
  } catch {
    // Storage blocked: pins last for this tab only.
  }
}

/** Server unsupported (endpoint not built yet) → keep pins locally (screen-map: "pins UI with local fallback"). */
const unsupported = (e: unknown) =>
  e instanceof ApiError &&
  (e.status === 404 || e.status === 405 || e.status === 501);

/**
 * Sidebar pins (DESIGN.md §7.10). Server-backed via /me/pins (API-GAP: pins), with a per-user
 * localStorage fallback while the backend endpoint doesn't exist. Max 8, order kept.
 */
export function createPins() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  let local = false;
  const query = createQuery(() => ({
    queryKey: qk.pins,
    queryFn: async () => {
      const id = auth.user()?.id ?? "";
      try {
        local = false;
        return (await meApi.pins()).items;
      } catch (e) {
        if (!unsupported(e)) throw e;
        local = true;
        return readLocalPins(id);
      }
    },
    enabled: auth.status() === "authenticated",
    staleTime: 5 * 60_000,
  }));

  const save = createMutation(() => ({
    mutationFn: async (next: PinRef[]) => {
      const id = auth.user()?.id ?? "";
      if (local) {
        writeLocalPins(id, next);
        return next;
      }
      try {
        return (await meApi.setPins(next, auth.csrf())).items;
      } catch (e) {
        if (!unsupported(e)) throw e;
        local = true;
        writeLocalPins(id, next);
        return next;
      }
    },
    onMutate: async (next: PinRef[]) => {
      await queryClient.cancelQueries({ queryKey: qk.pins });
      const previous = queryClient.getQueryData<PinRef[]>(qk.pins);
      queryClient.setQueryData(qk.pins, next);
      return { previous };
    },
    onError: (_e, _next, ctx) => {
      queryClient.setQueryData(qk.pins, ctx?.previous);
      showToast({ message: "Couldn't update your pins.", tone: "err" });
    },
    onSuccess: (items) => queryClient.setQueryData(qk.pins, items),
  }));

  const pins = () => query.data ?? [];
  const same = (a: PinRef, b: PinRef) => a.org === b.org && a.repo === b.repo;
  const isPinned = (ref: PinRef) => pins().some((p) => same(p, ref));
  const set = (next: PinRef[]) => save.mutate(next.slice(0, MAX_PINS));

  return {
    pins,
    query,
    isPinned,
    max: MAX_PINS,
    full: () => pins().length >= MAX_PINS,
    toggle(ref: PinRef) {
      if (isPinned(ref)) set(pins().filter((p) => !same(p, ref)));
      else if (pins().length >= MAX_PINS)
        showToast({
          message: `You can pin up to ${MAX_PINS} repositories. Unpin one first.`,
          tone: "info",
        });
      else set([...pins(), ref]);
    },
    unpin(ref: PinRef) {
      const before = pins();
      set(before.filter((p) => !same(p, ref)));
      showToast({
        message: `Unpinned ${ref.repo}`,
        tone: "info",
        action: { label: "Undo", onClick: () => set(before) },
      });
    },
  };
}

const LAST_ORG = "revforge.lastOrg";

/** The org in the URL (/:org/:repo, /org/:org), else the last one used, else the first membership. */
export function useCurrentOrg() {
  const location = useLocation();
  const orgs = createOrgsQuery();
  const fromPath = createMemo(() => {
    const seg = location.pathname
      .split("/")
      .filter(Boolean)
      .map(decodeURIComponent);
    if (seg[0] === "org" && seg[1]) return seg[1];
    if (seg.length >= 2 && seg[0] && !isReservedSlug(seg[0])) return seg[0];
    return null;
  });
  createEffect(() => {
    const o = fromPath();
    if (o && orgs.data?.some((x) => x.slug === o)) {
      try {
        localStorage.setItem(LAST_ORG, o);
      } catch {
        // ignore
      }
    }
  });
  const slug = createMemo(() => {
    const list = orgs.data ?? [];
    const p = fromPath();
    if (p && list.some((o) => o.slug === p)) return p;
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_ORG);
    } catch {
      last = null;
    }
    if (last && list.some((o) => o.slug === last)) return last;
    return list[0]?.slug ?? null;
  });
  const org = () => (orgs.data ?? []).find((o) => o.slug === slug()) ?? null;
  return { slug, org, orgs };
}

/** /:org/:repo context for the palette and shortcuts, when the route is inside a repository. */
export function useRepoContext() {
  const location = useLocation();
  return createMemo(() => {
    const seg = location.pathname
      .split("/")
      .filter(Boolean)
      .map(decodeURIComponent);
    if (seg.length >= 2 && seg[0] && seg[1] && !isReservedSlug(seg[0])) {
      const rev = new URLSearchParams(location.search).get("rev") ?? undefined;
      return { org: seg[0], repo: seg[1], rev };
    }
    return null;
  });
}
