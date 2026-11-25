import {
  createMutation,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import { useAuth } from "~/app/auth";
import {
  adminApi,
  ApiError,
  type AdminAuditParams,
  type AdminOrgsParams,
  type AdminReposParams,
  type AdminUsersParams,
  type StartBreakGlassRequest,
} from "~/lib/api";
import { qk } from "~/lib/query-keys";
import { showToast } from "~/ui/Toast";

export function useAdminOverview() {
  return createQuery(() => ({
    queryKey: qk.adminOverview,
    queryFn: () => adminApi.overview(),
    staleTime: 30_000,
  }));
}

export function useAdminHealth() {
  return createQuery(() => ({
    queryKey: qk.adminHealth,
    queryFn: () => adminApi.health(),
    staleTime: 15_000,
  }));
}

export function useAdminUsers(params: () => AdminUsersParams) {
  return createQuery(() => {
    const p = params();
    return {
      queryKey: qk.adminUsers({
        q: p.q || undefined,
        status: p.status && p.status !== "all" ? p.status : undefined,
        limit: p.limit,
        offset: p.offset,
      }),
      queryFn: () => adminApi.users(p),
      staleTime: 15_000,
    };
  });
}

export function useAdminOrgs(params: () => AdminOrgsParams) {
  return createQuery(() => {
    const p = params();
    return {
      queryKey: qk.adminOrgs({
        q: p.q || undefined,
        limit: p.limit,
        offset: p.offset,
      }),
      queryFn: () => adminApi.organizations(p),
      staleTime: 30_000,
    };
  });
}

export function useAdminRepos(params: () => AdminReposParams) {
  return createQuery(() => {
    const p = params();
    return {
      queryKey: qk.adminRepos({
        q: p.q || undefined,
        state: p.state && p.state !== "all" ? p.state : undefined,
        limit: p.limit,
        offset: p.offset,
      }),
      queryFn: () => adminApi.repositories(p),
      staleTime: 15_000,
    };
  });
}

export function useAdminAudit(params: () => AdminAuditParams) {
  return createQuery(() => {
    const p = params();
    return {
      queryKey: qk.adminAudit({
        severity: p.severity || undefined,
        category: p.category || undefined,
        limit: p.limit,
        offset: p.offset,
      }),
      queryFn: () => adminApi.audit(p),
      staleTime: 15_000,
    };
  });
}

export function useAdminBreakGlass() {
  return createQuery(() => ({
    queryKey: qk.adminBreakGlass,
    queryFn: () => adminApi.breakGlass(),
    staleTime: 15_000,
  }));
}

export function useSuspendUserMutation() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn: (input: { id: string; reason: string; displayName: string }) =>
      adminApi.suspendUser(input.id, input.reason, auth.csrf()),
    onSuccess: (_res, input) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      void queryClient.invalidateQueries({ queryKey: qk.adminOverview });
      void queryClient.invalidateQueries({ queryKey: ["admin", "audit"] });
      showToast({ message: `${input.displayName} suspended`, tone: "ok" });
    },
    onError: (err) => {
      showToast({
        message:
          err instanceof ApiError ? err.message : "Couldn't suspend account.",
        tone: "err",
      });
    },
  }));
}

export function useReactivateUserMutation() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn: (input: { id: string; displayName: string }) =>
      adminApi.reactivateUser(input.id, auth.csrf()),
    onSuccess: (_res, input) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      void queryClient.invalidateQueries({ queryKey: qk.adminOverview });
      void queryClient.invalidateQueries({ queryKey: ["admin", "audit"] });
      showToast({ message: `${input.displayName} reactivated`, tone: "ok" });
    },
    onError: (err) => {
      showToast({
        message:
          err instanceof ApiError
            ? err.message
            : "Couldn't reactivate account.",
        tone: "err",
      });
    },
  }));
}

export function useRevokeSessionsMutation() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn: (input: { id: string; displayName: string }) =>
      adminApi.revokeUserSessions(input.id, auth.csrf()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "audit"] });
      showToast({ message: "Sessions revoked", tone: "ok" });
    },
    onError: (err) => {
      showToast({
        message:
          err instanceof ApiError ? err.message : "Couldn't revoke sessions.",
        tone: "err",
      });
    },
  }));
}

export function useRetryProvisioningMutation() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn: (id: string) => adminApi.retryProvisioning(id, auth.csrf()),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["admin", "repositories"],
      });
      void queryClient.invalidateQueries({ queryKey: qk.adminOverview });
      void queryClient.invalidateQueries({ queryKey: ["admin", "audit"] });
      showToast({ message: "Provisioning restarted", tone: "info" });
    },
    onError: (err) => {
      showToast({
        message:
          err instanceof ApiError
            ? err.message
            : "Couldn't restart provisioning.",
        tone: "err",
      });
    },
  }));
}

export function useResetProvisioningMutation() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn: (id: string) => adminApi.resetProvisioning(id, auth.csrf()),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["admin", "repositories"],
      });
      void queryClient.invalidateQueries({ queryKey: qk.adminOverview });
      void queryClient.invalidateQueries({ queryKey: ["admin", "audit"] });
      showToast({ message: "Marked as failed", tone: "info" });
    },
    onError: (err) => {
      showToast({
        message:
          err instanceof ApiError
            ? err.message
            : "Couldn't reset provisioning.",
        tone: "err",
      });
    },
  }));
}

export function useStartBreakGlassMutation() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn: (body: StartBreakGlassRequest) =>
      adminApi.startBreakGlass(body, auth.csrf()),
    onSuccess: (session) => {
      queryClient.setQueryData(qk.breakGlass, {
        id: session.id,
        org: session.org,
        repo: session.repo,
        reason: session.reason,
        expires_at: session.expires_at,
      });
      void queryClient.invalidateQueries({ queryKey: qk.breakGlass });
      void queryClient.invalidateQueries({ queryKey: qk.adminBreakGlass });
      void queryClient.invalidateQueries({ queryKey: qk.adminOverview });
      void queryClient.invalidateQueries({ queryKey: ["admin", "audit"] });
      showToast({
        message: `Break-glass session started on ${session.org}/${session.repo}`,
        tone: "info",
      });
    },
    onError: (err) => {
      showToast({
        message:
          err instanceof ApiError
            ? err.message
            : "Couldn't start break-glass session.",
        tone: "err",
      });
    },
  }));
}

export function useEndBreakGlassMutation() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn: (id: string) => adminApi.endBreakGlass(id, auth.csrf()),
    onSuccess: () => {
      queryClient.setQueryData(qk.breakGlass, null);
      void queryClient.invalidateQueries({ queryKey: qk.breakGlass });
      void queryClient.invalidateQueries({ queryKey: qk.adminBreakGlass });
      void queryClient.invalidateQueries({ queryKey: qk.adminOverview });
      void queryClient.invalidateQueries({ queryKey: ["admin", "audit"] });
      showToast({ message: "Break-glass session ended", tone: "info" });
    },
    onError: (err) => {
      showToast({
        message:
          err instanceof ApiError
            ? err.message
            : "Couldn't end break-glass session.",
        tone: "err",
      });
    },
  }));
}
