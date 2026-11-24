import {
  createSignal,
  For,
  Match,
  Show,
  Switch,
  type Component,
} from "solid-js";
import { useAuth } from "~/app/auth";
import type { AdminUser } from "~/lib/api";
import { absoluteTime, shortAge } from "~/lib/format";
import { loaded } from "~/lib/query";
import { useUrlState } from "~/lib/url";
import { Avatar } from "~/ui/Avatar";
import { Button } from "~/ui/Button";
import { Card, CardBody, CardHeader } from "~/ui/Card";
import { ConfirmDialog } from "~/ui/ConfirmDialog";
import { Dialog } from "~/ui/Dialog";
import { EmptyState, ErrorState } from "~/ui/EmptyState";
import { Field, Input, InputGroup, Textarea } from "~/ui/Field";
import { IconButton } from "~/ui/IconButton";
import { Icon } from "~/ui/icons";
import { Menu, type MenuGroupDef } from "~/ui/Menu";
import { Pager } from "~/ui/Pager";
import { Pill } from "~/ui/Pill";
import { SkeletonText } from "~/ui/Skeleton";
import { Table, Td, Th } from "~/ui/Table";
import {
  useAdminUsers,
  useReactivateUserMutation,
  useRevokeSessionsMutation,
  useSuspendUserMutation,
} from "./queries";
import styles from "./admin.module.css";

const PAGE_SIZE = 20;

interface SuspendDialogProps {
  user: AdminUser | null;
  onClose: () => void;
}

const SuspendUserDialog: Component<SuspendDialogProps> = (props) => {
  const [reason, setReason] = createSignal("");
  const [typed, setTyped] = createSignal("");
  const suspendMut = useSuspendUserMutation();

  const confirmPhrase = () => props.user?.handle || props.user?.email || "";
  const canSubmit = () =>
    Boolean(props.user) &&
    typed() === confirmPhrase() &&
    reason().trim().length >= 3 &&
    !suspendMut.isPending;

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setReason("");
      setTyped("");
      props.onClose();
    }
  };

  const handleSubmit = async (e?: Event) => {
    e?.preventDefault();
    const u = props.user;
    if (!u || !canSubmit()) return;
    try {
      await suspendMut.mutateAsync({
        id: u.id,
        reason: reason().trim(),
        displayName: u.display_name,
      });
      handleOpenChange(false);
    } catch {
      // Toast handled in mutation onError; keep dialog open so admin can retry.
    }
  };

  return (
    <Dialog
      open={Boolean(props.user)}
      onOpenChange={handleOpenChange}
      title={
        props.user ? `Suspend ${props.user.display_name}?` : "Suspend account"
      }
      role="alertdialog"
      footer={
        <>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="danger-solid"
            disabled={!canSubmit()}
            loading={suspendMut.isPending}
            onClick={() => void handleSubmit()}
          >
            {suspendMut.isPending ? "Suspending…" : "Suspend account"}
          </Button>
        </>
      }
    >
      <form class={styles.dialogForm} onSubmit={(e) => void handleSubmit(e)}>
        <p class={styles.dialogBodyText}>
          They can’t sign in, clone, pull or push until reactivated. Their
          content stays.
        </p>
        <p class={styles.dialogAuditNote}>
          Recorded as a high-severity audit event.
        </p>

        <Field label="Reason" hint="Kept in the audit log and account record.">
          <Textarea
            value={reason()}
            onInput={(e) => setReason(e.currentTarget.value)}
            placeholder="Compromised credentials or offboarding"
            rows={3}
          />
        </Field>

        <Field
          label={
            <>
              Type <code>{confirmPhrase()}</code> to confirm
            </>
          }
        >
          <Input
            value={typed()}
            onInput={(e) => setTyped(e.currentTarget.value)}
            autocomplete="off"
            spellcheck={false}
            autocapitalize="off"
            mono
          />
        </Field>
      </form>
    </Dialog>
  );
};

