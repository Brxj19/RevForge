import {
  createMutation,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import { useAuth } from "~/app/auth";
import { isRetryable, reposApi } from "~/lib/api";
import type {
  RepositoryUpdateRequest,
  TransportUpdateRequest,
  WebhookCreateRequest,
} from "~/lib/api/types";
import { qk } from "~/lib/query-keys";
import { showToast } from "~/ui/Toast";

// --- Queries ---

export function useRepoPermissions(org: () => string, repo: () => string) {
  return createQuery(() => ({
    queryKey: qk.repoPermissions(org(), repo()),
    queryFn: () => reposApi.permissions(org(), repo()),
    retry: (count: number, err: unknown) => count < 2 && isRetryable(err),
  }));
}

export function useWebhooks(org: () => string, repo: () => string) {
  return createQuery(() => ({
    queryKey: qk.webhooks(org(), repo()),
    queryFn: () => reposApi.webhooks(org(), repo()),
    retry: (count: number, err: unknown) => count < 2 && isRetryable(err),
  }));
}

export function useWebhook(
  org: () => string,
  repo: () => string,
  id: () => string,
) {
  return createQuery(() => ({
    queryKey: qk.webhook(org(), repo(), id()),
    queryFn: () => reposApi.webhook(org(), repo(), id()),
    retry: (count: number, err: unknown) => count < 2 && isRetryable(err),
    enabled: Boolean(id()),
  }));
}

export function useWebhookDeliveries(
  org: () => string,
  repo: () => string,
  id: () => string,
) {
  return createQuery(() => ({
    queryKey: qk.webhookDeliveries(org(), repo(), id()),
    queryFn: () => reposApi.webhookDeliveries(org(), repo(), id()),
    retry: (count: number, err: unknown) => count < 2 && isRetryable(err),
    enabled: Boolean(id()),
  }));
}

// --- Mutations ---

export function useUpdateRepo(org: () => string, repo: () => string) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn: (data: RepositoryUpdateRequest) =>
      reposApi.update(org(), repo(), data, auth.csrf()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.repo(org(), repo()) });
      void queryClient.invalidateQueries({ queryKey: qk.repos(org()) });
      showToast({ message: "Changes saved" });
    },
  }));
}

export function useDeleteRepo(org: () => string, repo: () => string) {
  const auth = useAuth();
  return createMutation(() => ({
    mutationFn: () => reposApi.deleteRepo(org(), repo(), auth.csrf()),
  }));
}

export function useArchiveRepo(org: () => string, repo: () => string) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn: (archived: boolean) =>
      reposApi.archive(org(), repo(), archived, auth.csrf()),
    onSuccess: (_data, archived) => {
      void queryClient.invalidateQueries({ queryKey: qk.repo(org(), repo()) });
      void queryClient.invalidateQueries({ queryKey: qk.repos(org()) });
      showToast({
        message: archived ? "Repository archived" : "Repository unarchived",
      });
    },
  }));
}

export function useUpdateTransport(org: () => string, repo: () => string) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn: (data: TransportUpdateRequest) =>
      reposApi.updateTransport(org(), repo(), data, auth.csrf()),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: qk.transport(org(), repo()),
      });
      showToast({ message: "Transport settings updated" });
    },
  }));
}

export function useUpsertPermission(org: () => string, repo: () => string) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn: (data: { user: string; role: "read" | "write" | "admin" }) =>
      reposApi.updatePermission(org(), repo(), data, auth.csrf()),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: qk.repoPermissions(org(), repo()),
      });
      showToast({ message: "Access granted", tone: "ok" });
    },
  }));
}

export function useRevokePermission(org: () => string, repo: () => string) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn: (userId: string) =>
      reposApi.removePermission(org(), repo(), userId, auth.csrf()),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: qk.repoPermissions(org(), repo()),
      });
      showToast({ message: "Access revoked" });
    },
  }));
}

export function useCreateWebhook(org: () => string, repo: () => string) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn: (data: WebhookCreateRequest) =>
      reposApi.createWebhook(org(), repo(), data, auth.csrf()),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: qk.webhooks(org(), repo()),
      });
    },
  }));
}

export function useDeleteWebhook(org: () => string, repo: () => string) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn: (webhookId: string) =>
      reposApi.deleteWebhook(org(), repo(), webhookId, auth.csrf()),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: qk.webhooks(org(), repo()),
      });
      showToast({ message: "Webhook deleted" });
    },
  }));
}

export function usePingWebhook(org: () => string, repo: () => string) {
  const auth = useAuth();
  return createMutation(() => ({
    mutationFn: (webhookId: string) =>
      reposApi.pingWebhook(org(), repo(), webhookId, auth.csrf()),
    onSuccess: () => {
      showToast({ message: "Ping sent", tone: "info" });
    },
  }));
}

export function useRotateWebhookSecret(org: () => string, repo: () => string) {
  const auth = useAuth();
  return createMutation(() => ({
    mutationFn: (webhookId: string) =>
      reposApi.rotateWebhookSecret(org(), repo(), webhookId, auth.csrf()),
  }));
}

export function useRedeliverWebhook(org: () => string, repo: () => string) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn: (params: { webhookId: string; deliveryId: string }) =>
      reposApi.redeliverWebhook(
        org(),
        repo(),
        params.webhookId,
        params.deliveryId,
        auth.csrf(),
      ),
    onSuccess: (_data, params) => {
      void queryClient.invalidateQueries({
        queryKey: qk.webhookDeliveries(org(), repo(), params.webhookId),
      });
      showToast({ message: "Redelivered", tone: "info" });
    },
  }));
}
