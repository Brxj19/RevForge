import { path, request, withQuery } from "./client";
import type {
  ChangesetList,
  RepositoryBlame,
  RepositoryBrowseResult,
  RepositoryDetail,
  RepositoryFileSearchResponse,
  RepositoryRefs,
  RepositorySummary,
  RepositoryTransportMetadata,
} from "./types";

const R = (org: string, repo: string) =>
  path`/organizations/${org}/repositories/${repo}`;

export const reposApi = {
  list: (org: string, opts: { includeArchived?: boolean } = {}) =>
    request<RepositorySummary[]>(
      withQuery(path`/organizations/${org}/repositories`, {
        include_archived: opts.includeArchived || undefined,
      }),
    ),
  get: (org: string, repo: string) => request<RepositoryDetail>(R(org, repo)),
  transport: (org: string, repo: string) =>
    request<RepositoryTransportMetadata>(`${R(org, repo)}/transport`),
  refs: (org: string, repo: string) =>
    request<RepositoryRefs>(`${R(org, repo)}/refs`),
  browse: (
    org: string,
    repo: string,
    opts: { rev?: string; path?: string } = {},
  ) =>
    request<RepositoryBrowseResult>(
      withQuery(`${R(org, repo)}/browse`, {
        revision: opts.rev,
        path: opts.path,
      }),
    ),
  changesets: (
    org: string,
    repo: string,
    opts: { cursor?: string | null; limit?: number } = {},
  ) =>
    request<ChangesetList>(
      withQuery(`${R(org, repo)}/changesets`, {
        cursor: opts.cursor,
        limit: opts.limit,
      }),
    ),
  blame: (org: string, repo: string, opts: { path: string; rev?: string }) =>
    request<RepositoryBlame>(
      withQuery(`${R(org, repo)}/blame`, {
        path: opts.path,
        revision: opts.rev,
      }),
    ),
  searchFiles: (
    org: string,
    repo: string,
    opts: { q: string; rev?: string; limit?: number },
  ) =>
    request<RepositoryFileSearchResponse>(
      withQuery(`${R(org, repo)}/search/files`, {
        q: opts.q,
        revision: opts.rev,
        limit: opts.limit,
      }),
    ),
};
