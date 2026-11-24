import { path, request, withQuery } from "./client";
import type {
  ContributionActivityResponse,
  PublicUser,
  SlugCheckResponse,
  UserSearchResult,
} from "./types";

export const usersApi = {
  search: (opts: {
    q: string;
    scope?: string;
    org?: string;
    repo?: string;
    limit?: number;
  }) =>
    request<{ items: UserSearchResult[] }>(withQuery("/users/search", opts)),

  checkHandle: (h: string) =>
    request<SlugCheckResponse>(withQuery("/users/check-handle", { h })),

  profile: (handle: string) => request<PublicUser>(path`/users/${handle}`),

  contributions: (handle: string) =>
    request<ContributionActivityResponse>(
      path`/users/${handle}/contributions`,
    ),
};
