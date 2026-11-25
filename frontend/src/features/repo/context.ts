import { createContext, useContext, type Accessor } from "solid-js";
import type { RepositoryDetail } from "~/lib/api";

export interface RepoContextValue {
  org: Accessor<string>;
  repo: Accessor<string>;
  detail: Accessor<RepositoryDetail>;
  /** ?rev= from the URL; "" means the repository's default. */
  rev: Accessor<string>;
  /** "/sigma/sigma-reckitt", segments encoded. */
  base: Accessor<string>;
  /** Code route for a repository path, keeping the current rev unless overridden. */
  codeHref: (
    repoPath: string,
    query?: { rev?: string; view?: string; L?: string },
  ) => string;
  /** Refetch the repository record (provisioning "Check again"). */
  refetch: () => void;
  /** Repo sub-route ("history", "changesets/<node>") with optional query. */
  href: (sub: string, query?: Record<string, string | undefined>) => string;
}

export const RepoContext = createContext<RepoContextValue>();

/** Repository, revision and URL helpers for pages inside RepoLayout. */
export function useRepo(): RepoContextValue {
  const ctx = useContext(RepoContext);
  if (!ctx) throw new Error("useRepo must be used inside RepoLayout");
  return ctx;
}

export function safeDecode(value: string | undefined): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export const encodePath = (p: string) =>
  p.split("/").filter(Boolean).map(encodeURIComponent).join("/");

export function queryString(
  query: Record<string, string | undefined> = {},
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v) params.set(k, v);
  const s = params.toString();
  return s ? `?${s}` : "";
}
