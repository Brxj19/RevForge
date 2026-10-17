import { Show } from "solid-js";
import { relativeTime } from "~/lib/format";
import { ButtonLink } from "~/ui/Button";
import { Icon } from "~/ui/icons";
import { createBreakGlassQuery } from "./data";
import styles from "./shell.module.css";

/** Red banner above every page while a platform-admin break-glass session is active (DESIGN.md §2.1). */
export function BreakGlassBanner() {
  const session = createBreakGlassQuery();
  return (
    <Show when={session.data}>
      {(s) => (
        <div class={styles.breakGlass} role="alert">
          <Icon name="shield" size={15} />
          <span>
            <b>Break-glass session</b> on {s().org}/{s().repo}. Read-only,
            logged, ends {relativeTime(s().expires_at)}.
          </span>
          <ButtonLink
            href="/admin/breakglass"
            size="sm"
            variant="danger-solid"
            class={styles.bannerAction}
          >
            End session
          </ButtonLink>
        </div>
      )}
    </Show>
  );
}
