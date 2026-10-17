import { loaded } from "~/lib/query";
import { useRepo } from "./context";
import { createRefsQuery } from "./queries";

/**
 * "File history" links keep the revision the reader is on. History filters by named branch only,
 * so a ?rev= that is a branch becomes ?branch=; tags, bookmarks and hashes fall back to all history.
 */
export function createHistoryHref() {
  const repo = useRepo();
  const refs = createRefsQuery(repo.org, repo.repo, () => true);
  return (path?: string) => {
    const rev = repo.rev();
    const branch =
      rev && loaded(refs)?.branches.some((b) => b.name === rev)
        ? rev
        : undefined;
    return repo.href("history", { path: path || undefined, branch });
  };
}
