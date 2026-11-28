import { createEffect, createSignal, on, Show, type Component } from "solid-js";
import { ApiError } from "~/lib/api/client";
import { Button } from "~/ui/Button";
import { Card, CardHeader } from "~/ui/Card";
import { EmptyState } from "~/ui/EmptyState";
import { Field, Input, Textarea } from "~/ui/Field";
import { SkeletonText } from "~/ui/Skeleton";
import { useProfile, useSaveProfile } from "./queries";
import styles from "./settings.module.css";

const ProfilePage: Component = () => {
  const profile = useProfile();
  const save = useSaveProfile();

  const [displayName, setDisplayName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [aliases, setAliases] = createSignal("");
  const [dirty, setDirty] = createSignal(false);

  // Populate form when data loads
  createEffect(
    on(
      () => profile.data,
      (data) => {
        if (data && !dirty()) {
          setDisplayName(data.display_name);
          setEmail(data.email);
          setAliases(data.author_aliases.join("\n"));
        }
      },
    ),
  );

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    save.mutate({
      display_name: displayName(),
      email: email(),
      author_aliases: aliases()
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    });
    setDirty(false);
  };

  return (
    <Show
      when={!profile.isPending}
      fallback={
        <Card>
          <CardHeader>
            <h2 class="h2">Profile</h2>
          </CardHeader>
          <div class={styles.form}>
            <SkeletonText lines={["40%"]} label="Loading profile" />
            <SkeletonText lines={["60%"]} />
            <SkeletonText lines={["80%"]} />
          </div>
        </Card>
      }
    >
      <Show
        when={!profile.isError}
        fallback={
          <EmptyState
            art="load-error"
            title="Couldn't load your profile"
            body="Check your connection and try again."
            requestId={
              profile.error instanceof ApiError
                ? profile.error.requestId
                : undefined
            }
            actions={
              <Button onClick={() => void profile.refetch()}>Try again</Button>
            }
          />
        }
      >
        <Card>
          <CardHeader>
            <h2 class="h2">Profile</h2>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <div class={styles.form}>
              <div class={styles.avatarRow}>
                <span class={styles.profileAvatar}>
                  {displayName()?.[0]?.toUpperCase() ?? "?"}
                </span>
                <Button size="sm" type="button">
                  Change picture
                </Button>
              </div>
              <Field label="Display name">
                <Input
                  value={displayName()}
                  onInput={(e) => {
                    setDisplayName(e.currentTarget.value);
                    setDirty(true);
                  }}
                />
              </Field>
              <Field
                label="Email"
                hint="Used to match changeset authors to your account."
              >
                <Input
                  type="email"
                  value={email()}
                  onInput={(e) => {
                    setEmail(e.currentTarget.value);
                    setDirty(true);
                  }}
                />
              </Field>
              <Field
                label="Changeset author aliases"
                hint="Other author strings that are you, one per line."
              >
                <Textarea
                  value={aliases()}
                  rows={3}
                  onInput={(e) => {
                    setAliases(e.currentTarget.value);
                    setDirty(true);
                  }}
                />
              </Field>
            </div>
            <div class={styles.formFoot}>
              <Button type="submit" variant="primary" loading={save.isPending}>
                {save.isPending ? "Saving" : "Save profile"}
              </Button>
            </div>
          </form>
        </Card>
      </Show>
    </Show>
  );
};

export default ProfilePage;
