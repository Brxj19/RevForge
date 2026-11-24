import { useParams } from "@solidjs/router";
import {
  createSignal,
  For,
  Match,
  Show,
  Switch,
  type Component,
} from "solid-js";
import { relativeTime } from "~/lib/format";
import { loaded } from "~/lib/query";
import type { Invitation, OrganizationMember } from "~/lib/api/types";
import { Avatar } from "~/ui/Avatar";
import { Button } from "~/ui/Button";
import { Card, CardBody, CardHeader } from "~/ui/Card";
import { Dialog } from "~/ui/Dialog";
import { EmptyState, ErrorState } from "~/ui/EmptyState";
import { Field, Input } from "~/ui/Field";
import { Icon } from "~/ui/icons";
import { Pager } from "~/ui/Pager";
import { Select, type SelectOption } from "~/ui/Select";
import { Skeleton } from "~/ui/Skeleton";
import { Tooltip } from "~/ui/Tooltip";
import {
  useCreateInvitation,
  useOrgInvitations,
  useOrgMembers,
  useRemoveMember,
  useResendInvitation,
  useRevokeInvitation,
  useUpdateMemberRole,
} from "./queries";
import styles from "./orgs.module.css";

const ROLE_OPTIONS: SelectOption[] = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
];

const INVITE_ROLE_OPTIONS: SelectOption[] = [
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
];

