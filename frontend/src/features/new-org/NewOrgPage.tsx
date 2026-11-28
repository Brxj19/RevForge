import { useNavigate } from "@solidjs/router";
import {
  createEffect,
  createMemo,
  createSignal,
  on,
  Show,
  type Component,
} from "solid-js";
import { Button } from "~/ui/Button";
import { Callout } from "~/ui/Callout";
import { Card } from "~/ui/Card";
import { Field, Input, InputGroup } from "~/ui/Field";
import { useCheckOrgSlug, useCreateOrg } from "./queries";
import styles from "./new-org.module.css";

/** Slug pattern: 2-39 chars, lowercase letters, digits, hyphens, starts and ends with alphanumeric. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,37}[a-z0-9]$/;

function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 39);
}

const NewOrgPage: Component = () => {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = createSignal("");
  const [slug, setSlug] = createSignal("");
  const [slugManual, setSlugManual] = createSignal(false);
  const [description, setDescription] = createSignal("");

  // Debounced slug for server check
  const [debouncedSlug, setDebouncedSlug] = createSignal("");
  let slugTimer: ReturnType<typeof setTimeout> | undefined;

  createEffect(
    on(slug, (s) => {
      clearTimeout(slugTimer);
      slugTimer = setTimeout(() => setDebouncedSlug(s), 300);
    }),
  );

  // Auto-derive slug from display name when not manually edited
  createEffect(
    on(displayName, (name) => {
      if (!slugManual()) {
        setSlug(deriveSlug(name));
      }
    }),
  );

  const localValidation = createMemo(() => {
    const s = slug();
    if (!s) return null;
    if (s.length < 2) return "invalid" as const;
    if (!SLUG_RE.test(s)) return "invalid" as const;
    return null;
  });

  const slugCheck = useCheckOrgSlug(debouncedSlug);

  const slugStatus = createMemo(() => {
    const s = slug();
    if (!s) return null;
    const local = localValidation();
    if (local) return local;
    // If debounced slug does not match current slug, still checking
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
        return `${slug()} is available`;
      case "taken":
        return `${slug()} is already taken`;
      case "reserved":
        return `"${slug()}" is reserved by RevForge`;
      case "invalid":
        return "Use 2 to 39 lowercase letters, numbers or dashes";
      case "checking":
        return "Checking availability...";
      default:
        return "Lowercase letters, numbers and dashes";
    }
  });

  const createOrg = useCreateOrg();

  const canSubmit = () =>
    displayName().trim() !== "" &&
    slugStatus() === "available" &&
    !createOrg.isPending;

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (!canSubmit()) return;
    createOrg.mutate(
      {
        slug: slug(),
        display_name: displayName().trim(),
        description: description().trim() || undefined,
      },
      {
        onSuccess: () => {
          navigate(`/org/${encodeURIComponent(slug())}/overview`);
        },
      },
    );
  };

  return (
    <div class={styles.page}>
      <h1 class="h1">New organization</h1>
      <p class={styles.lead}>
        A shared home for repositories, with its own members and roles.
      </p>
      <Card style={{ "margin-top": "20px" }}>
        <form onSubmit={handleSubmit}>
          <div class={styles.form}>
            <Field label="Display name">
              <Input
                placeholder="Acme Labs"
                value={displayName()}
                onInput={(e) => setDisplayName(e.currentTarget.value)}
              />
            </Field>
            <Field label="URL">
              <InputGroup
                prefix={
                  <span class={styles.slugPrefix}>revforge.example.dev/</span>
                }
                value={slug()}
                onInput={(
                  e: InputEvent & { currentTarget: HTMLInputElement },
                ) => {
                  setSlugManual(true);
                  setSlug(e.currentTarget.value);
                }}
                autocomplete="off"
                spellcheck={false}
              />
              <Show when={slug()}>
                <span
                  class={styles.slugStatus}
                  data-status={slugStatus() ?? undefined}
                >
                  {slugMessage()}
                </span>
              </Show>
              <Show when={!slug()}>
                <span class={styles.slugStatus}>
                  Lowercase letters, numbers and dashes
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
            <Callout tone="info">
              You'll be its first owner. Invite people from the members page
              once it exists.
            </Callout>
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
              loading={createOrg.isPending}
            >
              Create organization
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default NewOrgPage;
