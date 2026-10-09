import { createSignal, Match, Show, Switch } from "solid-js";
import { useAuth } from "~/app/auth";
import { Button } from "~/ui/Button";
import { CopyLine } from "~/ui/CopyButton";
import { Icon } from "~/ui/icons";
import { Popover } from "~/ui/Popover";
import { Segmented } from "~/ui/Segmented";
import { SkeletonText } from "~/ui/Skeleton";
import { useRepo } from "./context";
import { createTransportQuery } from "./queries";
import styles from "./repo.module.css";

type Proto = "ssh" | "https";

/**
 * Clone ▾ (DESIGN.md §2.3): SSH / HTTPS tabs, copy line, auth hint. Anonymous visitors on public
 * repositories get HTTPS only — the backend doesn't send SSH details to them.
 */
export function CloneMenu() {
  const auth = useAuth();
  const repo = useRepo();
  const [open, setOpen] = createSignal(false);
  const [proto, setProto] = createSignal<Proto>("ssh");
  const transport = createTransportQuery(repo.org, repo.repo, open);
  const sshUrl = () => transport.data?.ssh?.clone_url ?? null;
  const signedIn = () => auth.status() === "authenticated";
  const showSsh = () => signedIn() && !!sshUrl();
  const active = (): Proto => (showSsh() ? proto() : "https");
  const command = () => {
    const t = transport.data;
    if (!t) return "";
    return active() === "ssh"
      ? (t.ssh?.clone_command ?? `hg clone ${sshUrl() ?? ""}`)
      : t.https.clone_command || `hg clone ${t.https.clone_url}`;
  };

  return (
    <Popover
      open={open()}
      onOpenChange={setOpen}
      trigger={Button}
      triggerProps={{ variant: "primary" }}
      triggerContent={
        <>
          <Icon name="down" size={15} />
          Clone
        </>
      }
      title={`Clone ${repo.detail().slug}`}
      width={420}
      headerAction={
        <Show when={showSsh()}>
          <Segmented
            label="Clone protocol"
            size="sm"
            value={active()}
            onChange={setProto}
            options={[
              { value: "ssh", label: "SSH" },
              { value: "https", label: "HTTPS" },
            ]}
          />
        </Show>
      }
    >
      <div class={styles.cloneBody}>
        <Switch>
          <Match when={transport.isPending}>
            <SkeletonText lines={["90%", "60%"]} label="Loading clone URLs" />
          </Match>
          <Match when={transport.isError}>
            <p class={styles.hint} role="alert">
              Couldn't load the clone URLs. Close this and try again.
            </p>
          </Match>
          <Match when={transport.data}>
            <CopyLine text={command()} label="Copy clone command" />
            <p class={styles.hint}>
              <Switch>
                <Match when={!signedIn()}>
                  Public repository: anyone can clone over HTTPS without signing
                  in.
                </Match>
                <Match when={active() === "ssh"}>
                  <Show
                    when={transport.data?.setup?.has_active_ssh_key !== false}
                    fallback={<>Add an SSH key to your account first. </>}
                  >
                    Uses the SSH keys on your account.{" "}
                  </Show>
                  <a class="link" href="/settings/ssh-keys">
                    Manage keys
                  </a>
                </Match>
                <Match when={active() === "https"}>
                  Use a personal access token as the password.{" "}
                  <a class="link" href="/settings/tokens">
                    Create a token
                  </a>
                </Match>
              </Switch>
            </p>
          </Match>
        </Switch>
      </div>
    </Popover>
  );
}
