import type { ChangesetDetail, ChangesetSummary } from "~/lib/api";
import { plural } from "~/lib/format";

type Stats = Pick<
  ChangesetSummary,
  | "parents"
  | "files_changed_count_when_available"
  | "insertions_when_available"
  | "deletions_when_available"
  | "is_merge"
  | "has_binary"
  | "stats_too_large"
>;

export const firstLine = (message: string) => message.split("\n")[0] ?? "";

export const messageBody = (message: string) =>
  message.split("\n").slice(1).join("\n").trim();

export const isMerge = (c: Pick<Stats, "parents" | "is_merge">) =>
  c.is_merge ?? c.parents.length > 1;

/** A merge with nothing beyond the merge itself (DESIGN.md §11: never "0 files"). */
export const isCleanMerge = (c: Stats) =>
  isMerge(c) && c.files_changed_count_when_available === 0;

export type RowStat =
  | { kind: "clean-merge" }
  | { kind: "too-large" }
  | { kind: "binary" }
  | { kind: "counts"; insertions: number; deletions: number }
  | { kind: "unknown" };

/** What the history row shows on the right: +a −d, "clean merge", "binary" or "stats too large". */
export function rowStat(c: Stats): RowStat {
  if (isCleanMerge(c)) return { kind: "clean-merge" };
  if (c.stats_too_large) return { kind: "too-large" };
  const a = c.insertions_when_available;
  const d = c.deletions_when_available;
  if (c.has_binary && !a && !d) return { kind: "binary" };
  if (a === null || d === null) return { kind: "unknown" };
  return { kind: "counts", insertions: a, deletions: d };
}

/** Git-style stats line for the hover card and detail pane. */
export function statsSentence(c: Stats): string {
  const s = rowStat(c);
  const files = c.files_changed_count_when_available;
  const changed = files === null ? "" : `${plural(files, "file")} changed`;
  switch (s.kind) {
    case "clean-merge":
      return "Clean merge: no changes beyond the merge itself";
    case "too-large":
      return changed
        ? `${changed}; too large to count lines`
        : "Too large to count lines";
    case "binary":
      return files === 1
        ? "1 file changed (binary)"
        : `${changed} (binary)`.trim();
    case "unknown":
      return changed || "Stats unavailable";
    case "counts":
      return `${changed}, ${plural(s.insertions, "insertion")}(+), ${plural(s.deletions, "deletion")}(−)`;
  }
}

/** Detail/summary merged: the detail wins where it has the field. */
export function withDetail(
  summary: ChangesetSummary | undefined,
  detail: ChangesetDetail | undefined,
): ChangesetSummary | undefined {
  if (!detail) return summary;
  return { ...(summary ?? {}), ...detail } as ChangesetSummary;
}

export const changesetPath = (base: string, node: string) =>
  `${base}/changesets/${encodeURIComponent(node)}`;

export const browsePath = (base: string, node: string) =>
  `${base}/code?rev=${encodeURIComponent(node)}`;
