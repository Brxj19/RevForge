import type { JSX } from "solid-js";
import type { FuzzyPart } from "~/lib/fuzzy";
import type { IconName } from "~/ui/icons";

export interface PaletteItem {
  id: string;
  group: string;
  label: string;
  /** Extra searchable text (email, full path, node). */
  alt?: string;
  detail?: string;
  icon?: IconName;
  /** File name for a file icon instead of `icon`. */
  fileName?: string;
  kbd?: string;
  run: () => void;
  preview?: () => JSX.Element;
  /** Precomputed highlight (server-side matches). */
  parts?: FuzzyPart[];
  /** Already matched by the server: skip fuzzy filtering (code search). */
  serverMatched?: boolean;
}

export interface ScoredItem extends PaletteItem {
  score: number;
}
