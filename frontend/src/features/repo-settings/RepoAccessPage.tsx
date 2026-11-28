import { createQuery } from "@tanstack/solid-query";
import {
  createMemo,
  createSignal,
  For,
  Match,
  Show,
  Switch as SSwitch,
  type Component,
} from "solid-js";
import { useRepo } from "~/features/repo";
import { ApiError, isRetryable, orgsApi } from "~/lib/api";
import { loaded } from "~/lib/query";
import { qk } from "~/lib/query-keys";
import { Avatar } from "~/ui/Avatar";
import { Button } from "~/ui/Button";
import { Callout } from "~/ui/Callout";
import { Card, CardHeader } from "~/ui/Card";
import { Dialog } from "~/ui/Dialog";
import { EmptyState, ErrorState } from "~/ui/EmptyState";
import { Field, Input } from "~/ui/Field";
import { Icon } from "~/ui/icons";
import { Pill } from "~/ui/Pill";
import { Select, type SelectOption } from "~/ui/Select";
import { Skeleton } from "~/ui/Skeleton";
import { Table, Td, Th } from "~/ui/Table";
import {
  useRepoPermissions,
  useRevokePermission,
  useUpsertPermission,
} from "./queries";
import styles from "./repo-settings.module.css";

const REPO_ROLE_OPTIONS: SelectOption[] = [
  { value: "read", label: "Read — browse, clone, and pull" },
  { value: "write", label: "Write — push changes and open pull requests" },
  { value: "admin", label: "Admin — manage repository settings and access" },
];

const RepoAccessPage: Component = () => {
  const ctx = useRepo();
  const perms = useRepoPermissions(ctx.org, ctx.repo);
  const upsertMutation = useUpsertPermission(ctx.org, ctx.repo);
  const revokeMutation = useRevokePermission(ctx.org, ctx.repo);

  const [addOpen, setAddOpen] = createSignal(false);
  const [selectedUser, setSelectedUser] = createSignal("");
  const [selectedRole, setSelectedRole] = createSignal<
    "read" | "write" | "admin"
  >("write");
  const [formError, setFormError] = createSignal<string | null>(null);

  const orgMembers = createQuery(() => ({
    queryKey: qk.orgMembers(ctx.org(), 1),
    queryFn: () => orgsApi.listMembers(ctx.org(), 1),
    enabled: addOpen(),
    retry: (count: number, err: unknown) => count < 2 && isRetryable(err),
  }));

  const memberOptions = createMemo<SelectOption[]>(() => {
    const items = loaded(orgMembers)?.items ?? [];
    return items.map((m) => ({
      value: m.user_email,
      label: `${m.user_display_name} (${m.user_email})`,
    }));
  });

  const openAddDialog = () => {
    setFormError(null);
    setSelectedUser("");
    setSelectedRole("write");
    setAddOpen(true);
  };

  const handleGrant = () => {
    const target = selectedUser().trim();
    if (!target) return;
    setFormError(null);
    upsertMutation.mutate(
      { user: target, role: selectedRole() },
      {
        onSuccess: () => {
          setAddOpen(false);
          setSelectedUser("");
          setSelectedRole("write");
          setFormError(null);
        },
        onError: (err: unknown) => {
          setFormError(
            err instanceof ApiError
              ? err.message
              : "Could not grant access. Make sure this user is an organization member.",
          );
        },
      },
    );
  };

  const handleRevoke = (userId: string) => {
    revokeMutation.mutate(userId);
  };

  const roleTone = (role: string) => {
    switch (role) {
      case "owner":
        return "purple" as const;
      case "admin":
        return "blue" as const;
      case "write":
        return "green" as const;
      default:
        return "neutral" as const;
    }
  };

  return (
    <>
      <SSwitch>
        <Match when={perms.isPending}>
          <Card>
            <CardHeader>
              <Skeleton width="200px" height={20} />
            </CardHeader>
            <div style={{ padding: "16px" }}>
              <Skeleton width="100%" height={120} />
            </div>
          </Card>
        </Match>
        <Match when={perms.isError}>
          <Card>
            <ErrorState
              error={perms.error}
              what="access permissions"
              size="card"
              onRetry={() => void perms.refetch()}
            />
          </Card>
        </Match>
        <Match when={loaded(perms)}>
          {(entries) => (
            <Card>
              <CardHeader>
                <h2 class="h2">Who can access {ctx.repo()}</h2>
                <Button size="sm" variant="primary" onClick={openAddDialog}>
                  <Icon name="plus" size={13} />
                  Add person
                </Button>
              </CardHeader>
              <Show
                when={entries().length > 0}
                fallback={<EmptyState art="no-permissions" size="card" />}
              >
                <Table caption={`Access permissions for ${ctx.repo()}`}>
                  <thead>
                    <tr>
                      <Th>Person</Th>
                      <Th>Role</Th>
                      <Th>Source</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    <For each={entries()}>
                      {(entry) => (
                        <tr>
                          <Td>
                            <div class={styles.personCell}>
                              <Avatar name={entry.display_name} size={26} />
                              <div class={styles.personMeta}>
                                <span>{entry.display_name}</span>
                                <span class={styles.personEmail}>
                                  {entry.email}
                                </span>
                              </div>
                            </div>
                          </Td>
                          <Td>
                            <Pill tone={roleTone(entry.role)}>
                              {entry.role}
                            </Pill>
                          </Td>
                          <Td class={styles.sourceCell}>
                            {entry.source === "org_role"
                              ? "Organization role"
                              : "Direct grant"}
                          </Td>
                          <Td style={{ "text-align": "right" }}>
                            {entry.source === "direct" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                style={{ color: "var(--red)" }}
                                loading={
                                  revokeMutation.isPending &&
                                  revokeMutation.variables === entry.user_id
                                }
                                onClick={() => handleRevoke(entry.user_id)}
                              >
                                Revoke
                              </Button>
                            )}
                          </Td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </Table>
              </Show>
            </Card>
          )}
        </Match>
      </SSwitch>

      <Dialog
        open={addOpen()}
        onOpenChange={setAddOpen}
        title={`Add person to ${ctx.repo()}`}
        description="Grant direct repository access to an organization member."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!selectedUser().trim()}
              loading={upsertMutation.isPending}
              onClick={handleGrant}
            >
              Grant access
            </Button>
          </>
        }
      >
        <form
          class={styles.webhookForm}
          onSubmit={(e) => {
            e.preventDefault();
            handleGrant();
          }}
        >
          <Show when={formError()}>
            {(err) => <Callout tone="err">{err()}</Callout>}
          </Show>

          <Show
            when={memberOptions().length > 0}
            fallback={
              <Field
                label="Member email"
                hint="Enter the email address of an existing organization member."
              >
                <Input
                  type="email"
                  placeholder="name@example.com"
                  value={selectedUser()}
                  onInput={(e) => setSelectedUser(e.currentTarget.value)}
                  autocomplete="email"
                />
              </Field>
            }
          >
            <Field
              label="Organization member"
              hint="Only members of this organization can be granted direct repository access."
            >
              <Select
                label="Organization member"
                placeholder="Select a member"
                options={memberOptions()}
                value={selectedUser()}
                onChange={setSelectedUser}
              />
            </Field>
          </Show>

          <Field label="Repository role">
            <Select
              label="Repository role"
              options={REPO_ROLE_OPTIONS}
              value={selectedRole()}
              onChange={(v) => setSelectedRole(v as "read" | "write" | "admin")}
            />
          </Field>
        </form>
      </Dialog>
    </>
  );
};

export default RepoAccessPage;
