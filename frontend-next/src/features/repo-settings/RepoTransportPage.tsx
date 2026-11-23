import { Match, Show, Switch as SSwitch, type Component } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { ApiError, isRetryable, reposApi } from "~/lib/api";
import { useRepo } from "~/features/repo";
import { Card, CardBody, CardHeader } from "~/ui/Card";
import { CopyLine } from "~/ui/CopyButton";
import { EmptyState } from "~/ui/EmptyState";
import { Pill } from "~/ui/Pill";
import { Skeleton } from "~/ui/Skeleton";
import { Switch } from "~/ui/Switch";
import { qk } from "~/lib/query-keys";
import { useUpdateTransport } from "./queries";
import styles from "./repo-settings.module.css";

const RepoTransportPage: Component = () => {
  const ctx = useRepo();

  const transport = createQuery(() => ({
    queryKey: qk.transport(ctx.org(), ctx.repo()),
    queryFn: () => reposApi.transport(ctx.org(), ctx.repo()),
    retry: (count: number, err: unknown) => count < 2 && isRetryable(err),
  }));

  const updateTransport = useUpdateTransport(ctx.org, ctx.repo);

  const sshEnabled = () => transport.data?.ssh?.enabled ?? false;
  const httpsEnabled = () => transport.data?.https?.enabled ?? true;

  return (
    <SSwitch>
      <Match when={transport.isPending}>
        <Card>
          <div style={{ padding: "16px" }}>
            <Skeleton width="100%" height={160} />
          </div>
        </Card>
      </Match>
      <Match when={transport.isError}>
        <EmptyState
          art="load-error"
          title="Something went wrong"
          body="Couldn't load transport settings."
          size="card"
          requestId={
            transport.error instanceof ApiError
              ? transport.error.requestId
              : undefined
          }
        />
      </Match>
      <Match when={transport.data}>
        {(data) => (
          <div class={styles.stack}>
            <Card>
              <div class={styles.setRow}>
                <div>
                  <span class={styles.setRowTitle}>SSH</span>
                  <p class={styles.setRowDesc}>Clone and push with SSH keys</p>
                </div>
                <Switch
                  label=""
                  checked={sshEnabled()}
                  onChange={(v) => updateTransport.mutate({ ssh: v })}
                />
              </div>
              <div class={styles.setRow}>
                <div>
                  <span class={styles.setRowTitle}>HTTPS</span>
                  <p class={styles.setRowDesc}>
                    Clone and push with access tokens
                  </p>
                </div>
                <Switch
                  label=""
                  checked={httpsEnabled()}
                  onChange={(v) => updateTransport.mutate({ https: v })}
                />
              </div>
              <div class={styles.setRow}>
                <div>
                  <span class={styles.setRowTitle}>Anonymous clone</span>
                  <p class={styles.setRowDesc}>
                    Anyone on the network can clone without signing in
                  </p>
                </div>
                <Switch
                  label=""
                  checked={false}
                  onChange={(v) =>
                    updateTransport.mutate({ anonymous_clone: v })
                  }
                />
              </div>
            </Card>

            <Show when={data().ssh}>
              {(ssh) => (
                <Card>
                  <CardHeader>
                    <h2 class="h2">SSH clone URL</h2>
                    <Pill tone={sshEnabled() ? "green" : "neutral"} dot>
                      {sshEnabled() ? "Enabled" : "Disabled"}
                    </Pill>
                  </CardHeader>
                  <CardBody>
                    <div class={styles.stack} style={{ gap: "10px" }}>
                      <Show when={ssh().clone_command}>
                        {(cmd) => (
                          <CopyLine text={cmd()} label="Copy clone command" />
                        )}
                      </Show>
                      <p class={styles.cloneHelp}>
                        Authenticate with an SSH key added in your settings.
                        Host fingerprint SHA256:q3f...9Lx.
                      </p>
                    </div>
                  </CardBody>
                </Card>
              )}
            </Show>

            <Card>
              <CardHeader>
                <h2 class="h2">HTTPS clone URL</h2>
                <Pill tone={httpsEnabled() ? "green" : "neutral"} dot>
                  {httpsEnabled() ? "Enabled" : "Disabled"}
                </Pill>
              </CardHeader>
              <CardBody>
                <div class={styles.stack} style={{ gap: "10px" }}>
                  <CopyLine
                    text={data().https.clone_command}
                    label="Copy clone command"
                  />
                  <p class={styles.cloneHelp}>
                    Authenticate with your email and a personal access token.
                    Limited to 60 requests a minute per token.
                  </p>
                </div>
              </CardBody>
            </Card>
          </div>
        )}
      </Match>
    </SSwitch>
  );
};

export default RepoTransportPage;