const AdminUsersPage: Component = () => {
  const auth = useAuth();
  const [url, setUrl] = useUrlState(
    { q: "", status: "all", page: 1 },
    { status: ["all", "active", "suspended", "platform_admin"] as const },
  );
  const [suspendTarget, setSuspendTarget] = createSignal<AdminUser | null>(
    null,
  );
  const [revokeTarget, setRevokeTarget] = createSignal<AdminUser | null>(null);

  const page = () => Math.max(1, url.page);
  const offset = () => (page() - 1) * PAGE_SIZE;

  const usersQuery = useAdminUsers(() => ({
    q: url.q,
    status: url.status,
    limit: PAGE_SIZE,
    offset: offset(),
  }));

  const reactivateMut = useReactivateUserMutation();
  const revokeMut = useRevokeSessionsMutation();

  const data = () => loaded(usersQuery);

  const revokeTitle = () => {
    const target = revokeTarget();
    return target
      ? `Sign ${target.display_name} out everywhere?`
      : "Sign out everywhere?";
  };

  const handleConfirmRevoke = async () => {
    const target = revokeTarget();
    if (!target) return;
    await revokeMut.mutateAsync({
      id: target.id,
      displayName: target.display_name,
    });
  };

  const menuGroupsFor = (u: AdminUser): MenuGroupDef[] => {
    const profileHandle = u.handle || u.display_name;
    return [
      {
        items: [
          {
            id: "profile",
            label: "View profile",
            icon: "user",
            href: `/u/${encodeURIComponent(profileHandle)}`,
          },
          {
            id: "revoke",
            label: "Sign out of all sessions",
            icon: "logout",
            onSelect: () => setRevokeTarget(u),
          },
        ],
      },
      {
        items: [
          u.is_active
            ? {
                id: "suspend",
                label: "Suspend account",
                icon: "lock",
                danger: true,
                onSelect: () => setSuspendTarget(u),
              }
            : {
                id: "reactivate",
                label: "Reactivate account",
                icon: "check",
                onSelect: () =>
                  reactivateMut.mutate({
                    id: u.id,
                    displayName: u.display_name,
                  }),
              },
        ],
      },
    ];
  };

  return (
    <>
      <Card>
        <CardHeader>
          <h2 class="h2">Users</h2>
          <InputGroup
            wrapClass={styles.searchInput}
            prefix={<Icon name="search" size={14} />}
            value={url.q}
            onInput={(e) =>
              setUrl(
                { q: e.currentTarget.value, page: 1 },
                { replace: true, debounce: 250 },
              )
            }
            placeholder="Search name or email"
            aria-label="Search users"
          />
        </CardHeader>

        <Switch>
          <Match when={usersQuery.isPending}>
            <CardBody>
              <SkeletonText
                lines={["85%", "75%", "90%", "70%", "80%"]}
                label="Loading users"
              />
            </CardBody>
          </Match>

          <Match when={usersQuery.isError}>
            <ErrorState
              error={usersQuery.error}
              what="users"
              onRetry={() => void usersQuery.refetch()}
            />
          </Match>

          <Match when={data()}>
            {(res) => (
              <Show
                when={res().items.length > 0}
                fallback={
                  <EmptyState
                    art="no-results"
                    title="No users match"
                    body="Try a different name or email address."
                    actions={
                      url.q ? (
                        <Button onClick={() => setUrl({ q: "", page: 1 })}>
                          Clear search
                        </Button>
                      ) : undefined
                    }
                  />
                }
              >
                <Table caption="Forge users">
                  <thead>
                    <tr>
                      <Th>User</Th>
                      <Th>Organizations</Th>
                      <Th>Status</Th>
                      <Th numeric>Last active</Th>
                      <Th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    <For each={res().items}>
                      {(u) => {
                        const isSelf = () => u.id === auth.user()?.id;
                        return (
                          <tr>
                            <Td>
                              <div class={styles.userCell}>
                                <Avatar
                                  name={u.display_name}
                                  size={26}
                                  decorative
                                />
                                <div class={styles.userMeta}>
                                  <span class={styles.userNameRow}>
                                    <span>{u.display_name}</span>
                                    <Show when={u.is_platform_admin}>
                                      <Pill tone="purple">platform admin</Pill>
                                    </Show>
                                  </span>
                                  <span class={styles.userEmail}>
                                    {u.email}
                                  </span>
                                </div>
                              </div>
                            </Td>
                            <Td class={styles.mutedCell}>
                              {u.organizations.length > 0
                                ? u.organizations.join(", ")
                                : "—"}
                            </Td>
                            <Td>
                              <Show
                                when={u.is_active}
                                fallback={
                                  <Pill tone="red" dot>
                                    suspended
                                  </Pill>
                                }
                              >
                                <Pill tone="green" dot>
                                  active
                                </Pill>
                              </Show>
                            </Td>
                            <Td numeric>
                              <Show when={u.last_active_at} fallback="—">
                                {(ts) => (
                                  <time
                                    datetime={ts()}
                                    title={absoluteTime(ts())}
                                  >
                                    {shortAge(ts())}
                                  </time>
                                )}
                              </Show>
                            </Td>
                            <Td class={styles.actionsCell}>
                              <Show when={!isSelf()}>
                                <Menu
                                  placement="bottom-end"
                                  groups={menuGroupsFor(u)}
                                  trigger={(p: Record<string, unknown>) => (
                                    <IconButton
                                      {...p}
                                      icon="dots"
                                      size="sm"
                                      tooltip={false}
                                      label={`Actions for ${u.display_name}`}
                                    />
                                  )}
                                />
                              </Show>
                            </Td>
                          </tr>
                        );
                      }}
                    </For>
                  </tbody>
                </Table>

                <Pager
                  label="Users"
                  from={res().total === 0 ? 0 : res().offset + 1}
                  to={Math.min(res().offset + res().items.length, res().total)}
                  total={res().total}
                  hasPrevious={page() > 1}
                  hasNext={res().offset + res().items.length < res().total}
                  onPrevious={() => setUrl({ page: Math.max(1, page() - 1) })}
                  onNext={() => setUrl({ page: page() + 1 })}
                />
              </Show>
            )}
          </Match>
        </Switch>
      </Card>

      <SuspendUserDialog
        user={suspendTarget()}
        onClose={() => setSuspendTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(revokeTarget())}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        title={revokeTitle()}
        body="Every browser session and their access tokens are revoked."
        auditNote="Recorded as a high-severity audit event."
        confirmLabel="Sign out everywhere"
        tone="danger"
        onConfirm={handleConfirmRevoke}
      />
    </>
  );
};

export default AdminUsersPage;
