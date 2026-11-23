import { For, Match, Switch as SSwitch, type Component } from "solid-js";
import { ApiError } from "~/lib/api/client";
import { useRepo } from "~/features/repo";
import { Avatar } from "~/ui/Avatar";
import { Button } from "~/ui/Button";
import { Card, CardHeader } from "~/ui/Card";
import { EmptyState } from "~/ui/EmptyState";
import { Icon } from "~/ui/icons";
import { Pill } from "~/ui/Pill";
import { Skeleton } from "~/ui/Skeleton";
import { useRepoPermissions, useRevokePermission } from "./queries";
import styles from "./repo-settings.module.css";

const RepoAccessPage: Component = () => {
  const ctx = useRepo();
  const perms = useRepoPermissions(ctx.org, ctx.repo);
  const revokeMutation = useRevokePermission(ctx.org, ctx.repo);

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
        <EmptyState
          art="load-error"
          title="Something went wrong"
          body="Couldn't load access permissions."
          size="card"
          requestId={
            perms.error instanceof ApiError ? perms.error.requestId : undefined
          }
        />
      </Match>
      <Match when={perms.data}>
        {(entries) => (
          <Card>
            <CardHeader>
              <h2 class="h2">Who can access {ctx.repo()}</h2>
              <Button size="sm" variant="primary" disabled>
                <Icon name="plus" size={13} />
                Add person
              </Button>
            </CardHeader>
            <div class="scroll-x">
              <table class={styles.accessTable}>
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Role</th>
                    <th>Source</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  <For each={entries()}>
                    {(entry) => (
                      <tr>
                        <td>
                          <div class={styles.personCell}>
                            <Avatar name={entry.display_name} size={26} />
                            <div class={styles.personMeta}>
                              <span>{entry.display_name}</span>
                              <span class={styles.personEmail}>
                                {entry.email}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <Pill tone={roleTone(entry.role)}>{entry.role}</Pill>
                        </td>
                        <td class={styles.sourceCell}>
                          {entry.source === "org_role"
                            ? "Organization role"
                            : "Direct grant"}
                        </td>
                        <td style={{ "text-align": "right" }}>
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
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </Match>
    </SSwitch>
  );
};

export default RepoAccessPage;
