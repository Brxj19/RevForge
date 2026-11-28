import { useParams } from "@solidjs/router";
import { createSignal, Show, type Component } from "solid-js";
import { Button } from "~/ui/Button";
import { Card } from "~/ui/Card";
import { ConfirmDialog } from "~/ui/ConfirmDialog";
import { showToast } from "~/ui/Toast";
import { useOrgDetail } from "./queries";
import styles from "./orgs.module.css";

// API-GAP: phase-4b-org-management — DELETE /organizations/{org} does not exist yet.

const OrgDangerPage: Component = () => {
  const params = useParams<{ org: string }>();
  const orgQuery = useOrgDetail(() => params.org);
  const [confirmOpen, setConfirmOpen] = createSignal(false);

  const repoCount = () => orgQuery.data?.repository_count ?? 0;
  const canDelete = () => repoCount() === 0;

  const handleDelete = async () => {
    // API-GAP: phase-4b-org-management — The actual delete endpoint is not built yet.
    showToast({
      message: "Organization deletion is not yet available.",
      tone: "err",
    });
  };

  return (
    <Card class={styles.dangerCard}>
      <div class={styles.dangerRow}>
        <div class={styles.dangerInfo}>
          <span class={styles.dangerTitle}>Delete organization</span>
          <Show
            when={canDelete()}
            fallback={
              <p class={styles.dangerDesc}>
                Delete or transfer its {repoCount()}{" "}
                {repoCount() === 1 ? "repository" : "repositories"} first.
              </p>
            }
          >
            <p class={styles.dangerDesc}>
              This permanently deletes the organization and removes all members.
            </p>
          </Show>
        </div>
        <Button
          variant="danger"
          disabled={!canDelete()}
          onClick={() => setConfirmOpen(true)}
        >
          Delete
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen()}
        onOpenChange={setConfirmOpen}
        title="Delete organization"
        body={
          <>
            This will permanently delete{" "}
            <strong>{orgQuery.data?.display_name ?? params.org}</strong> and
            remove all members. This cannot be undone.
          </>
        }
        confirmLabel="Delete organization"
        tone="danger"
        typedConfirmation={params.org}
        onConfirm={handleDelete}
      />
    </Card>
  );
};

export default OrgDangerPage;
