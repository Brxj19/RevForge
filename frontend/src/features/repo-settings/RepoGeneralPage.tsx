import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  type Component,
} from "solid-js";
import { createRefsQuery, useRepo } from "~/features/repo";
import { loaded } from "~/lib/query";
import { Button } from "~/ui/Button";
import { Card, CardHeader } from "~/ui/Card";
import { Field, Input, InputGroup, Textarea } from "~/ui/Field";
import { Icon } from "~/ui/icons";
import { Pill } from "~/ui/Pill";
import { Select, type SelectOption } from "~/ui/Select";
import { useUpdateRepo } from "./queries";
import styles from "./repo-settings.module.css";

type Visibility = "public" | "internal" | "private";

const VISIBILITY_OPTIONS: {
  value: Visibility;
  icon: "globe" | "org" | "lock";
  label: string;
  description: string;
}[] = [
  {
    value: "public",
    icon: "globe",
    label: "Public",
    description:
      "Anyone, including people who aren't signed in, can browse and clone.",
  },
  {
    value: "internal",
    icon: "org",
    label: "Internal",
    description: "Every member of the organization can browse and clone.",
  },
  {
    value: "private",
    icon: "lock",
    label: "Private",
    description: "Only people with a grant or an organization admin role.",
  },
];

const RepoGeneralPage: Component = () => {
  const ctx = useRepo();
  const updateRepo = useUpdateRepo(ctx.org, ctx.repo);
  const refsQuery = createRefsQuery(
    ctx.org,
    ctx.repo,
    () => ctx.detail().is_browsable,
  );

  const [displayName, setDisplayName] = createSignal("");
  const [slug, setSlug] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [defaultBranch, setDefaultBranch] = createSignal("default");
  const [visibility, setVisibility] = createSignal<Visibility>("private");

  const branchOptions = createMemo<SelectOption[]>(() => {
    const branches = loaded(refsQuery)?.branches ?? [];
    const names = Array.from(
      new Set(["default", ...branches.map((b) => b.name)]),
    );
    return names.map((name) => ({ value: name, label: name }));
  });

  // Sync form from server data
  createEffect(
    on(
      () => ctx.detail(),
      (data) => {
        if (data) {
          setDisplayName(data.display_name);
          setSlug(data.slug);
          setDescription(data.description ?? "");
          setVisibility(data.visibility);
        }
      },
    ),
  );

  const isDirty = () => {
    const data = ctx.detail();
    if (!data) return false;
    return (
      displayName() !== data.display_name ||
      slug() !== data.slug ||
      description() !== (data.description ?? "") ||
      visibility() !== data.visibility
    );
  };

  const handleDiscard = () => {
    const data = ctx.detail();
    if (data) {
      setDisplayName(data.display_name);
      setSlug(data.slug);
      setDescription(data.description ?? "");
      setVisibility(data.visibility);
    }
  };

  const handleSave = () => {
    const data = ctx.detail();
    const payload: Record<string, string | undefined> = {};
    if (displayName() !== data.display_name)
      payload.display_name = displayName();
    if (slug() !== data.slug) payload.slug = slug();
    if (description() !== (data.description ?? ""))
      payload.description = description();
    if (visibility() !== data.visibility) payload.visibility = visibility();
    updateRepo.mutate(payload);
  };

  return (
    <Card>
      <CardHeader>
        <h2 class="h2">Repository details</h2>
      </CardHeader>
      <div class={styles.form}>
        <Field label="Display name">
          <Input
            value={displayName()}
            onInput={(e) => setDisplayName(e.currentTarget.value)}
          />
        </Field>
        <Field
          label="Slug"
          hint="Changing the slug changes clone URLs. Old URLs redirect for 30 days."
        >
          <InputGroup
            prefix={
              <span class="subtle">{ctx.detail().organization_slug}/</span>
            }
            value={slug()}
            onInput={(e) => setSlug(e.currentTarget.value)}
          />
        </Field>
        <Field label="Description">
          <Textarea
            rows={3}
            value={description()}
            onInput={(e) => setDescription(e.currentTarget.value)}
          />
        </Field>
        <Field label="Default branch" kind="group">
          <div class={styles.branchSelectWrap}>
            <Select
              label="Default branch"
              class={styles.branchSelect}
              lead={<i class={styles.branchDot} aria-hidden="true" />}
              options={branchOptions()}
              value={defaultBranch()}
              onChange={setDefaultBranch}
            />
          </div>
        </Field>
        <Field label="Visibility" kind="group">
          <For each={VISIBILITY_OPTIONS}>
            {(opt) => {
              const isActive = () => visibility() === opt.value;
              return (
                <div
                  class={styles.visOpt}
                  data-active={isActive() ? "" : undefined}
                  role="radio"
                  aria-checked={isActive()}
                  tabindex={0}
                  onClick={() => setVisibility(opt.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setVisibility(opt.value);
                    }
                  }}
                >
                  <span
                    class={styles.visOptIcon}
                    style={{
                      color: isActive() ? "var(--accent)" : "var(--muted)",
                    }}
                  >
                    <Icon name={opt.icon} size={18} />
                  </span>
                  <div>
                    <span class={styles.visOptLabel}>{opt.label}</span>
                    <p class={styles.visOptDesc}>{opt.description}</p>
                  </div>
                  {isActive() && (
                    <span class={styles.visOptCurrent}>
                      <Pill tone="blue">current</Pill>
                    </span>
                  )}
                </div>
              );
            }}
          </For>
          <span class={`hint ${styles.visHint}`}>
            <Icon name="info" size={12} />
            <span>
              Making a repository public needs an organization owner or admin.
              Repository admins can switch between internal and private.
            </span>
          </span>
        </Field>
      </div>
      <div class={styles.formFoot}>
        <Button variant="ghost" disabled={!isDirty()} onClick={handleDiscard}>
          Discard
        </Button>
        <Button
          variant="primary"
          disabled={!isDirty()}
          loading={updateRepo.isPending}
          onClick={handleSave}
        >
          Save changes
        </Button>
      </div>
    </Card>
  );
};

export default RepoGeneralPage;
