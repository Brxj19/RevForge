import { useLocation, useNavigate } from "@solidjs/router";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { Show } from "solid-js";
import { adminApi, ApiError } from "~/lib/api";
import { relativeTime } from "~/lib/format";
import { loaded } from "~/lib/query";
import { qk } from "~/lib/query-keys";
import { Button } from "~/ui/Button";
import { Icon } from "~/ui/icons";
import { showToast } from "~/ui/Toast";
import { useAuth } from "../auth";
import { createBreakGlassQuery } from "./data";
import styles from "./shell.module.css";

/** Red banner above every page while a platform-admin break-glass session is active (DESIGN.md §2.1). */
export function BreakGlassBanner() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const session = createBreakGlassQuery();

  const endSession = createMutation(() => ({
    mutationFn: (id: string) => adminApi.endBreakGlass(id, auth.csrf()),
    onSuccess: () => {
      queryClient.setQueryData(qk.breakGlass, null);
      void queryClient.invalidateQueries({ queryKey: qk.breakGlass });
      void queryClient.invalidateQueries({ queryKey: qk.adminBreakGlass });
      void queryClient.invalidateQueries({ queryKey: qk.adminOverview });
      void queryClient.invalidateQueries({ queryKey: ["admin", "audit"] });
      showToast({ message: "Break-glass session ended", tone: "info" });
      if (!location.pathname.startsWith("/admin")) {
        navigate("/admin/breakglass");
      }
    },
    onError: (err) => {
      showToast({
        message:
          err instanceof ApiError
            ? err.message
            : "Couldn't end break-glass session.",
        tone: "err",
      });
    },
  }));

  return (
    <Show when={loaded(session)}>
      {(s) => (
        <div class={styles.breakGlass} role="alert">
          <Icon name="shield" size={15} />
          <span>
            <b>Break-glass session</b> on {s().org}/{s().repo}. Read-only,
            logged, ends {relativeTime(s().expires_at)}.
          </span>
          <Button
            size="sm"
            variant="danger-solid"
            class={styles.bannerAction}
            loading={endSession.isPending}
            onClick={() => endSession.mutate(s().id)}
          >
            {endSession.isPending ? "Ending…" : "End session"}
          </Button>
        </div>
      )}
    </Show>
  );
}
