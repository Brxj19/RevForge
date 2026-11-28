import { useNavigate } from "@solidjs/router";
import { createSignal, type Component } from "solid-js";
import { useRepo } from "~/features/repo";
import { Button } from "~/ui/Button";
import { Card } from "~/ui/Card";
import { ConfirmDialog } from "~/ui/ConfirmDialog";
import { showToast } from "~/ui/Toast";
import { useArchiveRepo, useDeleteRepo } from "./queries";
import styles from "./repo-settings.module.css";

const RepoDangerPage: Component = () => {
  const ctx = useRepo();
  const navigate = useNavigate();
  const deleteMutation = useDeleteRepo(ctx.org, ctx.repo);
  const archiveMutation = useArchiveRepo(ctx.org, ctx.repo);

  const [archiveOpen, setArchiveOpen] = createSignal(false);
  const [deleteOpen, setDeleteOpen] = createSignal(false);

  const isArchived = () => Boolean(ctx.detail().archived_at);

  const handleArchive = async () => {
    await archiveMutation.mutateAsync(!isArchived());
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync();
      showToast({ message: `Deleted ${ctx.repo()}` });
      navigate("/");
    } catch {
      showToast({ message: "Failed to delete repository", tone: "err" });
      throw new Error("delete failed"); // keep dialog open
    }
  };

  return (
    <>
      <Card class={styles.dangerCard}>
        <div class={styles.dangerRow}>
          <div class={styles.dangerInfo}>
            <span class={styles.dangerTitle}>Archive repository</span>
            <p class={styles.dangerDesc}>
              Makes it read-only. Clones still work; pushes are rejected. You
              can unarchive later.
            </p>
          </div>
          <Button variant="danger" onClick={() => setArchiveOpen(true)}>
            {isArchived() ? "Unarchive" : "Archive"}
          </Button>
        </div>
        <div class={styles.dangerRow}>
          <div class={styles.dangerInfo}>
            <span class={styles.dangerTitle}>
              Transfer to another organization
            </span>
            <p class={styles.dangerDesc}>
              Members of {ctx.detail().organization_slug} lose access unless
              they belong to the new organization.
            </p>
          </div>
          <Button variant="danger" disabled>
            Transfer
          </Button>
        </div>
        <div class={styles.dangerRow}>
          <div class={styles.dangerInfo}>
            <span class={styles.dangerTitle}>Delete repository</span>
            <p class={styles.dangerDesc}>
              Removes all changesets, refs and settings. This can't be undone.
              Only organization owners and admins can delete; repository admins
              see this disabled.
            </p>
          </div>
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            Delete
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={archiveOpen()}
        onOpenChange={setArchiveOpen}
        title={
          isArchived() ? `Unarchive ${ctx.repo()}?` : `Archive ${ctx.repo()}?`
        }
        body={
          isArchived()
            ? "It becomes writable again. Pushes are accepted."
            : "It becomes read-only. You can unarchive it later."
        }
        confirmLabel={isArchived() ? "Unarchive" : "Archive"}
        tone="danger"
        onConfirm={handleArchive}
      />

      <ConfirmDialog
        open={deleteOpen()}
        onOpenChange={setDeleteOpen}
        title={`Delete ${ctx.repo()}?`}
        body="All changesets, branches, tags and settings are removed for good."
        confirmLabel="Delete repository"
        tone="danger"
        typedConfirmation={`${ctx.detail().organization_slug}/${ctx.repo()}`}
        onConfirm={handleDelete}
      />
    </>
  );
};

export default RepoDangerPage;
