import { For, Show } from "solid-js";
import type { RepositoryTreeEntry } from "~/lib/api";
import { absoluteTime, shortAge } from "~/lib/format";
import { FileIcon, FolderIcon } from "~/ui/icons";
import styles from "./code.module.css";

export interface FileTableProps {
  entries: readonly RepositoryTreeEntry[];
  /** Accessible caption, e.g. "Files in src". */
  caption: string;
  hrefFor: (path: string) => string;
  changesetHref: (node: string) => string;
  /** Parent folder path for the ".." row (omit at the root). */
  parent?: string;
}

/** Name · last changeset message · age (prototype fileTable). Folders first, then files. */
export function FileTable(props: FileTableProps) {
  return (
    <table class={styles.files}>
      <caption class="visually-hidden">{props.caption}</caption>
      <thead class="visually-hidden">
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Last changeset</th>
          <th scope="col">Age</th>
        </tr>
      </thead>
      <tbody>
        <Show when={props.parent !== undefined}>
          <tr>
            <td colSpan={3}>
              <a
                class={styles.fName}
                href={props.hrefFor(props.parent ?? "")}
                aria-label="Parent folder"
              >
                <FolderIcon name="" open />
                ..
              </a>
            </td>
          </tr>
        </Show>
        <For each={props.entries}>
          {(e) => (
            <tr>
              <td>
                <a class={styles.fName} href={props.hrefFor(e.path)}>
                  <Show
                    when={e.kind === "directory"}
                    fallback={<FileIcon name={e.name} />}
                  >
                    <FolderIcon name={e.name} />
                  </Show>
                  <span>{e.name}</span>
                  <Show when={e.kind === "directory"}>
                    <span class="visually-hidden"> (folder)</span>
                  </Show>
                </a>
              </td>
              <td class={styles.fMsg}>
                <Show when={e.last_changeset}>
                  {(c) => (
                    <a href={props.changesetHref(c().node)} title={c().summary}>
                      {c().summary}
                    </a>
                  )}
                </Show>
              </td>
              <td class={styles.fAge}>
                <Show when={e.last_changeset}>
                  {(c) => (
                    <time datetime={c().date} title={absoluteTime(c().date)}>
                      {shortAge(c().date)} ago
                    </time>
                  )}
                </Show>
              </td>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  );
}
