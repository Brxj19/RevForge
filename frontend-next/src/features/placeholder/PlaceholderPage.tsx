import { Show } from "solid-js";
import { ButtonLink } from "~/ui/Button";
import { Card } from "~/ui/Card";
import { EmptyState } from "~/ui/EmptyState";
import { DocumentPage } from "~/ui/WorkspaceLayout";
import styles from "./PlaceholderPage.module.css";

export interface PlaceholderPageProps {
  /** Screen name from the screen map, e.g. "History". */
  screen: string;
  /** Migration phase that builds it (screen-map.md). */
  phase: number;
  /** Prototype hash route for reference, e.g. "#/r/sigma-reckitt/history". */
  prototype?: string;
}

/** "Not built yet" stand-in so every route in the table resolves and navigation works (Phase 0). */
export default function PlaceholderPage(props: PlaceholderPageProps) {
  return (
    <DocumentPage>
      <h1 class="h1">{props.screen}</h1>
      <Card class={styles.card}>
        <EmptyState
          art="empty-folder"
          title="Not built yet"
          body={`This screen arrives in phase ${props.phase} of the redesign. The route works today so links and navigation can be tested.`}
          actions={
            <>
              <ButtonLink href="/" variant="primary">
                Go home
              </ButtonLink>
              <ButtonLink href="/dev/ui">Open the UI kit</ButtonLink>
            </>
          }
        />
        <Show when={props.prototype}>
          <p class={styles.ref}>
            Prototype:{" "}
            <code>docs/design/revforge-prototype.html{props.prototype}</code>
          </p>
        </Show>
      </Card>
    </DocumentPage>
  );
}