const OrgMembersPage: Component = () => {
  const params = useParams<{ org: string }>();
  const [page, setPage] = createSignal(1);
  const [inviteOpen, setInviteOpen] = createSignal(false);
  const [inviteEmail, setInviteEmail] = createSignal("");
  const [inviteRole, setInviteRole] = createSignal("member");

  const membersQuery = useOrgMembers(() => params.org, page);
  const invitationsQuery = useOrgInvitations(() => params.org);
  const updateRole = useUpdateMemberRole(() => params.org);
  const removeMember = useRemoveMember(() => params.org);
  const createInvitation = useCreateInvitation(() => params.org);
  const resendInvitation = useResendInvitation(() => params.org);
  const revokeInvitation = useRevokeInvitation(() => params.org);

  const ownerCount = () =>
    loaded(membersQuery)?.items.filter((m) => m.role === "owner").length ?? 0;

  const isLastOwner = (member: OrganizationMember) =>
    member.role === "owner" && ownerCount() <= 1;

  const handleRoleChange = (member: OrganizationMember, role: string) => {
    updateRole.mutate({ memberId: member.id, role });
  };

  const handleRemove = (member: OrganizationMember) => {
    removeMember.mutate(member.id);
  };

  const handleInvite = () => {
    const email = inviteEmail().trim();
    if (!email) return;
    createInvitation.mutate(
      { email, role: inviteRole() },
      {
        onSuccess: () => {
          setInviteOpen(false);
          setInviteEmail("");
          setInviteRole("member");
        },
      },
    );
  };

  const handleResend = (invitation: Invitation) => {
    resendInvitation.mutate(invitation.id);
  };

  const handleRevoke = (invitation: Invitation) => {
    revokeInvitation.mutate(invitation.id);
  };

  const perPage = () => loaded(membersQuery)?.per_page ?? 20;
  const total = () => loaded(membersQuery)?.total ?? 0;

  return (
    <div class={styles.overviewStack}>
      {/* Members table */}
      <Card>
        <CardHeader>
          <h2 class="h2">
            <Switch>
              <Match when={loaded(membersQuery)}>
                {(data) => <>{data().total} members</>}
              </Match>
              <Match when={true}>Members</Match>
            </Switch>
          </h2>
          <Button
            size="sm"
            variant="primary"
            onClick={() => setInviteOpen(true)}
          >
            <Icon name="plus" size={13} />
            Invite
          </Button>
        </CardHeader>
        <Switch>
          <Match when={membersQuery.isPending}>
            <CardBody>
              <Skeleton width="100%" height={120} />
            </CardBody>
          </Match>
          <Match when={membersQuery.isError}>
            <CardBody>
              <ErrorState
                error={membersQuery.error}
                what="members"
                size="inline"
                compact
                level={3}
                onRetry={() => void membersQuery.refetch()}
              />
            </CardBody>
          </Match>
          <Match when={membersQuery.data}>
            {(data) => (
              <>
                <div style={{ "overflow-x": "auto" }}>
                  <table class={styles.membersTable}>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Role</th>
                        <th>Joined</th>
                        <th style={{ "text-align": "right" }}>Last active</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      <For each={data().items}>
                        {(member) => (
                          <tr>
                            <td>
                              <div class={styles.memberName}>
                                <Avatar
                                  name={member.user_display_name}
                                  size={26}
                                />
                                <div class={styles.memberMeta}>
                                  <span>{member.user_display_name}</span>
                                  <span class={styles.memberEmail}>
                                    {member.user_email}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td>
                              <Show
                                when={!isLastOwner(member)}
                                fallback={
                                  <Tooltip content="An organization needs at least one owner">
                                    <span class={styles.lockedRole}>
                                      Owner
                                      <Icon name="lock" size={12} />
                                    </span>
                                  </Tooltip>
                                }
                              >
                                <Select
                                  label="Role"
                                  size="sm"
                                  options={ROLE_OPTIONS}
                                  value={member.role}
                                  onChange={(v) => handleRoleChange(member, v)}
                                />
                              </Show>
                            </td>
                            <td style={{ color: "var(--muted)" }}>
                              {relativeTime(member.created_at)}
                            </td>
                            <td class={styles.numCell}>
                              {relativeTime(member.updated_at)}
                            </td>
                            <td class={styles.actionsCell}>
                              <Show when={!isLastOwner(member)}>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleRemove(member)}
                                  style={{ color: "var(--red)" }}
                                >
                                  Remove
                                </Button>
                              </Show>
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
                <Pager
                  from={(page() - 1) * perPage() + 1}
                  to={Math.min(page() * perPage(), total())}
                  total={total()}
                  hasPrevious={page() > 1}
                  hasNext={page() * perPage() < total()}
                  onPrevious={() => setPage((p) => Math.max(1, p - 1))}
                  onNext={() => setPage((p) => p + 1)}
                  label="members"
                />
              </>
            )}
          </Match>
        </Switch>
      </Card>

      {/* Pending invitations */}
      <Card>
        <CardHeader>
          <h2 class="h2">Pending invitations</h2>
          <Show when={loaded(invitationsQuery)}>
            {(data) => (
              <span class={styles.countBadge}>{data().items.length}</span>
            )}
          </Show>
        </CardHeader>
        <Switch>
          <Match when={invitationsQuery.isPending}>
            <CardBody>
              <Skeleton width="100%" height={60} />
            </CardBody>
          </Match>
          <Match when={invitationsQuery.isError}>
            <CardBody>
              <ErrorState
                error={invitationsQuery.error}
                what="pending invitations"
                size="inline"
                compact
                level={3}
                onRetry={() => void invitationsQuery.refetch()}
              />
            </CardBody>
          </Match>
          <Match when={invitationsQuery.data?.items.length === 0}>
            <EmptyState
              art="no-invitations"
              size="inline"
              compact
              level={3}
            />
          </Match>
          <Match when={invitationsQuery.data}>
            {(data) => (
              <For each={data().items}>
                {(invitation) => (
                  <div class={styles.invitationRow}>
                    <div class={styles.invitationInfo}>
                      <span class={styles.emailAvatar}>@</span>
                      <div class={styles.invitationMeta}>
                        <span>{invitation.email}</span>
                        <span class={styles.invitationDetail}>
                          invited as {invitation.role}{" "}
                          {relativeTime(invitation.created_at)}
                        </span>
                      </div>
                    </div>
                    <span class={styles.invitationActions}>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleResend(invitation)}
                      >
                        Resend
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRevoke(invitation)}
                        style={{ color: "var(--red)" }}
                      >
                        Revoke
                      </Button>
                    </span>
                  </div>
                )}
              </For>
            )}
          </Match>
        </Switch>
      </Card>

      {/* Invite dialog */}
      <Dialog
        open={inviteOpen()}
        onOpenChange={setInviteOpen}
        title="Invite member"
        footer={
          <>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!inviteEmail().trim()}
              loading={createInvitation.isPending}
              onClick={handleInvite}
            >
              Send invitation
            </Button>
          </>
        }
      >
        <form
          class={styles.inviteForm}
          onSubmit={(e) => {
            e.preventDefault();
            handleInvite();
          }}
        >
          <Field label="Email address">
            <Input
              type="email"
              placeholder="name@example.com"
              value={inviteEmail()}
              onInput={(e) => setInviteEmail(e.currentTarget.value)}
              autocomplete="email"
            />
          </Field>
          <Field label="Role">
            <Select
              label="Role"
              options={INVITE_ROLE_OPTIONS}
              value={inviteRole()}
              onChange={setInviteRole}
            />
          </Field>
        </form>
      </Dialog>
    </div>
  );
};

export default OrgMembersPage;
