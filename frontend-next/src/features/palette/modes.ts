import type { IconName } from "~/ui/icons";

export type PaletteModeId =
  | "default"
  | "actions"
  | "people"
  | "projects"
  | "files"
  | "revisions"
  | "search";

export interface PaletteMode {
  prefix: string;
  id: Exclude<PaletteModeId, "default">;
  label: string;
  hint: string;
  icon: IconName;
  /** Anonymous visitors only get Projects, Files, Revisions and Code search (DESIGN.md §7.1). */
  anonymous: boolean;
  /** Needs a repository in the URL. */
  repoScoped: boolean;
}

// Prefixes from the prototype's MODES (DESIGN.md §7.1).
export const MODES: readonly PaletteMode[] = [
  {
    prefix: ">",
    id: "actions",
    label: "Actions",
    hint: "Run a command",
    icon: "zap",
    anonymous: false,
    repoScoped: false,
  },
  {
    prefix: "@",
    id: "people",
    label: "People",
    hint: "Members of your organizations",
    icon: "users",
    anonymous: false,
    repoScoped: false,
  },
  {
    prefix: ":",
    id: "projects",
    label: "Projects",
    hint: "Repositories and organizations",
    icon: "repo",
    anonymous: true,
    repoScoped: false,
  },
  {
    prefix: "~",
    id: "files",
    label: "Files",
    hint: "Paths in this repository",
    icon: "file",
    anonymous: true,
    repoScoped: true,
  },
  {
    prefix: "#",
    id: "revisions",
    label: "Revisions",
    hint: "Changesets, branches, tags",
    icon: "commit",
    anonymous: true,
    repoScoped: true,
  },
  {
    prefix: "/",
    id: "search",
    label: "Code search",
    hint: "Text inside files",
    icon: "slash",
    anonymous: true,
    repoScoped: true,
  },
];

/** "~main" → { mode: "files", term: "main" }; only converts when no mode is active yet. */
export function parsePrefix(
  value: string,
  current: PaletteModeId,
): { mode: PaletteModeId; term: string } {
  if (current !== "default") return { mode: current, term: value };
  const m = MODES.find((x) => value.startsWith(x.prefix));
  return m
    ? { mode: m.id, term: value.slice(m.prefix.length).trimStart() }
    : { mode: "default", term: value };
}

export function cycleMode(
  current: PaletteModeId,
  available: readonly PaletteModeId[],
  backwards = false,
): PaletteModeId {
  const ids: PaletteModeId[] = [
    "default",
    ...available.filter((m) => m !== "default"),
  ];
  const i = ids.indexOf(current);
  return ids[(i + (backwards ? ids.length - 1 : 1)) % ids.length] ?? "default";
}
