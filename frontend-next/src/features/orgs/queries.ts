import {
  createMutation,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import { useAuth } from "~/app/auth";
import { isRetryable, orgsApi } from "~/lib/api";
import type { OrganizationUpdateRequest } from "~/lib/api/types";
import { qk } from "~/lib/query-keys";
import { showToast } from "~/ui/Toast";

export function useOrgDetail(org: () => string) {
  return createQuery(() => ({
    queryKey: qk.org(org()),
    queryFn: () => orgsApi.get(org()),
    retry: (count: number, err: unknown) => count < 2 && isRetryable(err),
  }));
}

export function useOrgMembers(org: () => string, page: () => number) {
  return createQuery(() => ({
    queryKey: qk.orgMembers(org(), page()),
    queryFn: () => orgsApi.listMembers(org(), page()),
    retry: (count: number, err: unknown) => count < 2 && isRetryable(err),
  }));
}

export function useOrgInvitations(org: () => string) {
  return createQuery(() => ({
    queryKey: qk.orgInvitations(org()),
    queryFn: () => orgsApi.listInvitations(org()),
    retry: (count: number, err: unknown) => count < 2 && isRetryable(err),
  }));
}

export function useUpdateOrg(org: () => string) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn: (data: OrganizationUpdateRequest) =>
      orgsApi.updateOrg(org(), data, auth.csrf()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.org(org()) });
      void queryClient.invalidateQueries({ queryKey: qk.orgs });
      showToast({ message: "Changes saved" });
    },
  }));
}

export function useAddMember(org: () => string) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn: (data: { user_id?: string; email?: string; role: string }) =>
      orgsApi.addMember(org(), data, auth.csrf()),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["org", org(), "members"],
      });
      void queryClient.invalidateQueries({ queryKey: qk.org(org()) });
      showToast({ message: "Member added" });
    },
  }));
}

export function useUpdateMemberRole(org: () => string) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn: (params: { memberId: string; role: string }) =>
      orgsApi.updateMemberRole(
        org(),
        params.memberId,
        { role: params.role },
        auth.csrf(),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["org", org(), "members"],
      });
      showToast({ message: "Role updated" });
    },
  }));
}

export function useRemoveMember(org: () => string) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn: (memberId: string) =>
      orgsApi.removeMember(org(), memberId, auth.csrf()),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["org", org(), "members"],
      });
      void queryClient.invalidateQueries({ queryKey: qk.org(org()) });
      showToast({ message: "Member removed" });
    },
  }));
}

export function useCreateInvitation(org: () => string) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn: (data: { email: string; role: string }) =>
      orgsApi.createInvitation(org(), data, auth.csrf()),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: qk.orgInvitations(org()),
      });
      showToast({ message: "Invitation sent" });
    },
  }));
}

export function useResendInvitation(org: () => string) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn: (invitationId: string) =>
      orgsApi.resendInvitation(org(), invitationId, auth.csrf()),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: qk.orgInvitations(org()),
      });
      showToast({ message: "Invitation resent", tone: "info" });
    },
  }));
}

export function useRevokeInvitation(org: () => string) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn: (invitationId: string) =>
      orgsApi.revokeInvitation(org(), invitationId, auth.csrf()),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: qk.orgInvitations(org()),
      });
      showToast({ message: "Invitation revoked", tone: "info" });
    },
  }));
}
