import { useParams } from "@solidjs/router";
import { createEffect, createSignal, on, type Component } from "solid-js";
import { Button } from "~/ui/Button";
import { Card, CardHeader } from "~/ui/Card";
import { Field, Input, Textarea } from "~/ui/Field";
import { useOrgDetail, useUpdateOrg } from "./queries";
import styles from "./orgs.module.css";

const OrgGeneralPage: Component = () => {
  const params = useParams<{ org: string }>();
  const orgQuery = useOrgDetail(() => params.org);
  const updateOrg = useUpdateOrg(() => params.org);

  const [displayName, setDisplayName] = createSignal("");
  const [description, setDescription] = createSignal("");

  // Sync form from server data when it arrives or changes
  createEffect(
    on(
      () => orgQuery.data,
      (data) => {
        if (data) {
          setDisplayName(data.display_name);
          setDescription(data.description ?? "");
        }
      },
    ),
  );

  const isDirty = () => {
    const data = orgQuery.data;
    if (!data) return false;
    return (
      displayName() !== data.display_name ||
      description() !== (data.description ?? "")
    );
  };

  const handleSave = () => {
    updateOrg.mutate({
      display_name: displayName(),
      description: description() || undefined,
    });
  };

  return (
    <Card>
      <CardHeader>
        <h2 class="h2">Organization details</h2>
      </CardHeader>
      <div class={styles.form}>
        <Field label="Display name">
          <Input
            value={displayName()}
            onInput={(e) => setDisplayName(e.currentTarget.value)}
          />
        </Field>
        <Field label="Slug" hint="Appears in every repository URL.">
          <Input value={params.org} disabled />
        </Field>
        <Field label="Description">
          <Textarea
            rows={3}
            value={description()}
            onInput={(e) => setDescription(e.currentTarget.value)}
          />
        </Field>
      </div>
      <div class={styles.formFoot}>
        <Button
          variant="primary"
          disabled={!isDirty()}
          loading={updateOrg.isPending}
          onClick={handleSave}
        >
          Save changes
        </Button>
      </div>
    </Card>
  );
};

export default OrgGeneralPage;
