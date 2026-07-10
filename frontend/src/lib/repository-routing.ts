import type { RepositoryRefs } from "./api";

export function repositorySearch(
  search: string,
  updates: { path?: string | null; revision?: string | null },
) {
  const params = new URLSearchParams(search);
  if (updates.path === undefined) {
    // Preserve current path.
  } else if (updates.path) {
    params.set("path", updates.path);
  } else {
    params.delete("path");
  }

  if (updates.revision === undefined) {
    // Preserve current revision.
  } else if (updates.revision) {
    params.set("revision", updates.revision);
  } else {
    params.delete("revision");
  }

  const next = params.toString();
  return next ? `?${next}` : "";
}

export function repositoryRevisionGroups(
  refs: RepositoryRefs | undefined,
  selectedRevision: string | null,
) {
  const currentRevision = selectedRevision?.trim() ?? "";
  const groups = [
    { label: "Branches", refs: refs?.branches ?? [] },
    { label: "Bookmarks", refs: refs?.bookmarks ?? [] },
    { label: "Tags", refs: refs?.tags ?? [] },
  ].filter((group) => group.refs.length > 0);

  const hasCurrentRevision =
    currentRevision.length > 0 &&
    groups.some((group) =>
      group.refs.some(
        (ref) => ref.name === currentRevision || ref.node === currentRevision,
      ),
    );

  return { currentRevision, groups, hasCurrentRevision };
}
