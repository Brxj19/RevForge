import {
  createMutation,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import { useAuth } from "~/app/auth";
import { isRetryable, settingsApi } from "~/lib/api";
import { qk } from "~/lib/query-keys";
import { showToast } from "~/ui/Toast";

export function useProfile() {
  return createQuery(() => ({
    queryKey: qk.profile,
    queryFn: () => settingsApi.getProfile(),
    retry: (count: number, err: unknown) => count < 2 && isRetryable(err),
  }));
}

export function useSaveProfile() {
  const auth = useAuth();
  const qc = useQueryClient();
  return createMutation(() => ({
    mutationFn: (data: Parameters<typeof settingsApi.updateProfile>[0]) =>
      settingsApi.updateProfile(data, auth.csrf()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.profile });
      showToast({ message: "Profile saved" });
    },
  }));
}

export function useSshKeys() {
  return createQuery(() => ({
    queryKey: qk.sshKeys,
    queryFn: () => settingsApi.listSshKeys(),
    retry: (count: number, err: unknown) => count < 2 && isRetryable(err),
  }));
}

export function useAddSshKey() {
  const auth = useAuth();
  const qc = useQueryClient();
  return createMutation(() => ({
    mutationFn: (data: { label: string; public_key: string }) =>
      settingsApi.addSshKey(data, auth.csrf()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.sshKeys });
      showToast({ message: "SSH key added" });
    },
  }));
}

export function useRemoveSshKey() {
  const auth = useAuth();
  const qc = useQueryClient();
  return createMutation(() => ({
    mutationFn: (id: string) => settingsApi.removeSshKey(id, auth.csrf()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.sshKeys });
      showToast({ message: "Key removed" });
    },
  }));
}

export function useRestoreSshKey() {
  const auth = useAuth();
  const qc = useQueryClient();
  return createMutation(() => ({
    mutationFn: (id: string) => settingsApi.restoreSshKey(id, auth.csrf()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.sshKeys });
      showToast({ message: "Key restored" });
    },
  }));
}

export function useTokens() {
  return createQuery(() => ({
    queryKey: qk.tokens,
    queryFn: () => settingsApi.listTokens(),
    retry: (count: number, err: unknown) => count < 2 && isRetryable(err),
  }));
}

export function useCreateToken() {
  const auth = useAuth();
  const qc = useQueryClient();
  return createMutation(() => ({
    mutationFn: (data: Parameters<typeof settingsApi.createToken>[0]) =>
      settingsApi.createToken(data, auth.csrf()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.tokens });
    },
  }));
}

export function useRevokeToken() {
  const auth = useAuth();
  const qc = useQueryClient();
  return createMutation(() => ({
    mutationFn: (id: string) => settingsApi.revokeToken(id, auth.csrf()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.tokens });
      showToast({ message: "Token revoked" });
    },
  }));
}

export function useSessions() {
  return createQuery(() => ({
    queryKey: qk.sessions,
    queryFn: () => settingsApi.listSessions(),
    retry: (count: number, err: unknown) => count < 2 && isRetryable(err),
  }));
}

export function useRevokeOtherSessions() {
  const auth = useAuth();
  const qc = useQueryClient();
  return createMutation(() => ({
    mutationFn: () => settingsApi.revokeOtherSessions(auth.csrf()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.sessions });
      showToast({ message: "Other sessions signed out" });
    },
  }));
}

export function useNotificationSettings() {
  return createQuery(() => ({
    queryKey: qk.notificationSettings,
    queryFn: () => settingsApi.getNotificationSettings(),
    retry: (count: number, err: unknown) => count < 2 && isRetryable(err),
  }));
}

export function useSaveNotificationSettings() {
  const auth = useAuth();
  const qc = useQueryClient();
  return createMutation(() => ({
    mutationFn: (
      data: Parameters<typeof settingsApi.updateNotificationSettings>[0],
    ) => settingsApi.updateNotificationSettings(data, auth.csrf()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.notificationSettings });
      showToast({ message: "Preference saved" });
    },
  }));
}

export function usePreferences() {
  return createQuery(() => ({
    queryKey: qk.preferences,
    queryFn: () => settingsApi.getPreferences(),
    retry: (count: number, err: unknown) => count < 2 && isRetryable(err),
  }));
}

export function useSavePreferences() {
  const auth = useAuth();
  const qc = useQueryClient();
  return createMutation(() => ({
    mutationFn: (data: Parameters<typeof settingsApi.updatePreferences>[0]) =>
      settingsApi.updatePreferences(data, auth.csrf()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.preferences });
    },
  }));
}
