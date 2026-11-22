import { useNavigate } from "@solidjs/router";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { useAuth } from "~/app/auth";
import { MarkdownPreview } from "~/features/code";
import { createRefsQuery, RefPicker, useRepo } from "~/features/repo";
import { pullsApi } from "~/lib/api";
import { plural } from "~/lib/format";
import { useUrlState } from "~/lib/url";
import { Button, ButtonLink } from "~/ui/Button";
import { Card } from "~/ui/Card";
import { ChangeBadge, changeKindOf, DiffBar } from "~/ui/DiffStat";
import { EmptyState } from "~/ui/EmptyState";
import { Field, Input, Textarea } from "~/ui/Field";
import { FileIcon, Icon } from "~/ui/icons";
import { SkeletonText } from "~/ui/Skeleton";
import { Tabs } from "~/ui/Tabs";
import { showToast } from "~/ui/Toast";
import { Pane, WsBody } from "~/ui/WorkspaceLayout";
import { createCompareQuery } from "./queries";
import { ReviewerPicker } from "./ReviewerPicker";
import styles from "./pulls.module.css";

/** Branch comparison and creation form from the prototype's new pull request screen. */
export default function NewPullRequestPage() {
  const repo = useRepo();
  const auth = useAuth();
  const navigate = useNavigate();
  const refs = createRefsQuery(repo.org, repo.repo, () => true);
  const [url, setUrl] = useUrlState({ base: "default", head: "" });
  const [title, setTitle] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [draft, setDraft] = createSignal(false);
  const [submitting, setSubmitting] = createSignal(false);
  const [reviewers, setReviewers] = createSignal<string[]>([]);
  const canRequestReviews = () =>
    !auth.isAnonymous() &&
    !repo.detail().archived_at &&
    (repo.detail().viewer_role === "write" ||
      repo.detail().viewer_role === "admin");
  const compare = createCompareQuery(
    repo.org,
    repo.repo,
    () => url.base,
    () => url.head,
  );
  const canSubmit = () =>
    Boolean(
      !repo.detail().archived_at &&
      (repo.detail().viewer_role === "write" ||
        repo.detail().viewer_role === "admin") &&
      title().trim() &&
      url.head &&
      url.base !== url.head &&
      compare.isSuccess &&
      !compare.data.identical,
    );
  const submit = async () => {
    if (!canSubmit() || !compare.isSuccess) return;
    const compared = compare.data;
    setSubmitting(true);
    try {
      const pr = await pullsApi.create(
        repo.org(),
        repo.repo(),
        {
          title: title().trim(),
          description: description().trim() || undefined,
          source_revision: compared.head_node,
          target_revision: compared.base_node,
          source_branch: url.head,
          target_branch: url.base,
          draft: draft(),
        },
        auth.csrf(),
      );
      let failed = 0;
      for (const reviewerId of reviewers()) {
        try {
          await pullsApi.addReviewer(
            repo.org(),
            repo.repo(),
            pr.number,
            { reviewer_id: reviewerId, required: false },
            auth.csrf(),
          );
        } catch {
          failed += 1;
        }
      }
      showToast({
        message: failed
          ? `Pull request created, but ${failed} review request${failed === 1 ? "" : "s"} failed. Please add them from the pull request.`
          : draft()
            ? "Draft created"
            : "Pull request created",
      });
      navigate(repo.href(`pulls/${pr.number}`));
    } catch {
      showToast({ message: "Couldn't create pull request" });
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <WsBody>
      <Pane>
        <div class={styles.newPull}>
          <h1 class="h2">Open a pull request</h1>
          <p class={styles.newLead}>
            Choose the branch with your changes and where it should land.
          </p>
          <Show
            when={
              repo.detail().archived_at ||
              (repo.detail().viewer_role !== "write" &&
                repo.detail().viewer_role !== "admin")
            }
          >
            <p class="muted">
              Write access to an active repository is required to open a pull
              request.
            </p>
          </Show>
          <Card class={styles.branchCard}>
            <Icon name="merge" size={16} />
            <span class="muted">Merge into</span>
            <RefPicker
              refs={refs.isSuccess ? refs.data : undefined}
              loading={refs.isPending}
              current={url.base}
              onPick={(ref) => setUrl({ base: ref || "default" })}
              trigger={
                <span class={styles.refTrigger}>
                  <Icon name="branch" size={14} />
                  {url.base}
                </span>
              }
            />
            <Icon name="chevr" size={14} />
            <span class="muted">from</span>
            <RefPicker
              refs={refs.isSuccess ? refs.data : undefined}
              loading={refs.isPending}
              current={url.head}
              onPick={(ref) => setUrl({ head: ref || "default" })}
              trigger={
                <span class={styles.refTrigger}>
                  <Icon name="branch" size={14} />
                  {url.head || "Choose a branch"}
                </span>
              }
            />
            <span class={styles.branchStatus}>
              <Show when={compare.isSuccess && !compare.data.identical}>
                {compare.data?.conflicts
                  ? "Conflicts need attention"
                  : `✓ No conflicts with ${url.base}`}
              </Show>
            </span>
          </Card>
          <Show when={url.head && url.base === url.head}>
            <Card class={styles.newCard}>
              <EmptyState
                art="clean-merge"
                size="inline"
                title="Nothing to compare"
                body="These branches point at the same changeset. Push your work to a branch first, then come back."
              />
            </Card>
          </Show>
          <Show when={url.head && url.base !== url.head}>
            <Switch>
              <Match when={compare.isPending}>
                <SkeletonText
                  lines={["65%", "40%"]}
                  label="Comparing branches"
                />
              </Match>
              <Match when={compare.isError}>
                <Card class={styles.newCard}>
                  <EmptyState
                    art="load-error"
                    size="inline"
                    title="Couldn't compare these branches"
                    actions={
                      <Button size="sm" onClick={() => void compare.refetch()}>
                        Try again
                      </Button>
                    }
                  />
                </Card>
              </Match>
              <Match when={compare.data?.identical}>
                <Card class={styles.newCard}>
                  <EmptyState
                    art="clean-merge"
                    size="inline"
                    title="Nothing to compare"
                    body="These branches point at the same changeset."
                  />
                </Card>
              </Match>
            </Switch>
          </Show>
          <Card class={styles.newCard}>
            <div class={styles.newForm}>
              <Field label="Title">
                <Input
                  value={title()}
                  onInput={(event) => setTitle(event.currentTarget.value)}
                  placeholder="A concise title for your changes"
                  required
                />
              </Field>
              <Field label="Description" kind="group">
                <div class={styles.composer}>
                  <Tabs
                    label="Description editor"
                    panels={[
                      {
                        value: "write",
                        label: "Write",
                        content: (
                          <Textarea
                            aria-label="Description"
                            value={description()}
                            onInput={(event) =>
                              setDescription(event.currentTarget.value)
                            }
                            rows={5}
                          />
                        ),
                      },
                      {
                        value: "preview",
                        label: "Preview",
                        content: (
                          <MarkdownPreview
                            source={description()}
                            path=""
                            codeHref={(path) => repo.codeHref(path)}
                            rawHref={() => ""}
                            compact
                            label="Description preview"
                          />
                        ),
                      },
                    ]}
                  />
                </div>
              </Field>
              <Field
                label="Reviewers"
                kind="group"
                hint={
                  !canRequestReviews()
                    ? "Write access is required to select reviewers."
                    : undefined
                }
              >
                <ReviewerPicker
                  org={repo.org()}
                  repo={repo.repo()}
                  enabled={canRequestReviews()}
                  disabled={submitting()}
                  excluded={[auth.user()?.id ?? ""]}
                  selected={reviewers()}
                  onChange={setReviewers}
                />
              </Field>
              <label class={styles.draftChoice}>
                <input
                  type="checkbox"
                  checked={draft()}
                  onChange={(event) => setDraft(event.currentTarget.checked)}
                />
                <span>
                  Open as a draft
                  <small>
                    Reviews and merging open up once you mark it ready
                  </small>
                </span>
              </label>
            </div>
            <div class={styles.newFooter}>
              <ButtonLink href={repo.href("pulls")} variant="ghost">
                Cancel
              </ButtonLink>
              <Button
                variant="primary"
                disabled={!canSubmit()}
                loading={submitting()}
                onClick={() => void submit()}
              >
                Open pull request
              </Button>
            </div>
          </Card>
          <Show when={compare.data && !compare.data.identical && compare.data}>
            {(data) => (
              <>
                <div class={styles.prStats}>
                  <b>{plural(data().changesets.length, "changeset")}</b>
                  <b>{plural(data().files.length, "file")} changed</b>
                  <span class="add">
                    +
                    {data().files.reduce(
                      (sum, file) => sum + file.insertions,
                      0,
                    )}
                  </span>
                  <span class="del">
                    −
                    {data().files.reduce(
                      (sum, file) => sum + file.deletions,
                      0,
                    )}
                  </span>
                </div>
                <Card>
                  <For each={data().files}>
                    {(file) => (
                      <div class={styles.newFile}>
                        <ChangeBadge kind={changeKindOf(file.status)} />
                        <FileIcon
                          name={file.path.split("/").pop() ?? file.path}
                        />
                        <span>{file.path}</span>
                        <span class="add">+{file.insertions}</span>
                        <span class="del">−{file.deletions}</span>
                        <DiffBar
                          additions={file.insertions}
                          deletions={file.deletions}
                        />
                      </div>
                    )}
                  </For>
                </Card>
              </>
            )}
          </Show>
        </div>
      </Pane>
    </WsBody>
  );
}
