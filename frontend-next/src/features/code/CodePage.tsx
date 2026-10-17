import { useParams } from "@solidjs/router";
import { createMemo, Match, Switch } from "solid-js";
import {
  createTransportQuery,
  DataError,
  EmptyRepo,
  RevisionRail,
  useRepo,
} from "~/features/repo";
import { Card } from "~/ui/Card";
import { SkeletonText } from "~/ui/Skeleton";
import { Pane, Panes, WsBody } from "~/ui/WorkspaceLayout";
import { Explorer } from "./Explorer";
import { FileTable } from "./FileTable";
import { baseName } from "./file-kinds";
import { FileView } from "./FileView";
import { createBrowseQuery, createChangesetQuery } from "./queries";
import styles from "./code.module.css";

const STATUS_LETTER: Record<string, string> = {
  modified: "M",
  added: "A",
  deleted: "R",
  renamed: "M",
  copied: "A",
};

/** /:org/:repo/code/*path?rev=&view=&L= (DESIGN.md §7.2–7.4). */
export default function CodePage() {
  const repo = useRepo();
  const params = useParams<{ path?: string }>();
  const path = createMemo(() =>
    (params.path ?? "")
      .split("/")
      .filter(Boolean)
      .map((s) => {
        try {
          return decodeURIComponent(s);
        } catch {
          return s;
        }
      })
      .join("/"),
  );
  const parentDir = () => path().split("/").slice(0, -1).join("/");
  const browse = createBrowseQuery(repo.org, repo.repo, repo.rev, path);
  const file = () => (browse.data?.kind === "file" ? browse.data : undefined);
  const dir = () =>
    browse.data?.kind === "directory" ? browse.data : undefined;
  const isFile = () => !!file();
  // The parent listing carries this file's last changeset (shared with the explorer's cache).
  const parent = createBrowseQuery(repo.org, repo.repo, repo.rev, parentDir);
  const node = () => browse.data?.revision || undefined;
  const changeset = createChangesetQuery(repo.org, repo.repo, node);
  const changes = createMemo<Record<string, string>>(() =>
    Object.fromEntries(
      (changeset.data?.changed_files ?? []).map((f) => [
        f.path,
        STATUS_LETTER[f.status] ?? "M",
      ]),
    ),
  );
  const entryOf = () =>
    parent.data?.kind === "directory"
      ? parent.data.entries.find((e) => e.path === path())
      : undefined;
  const emptyRepo = () =>
    browse.data?.kind === "directory" &&
    !browse.data.revision &&
    browse.data.entries.length === 0;
  const transport = createTransportQuery(repo.org, repo.repo, emptyRepo);

  return (
    <WsBody>
      <RevisionRail path={path()} file={isFile()} node={node()} />
      <Panes columns="272px minmax(0,1fr)">
        <Pane flush collapseOnNarrow as="nav" aria-label="Explorer">
          <Explorer path={path()} isFile={isFile()} changes={changes()} />
        </Pane>
        <Pane flush as="section" aria-label={path() || "Repository root"}>
          <Switch>
            <Match when={browse.isPending}>
              <Card>
                <div class={styles.lastc}>
                  <SkeletonText
                    lines={["40%", "90%", "85%", "70%", "80%"]}
                    label="Loading file"
                  />
                </div>
              </Card>
            </Match>
            <Match when={browse.isError}>
              <Card>
                <DataError
                  error={browse.error}
                  what={path() ? baseName(path()) : "this folder"}
                  onRetry={() => void browse.refetch()}
                />
              </Card>
            </Match>
            <Match when={emptyRepo()}>
              <Card>
                <EmptyRepo pushUrl={transport.data?.https.clone_url} />
              </Card>
            </Match>
            <Match when={file()}>
              {(f) => (
                <FileView
                  file={f()}
                  lastChangeset={entryOf()?.last_changeset}
                  changed={changes()[f().path]}
                />
              )}
            </Match>
            <Match when={dir()}>
              {(d) => (
                <Card class={styles.filesCard}>
                  <FileTable
                    entries={d().entries}
                    caption={path() ? `Files in ${path()}` : "Files"}
                    hrefFor={(p) => repo.codeHref(p)}
                    changesetHref={(n) =>
                      repo.href(`changesets/${encodeURIComponent(n)}`)
                    }
                    parent={path() ? parentDir() : undefined}
                  />
                </Card>
              )}
            </Match>
          </Switch>
        </Pane>
      </Panes>
    </WsBody>
  );
}
