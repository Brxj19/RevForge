import { Match, Show, Switch, type JSX } from "solid-js";
import { bytes } from "~/lib/format";
import { Button } from "~/ui/Button";
import { EmptyState } from "~/ui/EmptyState";
import { Icon } from "~/ui/icons";
import type { FileKind } from "../file-kinds";
import styles from "../code.module.css";

export interface NotShownProps {
  kind: Extract<FileKind, "binary" | "font" | "too-large" | "symlink">;
  name: string;
  size: number | null;
  /** Symlink target (the file's content for symlinks). */
  target?: string | null;
  /** Code route for the target when it resolves inside the repository. */
  targetHref?: string | null;
  rawHref: string;
  onDownload: () => void;
  downloading?: boolean;
}

/** Files RevForge doesn't render (DESIGN.md §7.3 "Not shown"): never fetched into the viewer. */
export function NotShown(props: NotShownProps) {
  const actions = (): JSX.Element => (
    <>
      <Button onClick={() => props.onDownload()} loading={props.downloading}>
        <Icon name="down" size={14} />
        {props.downloading ? "Downloading…" : "Download"}
      </Button>
      <a
        class="link"
        href={props.rawHref}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Icon name="ext" size={14} /> View raw
      </a>
    </>
  );
  return (
    <Switch>
      <Match when={props.kind === "symlink"}>
        <EmptyState
          art="binary-file"
          title="Symbolic link"
          body={
            <>
              {props.name} points to{" "}
              <Show
                when={props.targetHref}
                fallback={
                  <code class={styles.symlink}>{props.target ?? "?"}</code>
                }
              >
                {(href) => (
                  <a class="link" href={href()}>
                    <code class={styles.symlink}>{props.target}</code>
                  </a>
                )}
              </Show>
              . RevForge doesn't follow links when browsing.
            </>
          }
        />
      </Match>
      <Match when={props.kind === "too-large"}>
        <EmptyState
          art="too-large"
          title="File too large to display"
          body={`${props.name} is ${props.size !== null ? bytes(props.size) : "large"}; files over 1 MB aren't rendered. Download it or open the raw file instead.`}
          actions={actions()}
        />
      </Match>
      <Match when={props.kind === "font"}>
        <EmptyState
          art="binary-file"
          title="Font file not shown"
          body={`${props.name} is a font file, so RevForge doesn't render it. Download it or open the raw file instead.`}
          actions={actions()}
        />
      </Match>
      <Match when={true}>
        <EmptyState
          art="binary-file"
          title="Binary file not shown"
          body={`${props.name} is a binary file, so RevForge doesn't render it. Download it or open the raw file instead.`}
          actions={actions()}
        />
      </Match>
    </Switch>
  );
}
