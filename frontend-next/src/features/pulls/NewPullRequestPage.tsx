import { useNavigate } from "@solidjs/router";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { useAuth } from "~/app/auth";
import { createRefsQuery, RefPicker, useRepo } from "~/features/repo";
import { pullsApi, type DiffFileSummary } from "~/lib/api";
import { plural } from "~/lib/format";
import { Button } from "~/ui/Button";
import { Card } from "~/ui/Card";
import { EmptyState } from "~/ui/EmptyState";
import { Field, InputGroup, Textarea } from "~/ui/Field";
import { Icon } from "~/ui/icons";
import { Pill } from "~/ui/Pill";
import { SkeletonText } from "~/ui/Skeleton";
import { showToast } from "~/ui/Toast";
import { Pane, WsBody } from "~/ui/WorkspaceLayout";
import { createCompareQuery } from "./queries";
import styles from "./pulls.module.css";

/**
 * /:org/:repo/pulls/new (DESIGN.md Phase 3). Branch pickers, compare preview,
 * title/description form, and Create / Create draft buttons.
 */
export default function NewPullRequestPage() {
  const repo = useRepo();
  const auth = useAuth();
  const navigate = useNavigate();

  const refs = createRefsQuery(repo.org, repo.repo, () => true);
  const [baseBranch, setBaseBranch] = createSignal("default");
  const [headBranch, setHeadBranch] = createSignal("");
  const [title, setTitle] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);

  const compare = createCompareQuery(repo.org, repo.repo, baseBranch, headBranch);

  const submit = async (draft: boolean) => {
    if (!title().trim()) {
      showToast({ message: "Title is required" });
      return;
    }
    setSubmitting(true);
    try {
      const pr = await pullsApi.create(
        repo.org(),
        repo.repo(),
        {
          title: title().trim(),
          description: description().trim() || undefined,
          source_branch: headBranch(),
          target_branch: baseBranch(),
          draft,
        },
        auth.csrf(),
      );
      showToast({ message: draft ? "Draft created" : "Pull request created" });
      navigate(repo.href(`pulls/${pr.number}`));
    } catch {
      showToast({ message: "Failed to create pull request" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <WsBody>
      <Pane>
        <Card>
          <h2 class="h2">New pull request</h2>

          <div class={styles.branchPickers}>
            <RefPicker
              refs={refs.isSuccess ? refs.data : undefined}
              loading={refs.isPending}
              current={baseBranch()}
              onPick={setBaseBranch}
              trigger={
                <Button size="sm">
                  <Icon name="branch" size={14} />
                  base: {baseBranch() || "select"}
                </Button>
              }
            />
            <span class={styles.arrow}>
              <Icon name="chevr" size={16} />
            </span>
            <RefPicker
              refs={refs.isSuccess ? refs.data : undefined}
              loading={refs.isPending}
              current={headBranch()}
              onPick={setHeadBranch}
              trigger={
                <Button size="sm">
                  <Icon name="branch" size={14} />
                  compare: {headBranch() || "select"}
                </Button>
              }
            />
          </div>

          <Show when={baseBranch() && headBranch() && baseBranch() !== headBranch()}>
            <Switch>
              <Match when={compare.isPending}>
                <SkeletonText lines={["50%", "30%"]} label="Comparing branches" />
              </Match>
              <Match when={compare.isError}>
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
              </Match>
              <Match when={compare.isSuccess && compare.data}>
                {(data) => (
                  <>
                    <Show when={data().identical}>
                      <EmptyState
                        art="no-results"
                        size="inline"
                        title="These branches are identical"
                        body="There is nothing to compare."
                      />
                    </Show>
                    <Show when={!data().identical}>
                      <div class={styles.compareStats}>
                        <span>
                          {plural(data().changesets.length, "changeset")}
                        </span>
                        <span>
                          {plural(data().files.length, "file")} changed
                        </span>
                        <Show when={data().conflicts}>
                          <Pill tone="red" dot>Conflicts</Pill>
                        </Show>
                      </div>
                      <Show when={data().files.length > 0}>
                        <ul>
                          <For each={data().files}>
                            {(f: DiffFileSummary) => (
                              <li>
                                <span>{f.path}</span>{" "}
                                <span class="add">+{f.insertions}</span>{" "}
                                <span class="del">-{f.deletions}</span>
                              </li>
                            )}
                          </For>
                        </ul>
                      </Show>
                    </Show>
                  </>
                )}
              </Match>
            </Switch>
          </Show>

          <Show when={baseBranch() === headBranch() && headBranch()}>
            <EmptyState
              art="no-results"
              size="inline"
              title="Same branch"
              body="Select a different head branch to compare."
            />
          </Show>
        </Card>

        <Card>
          <div class={styles.formGrid}>
            <Field label="Title">
              <InputGroup
                aria-label="Title"
                placeholder="A concise title for your changes"
                value={title()}
                onInput={(e) => setTitle(e.currentTarget.value)}
                required
              />
            </Field>
            <Field label="Description">
              <Textarea
                aria-label="Description"
                placeholder="Describe the changes (optional)"
                value={description()}
                onInput={(e) => setDescription(e.currentTarget.value)}
                rows={5}
              />
            </Field>
            <div class={styles.formActions}>
              <Button
                variant="primary"
                loading={submitting()}
                disabled={!title().trim() || !headBranch() || baseBranch() === headBranch()}
                onClick={() => void submit(false)}
              >
                Create pull request
              </Button>
              <Button
                loading={submitting()}
                disabled={!title().trim() || !headBranch() || baseBranch() === headBranch()}
                onClick={() => void submit(true)}
              >
                Create draft
              </Button>
            </div>
          </div>
        </Card>
      </Pane>
    </WsBody>
  );
}
