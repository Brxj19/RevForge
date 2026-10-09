import { apiUrl, path, request, withQuery } from "./client";
import type {
  ChangesetDetail,
  ChangesetList,
  CodeSearchResponse,
  ContentKind,
  RepositoryBlame,
  RepositoryBlameLine,
  RepositoryBrowseFile,
  RepositoryBrowseResult,
  RepositoryDetail,
  RepositoryFileSearchResponse,
  RepositoryProvisionResponse,
  RepositoryRefs,
  RepositoryStats,
  RepositorySummary,
  RepositoryTransportMetadata,
} from "./types";

/** Every dynamic segment goes through `path` (F7): slugs and nodes can't add path segments. */
const R = (org: string, repo: string) =>
  path`/organizations/${org}/repositories/${repo}`;

const IMAGE = /\.(png|jpe?g|gif|webp|bmp|ico)$/i;
const FONT = /\.(woff2?|ttf|otf|eot)$/i;

/** Fallback while the backend only sends is_binary (screen-map "Phase 1 changes"). */
function legacyKind(p: string, isBinary: boolean): ContentKind {
  if (!isBinary) return "text";
  if (IMAGE.test(p)) return "image";
  if (FONT.test(p)) return "font";
  return "binary";
}

type RawFile = Omit<
  RepositoryBrowseFile,
  "content_kind" | "size" | "language"
> &
  Partial<Pick<RepositoryBrowseFile, "content_kind" | "size" | "language">>;

/** Fills the Phase 1 file fields from the legacy ones so the UI works against either backend. */
export function normalizeBrowse(
  raw: RepositoryBrowseResult | RawFile,
): RepositoryBrowseResult {
  if (raw.kind !== "file") return raw;
  return {
    ...raw,
    content_kind:
      raw.content_kind ?? legacyKind(raw.path, Boolean(raw.is_binary)),
    size: raw.size ?? raw.size_when_known ?? null,
    language: raw.language ?? null,
  };
}

type RawBlameLine = Partial<RepositoryBlameLine> & {
  line_number: number;
  content: string;
  revision?: string;
  short_revision?: string;
  author_email_when_available?: string | null;
};

/** Accepts the pre-Phase-1 blame shape (revision/short_revision) too. */
export function normalizeBlame(
  raw: Omit<Partial<RepositoryBlame>, "lines"> & {
    lines: RawBlameLine[];
    path: string;
  },
): RepositoryBlame {
  return {
    revision: raw.revision ?? "",
    path: raw.path,
    is_binary: raw.is_binary ?? false,
    is_too_large: raw.is_too_large ?? false,
    lines: raw.lines.map((l) => {
      const node = l.node ?? l.revision ?? "";
      return {
        line_number: l.line_number,
        origin_line: l.origin_line ?? l.line_number,
        node,
        short_node: l.short_node ?? l.short_revision ?? node.slice(0, 12),
        author_name: l.author_name ?? "",
        author_email: l.author_email ?? l.author_email_when_available ?? null,
        date: l.date ?? null,
        summary: l.summary ?? "",
        path: l.path ?? raw.path,
        content: l.content,
      };
    }),
  };
}

export const reposApi = {
  list: (org: string, opts: { includeArchived?: boolean } = {}) =>
    request<RepositorySummary[]>(
      withQuery(path`/organizations/${org}/repositories`, {
        include_archived: opts.includeArchived || undefined,
      }),
    ),
  get: (org: string, repo: string) => request<RepositoryDetail>(R(org, repo)),
  /** Admins retry provisioning (I36). Mutation: CSRF header required. */
  provision: (org: string, repo: string, csrf: string | null) =>
    request<RepositoryProvisionResponse>(`${R(org, repo)}/provision`, {
      method: "POST",
      csrf,
    }),
  transport: (org: string, repo: string) =>
    request<RepositoryTransportMetadata>(`${R(org, repo)}/transport`),
  refs: (org: string, repo: string) =>
    request<RepositoryRefs>(`${R(org, repo)}/refs`),
  browse: async (
    org: string,
    repo: string,
    opts: { rev?: string; path?: string } = {},
  ) =>
    normalizeBrowse(
      await request<RepositoryBrowseResult>(
        withQuery(`${R(org, repo)}/browse`, {
          revision: opts.rev,
          path: opts.path,
        }),
      ),
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
  /** A full node or a hex prefix of at least 6 digits (I11). */
  changeset: (org: string, repo: string, node: string) =>
    request<ChangesetDetail>(`${R(org, repo)}${path`/changesets/${node}`}`),
  blame: async (
    org: string,
    repo: string,
    opts: { path: string; rev?: string },
  ) =>
    normalizeBlame(
      await request<RepositoryBlame>(
        withQuery(`${R(org, repo)}/blame`, {
          path: opts.path,
          revision: opts.rev,
        }),
      ),
    ),
  /** API-GAP: stats — GET R/stats?rev. */
  stats: (org: string, repo: string, opts: { rev?: string } = {}) =>
    request<RepositoryStats>(
      withQuery(`${R(org, repo)}/stats`, { rev: opts.rev }),
    ),
  /**
   * API-GAP: raw — URL of GET R/raw?rev&path. Used for <img src> (server sends PNG/JPEG/GIF/WebP
   * inline, everything else as an attachment) and for downloads.
   */
  rawUrl: (org: string, repo: string, opts: { path: string; rev?: string }) =>
    apiUrl(
      withQuery(`${R(org, repo)}/raw`, { rev: opts.rev, path: opts.path }),
    ),
  /** API-GAP: raw — the file's bytes (downloads). */
  rawBlob: (org: string, repo: string, opts: { path: string; rev?: string }) =>
    request<Blob>(
      withQuery(`${R(org, repo)}/raw`, { rev: opts.rev, path: opts.path }),
      { responseType: "blob" },
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
  /** API-GAP: search-code — literal, case-insensitive (q 2..200 chars, no NUL/CR/LF). */
  searchCode: (
    org: string,
    repo: string,
    opts: { q: string; rev?: string; limit?: number },
  ) =>
    request<CodeSearchResponse>(
      withQuery(`${R(org, repo)}/search/code`, {
        q: opts.q,
        rev: opts.rev,
        limit: opts.limit,
      }),
    ),
};
