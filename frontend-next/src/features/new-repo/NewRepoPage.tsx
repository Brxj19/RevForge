import { useNavigate } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  Show,
  type Component,
} from "solid-js";
import { isRetryable, orgsApi } from "~/lib/api";
import { qk } from "~/lib/query-keys";
import { Button } from "~/ui/Button";
import { Card } from "~/ui/Card";
import { Field, Input, InputGroup } from "~/ui/Field";
import { Select, type SelectOption } from "~/ui/Select";
import { Skeleton } from "~/ui/Skeleton";
import { showToast } from "~/ui/Toast";
import { useCheckRepoSlug, useCreateRepo, useProvisionRepo } from "./queries";
import styles from "./new-repo.module.css";

/** Slug pattern: 2-39 chars, lowercase letters, digits, hyphens. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,37}[a-z0-9]$/;

type Visibility = "private" | "internal" | "public";

const VISIBILITY_OPTIONS: Array<{
  value: Visibility;
  label: string;
  description: string;
}> = [
  {
    value: "private",
    label: "Private",
    description: "Only sigma members with access can see it",
  },
  {
    value: "public",
    label: "Public",
    description: "Anyone signed in to this forge can browse and clone",
  },
];

function deriveRepoSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 39);
}

const NewRepoPage: Component = () => {
  const navigate = useNavigate();

  const [owner, setOwner] = createSignal("");
  const [name, setName] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [visibility, setVisibility] = createSignal<Visibility>("private");

  // Debounced slug for server check
  const [debouncedSlug, setDebouncedSlug] = createSignal("");
  let slugTimer: ReturnType<typeof setTimeout> | undefined;

  const repoSlug = createMemo(() => deriveRepoSlug(name()));

  createEffect(
    on(repoSlug, (s) => {
      clearTimeout(slugTimer);
      slugTimer = setTimeout(() => setDebouncedSlug(s), 300);
    }),
  );

  // Load orgs the user can manage
  const orgsQuery = createQuery(() => ({
    queryKey: qk.orgs,
    queryFn: () => orgsApi.list(),
    retry: (count: number, err: unknown) => count < 2 && isRetryable(err),
  }));

  const manageableOrgs = createMemo(
    () => orgsQuery.data?.filter((o) => o.can_manage) ?? [],
  );

  // Auto-select first manageable org
  createEffect(
    on(manageableOrgs, (orgs) => {
      const first = orgs[0];
      if (first && !owner()) {
        setOwner(first.slug);
      }
    }),
  );

  const ownerOptions = createMemo((): SelectOption[] =>
    manageableOrgs().map((o) => ({
      value: o.slug,
      label: o.display_name,
    })),
  );

  // Local validation
  const localValidation = createMemo(() => {
    const s = repoSlug();
    if (!s) return null;
    if (s.length < 2) return "invalid" as const;
    if (!SLUG_RE.test(s)) return "invalid" as const;
    return null;
  });

  const slugCheck = useCheckRepoSlug(() => owner(), debouncedSlug);

  const slugStatus = createMemo(() => {
    const s = repoSlug();
    if (!s) return null;
    const local = localValidation();
    if (local) return local;
    if (debouncedSlug() !== s) return "checking" as const;
    if (slugCheck.isPending) return "checking" as const;
    if (slugCheck.data) {
      if (slugCheck.data.available) return "available" as const;
      return slugCheck.data.reason ?? "taken";
    }
    return null;
  });

  const slugMessage = createMemo(() => {
    switch (slugStatus()) {
      case "available":
        return `${repoSlug()} is available`;
      case "taken":
        return `${repoSlug()} is already taken in ${owner()}`;
      case "reserved":
        return `"${repoSlug()}" is reserved`;
      case "invalid":
        return "Use 2 to 39 lowercase letters, numbers or dashes";
      case "checking":
        return "Checking availability...";
      default:
        return "";
    }
  });

  const cloneUrl = createMemo(
    () =>
      `hg clone ssh://hg@revforge.example.dev/${owner()}/${repoSlug() || "…"}`,
  );

  const createRepo = useCreateRepo();
  const provisionRepo = useProvisionRepo();

  const canSubmit = () =>
    owner() !== "" &&
    name().trim() !== "" &&
    slugStatus() === "available" &&
    !createRepo.isPending &&
    !provisionRepo.isPending;

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (!canSubmit()) return;
    const orgSlug = owner();
    const repoName = repoSlug();
    createRepo.mutate(
      {
        org: orgSlug,
        data: {
          slug: repoName,
          display_name: name().trim(),
          description: description().trim() || undefined,
          visibility: visibility(),
        },
      },
      {
        onSuccess: () => {
          provisionRepo.mutate(
            { org: orgSlug, repo: repoName },
            {
              onSuccess: () => {
                showToast({ message: "Repository created" });
                navigate(
                  `/${encodeURIComponent(orgSlug)}/${encodeURIComponent(repoName)}`,
                );
              },
              onError: () => {
                // Repo was created but provision failed; still navigate to it
                showToast({
                  message:
                    "Repository created but provisioning failed. You can retry from the repository page.",
                  tone: "err",
                });
                navigate(
                  `/${encodeURIComponent(orgSlug)}/${encodeURIComponent(repoName)}`,
                );
              },
            },
          );
        },
      },
    );
  };

  return (
    <div class={styles.page}>
      <h1 class="h1">New repository</h1>
      <p class={styles.lead}>
        It's created empty. Push your first changeset after it's provisioned.
      </p>
      <Card style={{ "margin-top": "20px" }}>
        <form onSubmit={handleSubmit}>
          <div class={styles.form}>
            <Field label="Owner">
              <Show
                when={!orgsQuery.isPending}
                fallback={<Skeleton width="240px" height={36} />}
              >
                <Select
                  label="Owner"
                  options={ownerOptions()}
                  value={owner()}
                  onChange={setOwner}
                />
              </Show>
            </Field>
            <Field label="Name">
              <InputGroup
                prefix={<span class={styles.slugPrefix}>{owner()}/</span>}
                placeholder="payments-api"
                value={name()}
                onInput={(
                  e: InputEvent & { currentTarget: HTMLInputElement },
                ) => setName(e.currentTarget.value)}
                autocomplete="off"
                spellcheck={false}
              />
              <Show when={repoSlug()}>
                <span
                  class={styles.slugStatus}
                  data-status={slugStatus() ?? undefined}
                >
                  {slugMessage()}
                </span>
              </Show>
            </Field>
            <Field
              label={
                <>
                  Description{" "}
                  <span style={{ color: "var(--subtle)" }}>(optional)</span>
                </>
              }
            >
              <Input
                value={description()}
                onInput={(e) => setDescription(e.currentTarget.value)}
              />
            </Field>
            <Field label="Visibility">
              <For each={VISIBILITY_OPTIONS}>
                {(opt) => (
                  <label class={styles.chk}>
                    <input
                      type="radio"
                      name="visibility"
                      checked={visibility() === opt.value}
                      onChange={() => setVisibility(opt.value)}
                    />
                    <span>
                      {opt.label}
                      <small>{opt.description}</small>
                    </span>
                  </label>
                )}
              </For>
            </Field>
            <Field label="You'll clone it with">
              <div class={styles.clonePreview}>
                <code>{cloneUrl()}</code>
              </div>
            </Field>
          </div>
          <div class={styles.formFoot}>
            <a href="/">
              <Button variant="ghost" type="button">
                Cancel
              </Button>
            </a>
            <Button
              variant="primary"
              type="submit"
              disabled={!canSubmit()}
              loading={createRepo.isPending || provisionRepo.isPending}
            >
              Create repository
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default NewRepoPage;
