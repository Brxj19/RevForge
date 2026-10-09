import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { qk } from "~/lib/query-keys";
import { server } from "~/mocks/server";
import { ApiError } from "./client";
import { normalizeBlame, normalizeBrowse, reposApi } from "./repos";

describe("reposApi paths (F7)", () => {
  it("encodes a changeset node so it can't add path segments", async () => {
    let seen = "";
    server.use(
      http.get(
        "*/api/v1/organizations/:org/repositories/:repo/changesets/*",
        ({ request }) => {
          seen = new URL(request.url).pathname;
          return HttpResponse.json({});
        },
      ),
    );
    await reposApi.changeset("sigma", "sigma-reckitt", "a/../b");
    expect(seen).toBe(
      "/api/v1/organizations/sigma/repositories/sigma-reckitt/changesets/a%2F..%2Fb",
    );
  });

  it("refuses dot segments outright instead of letting URL resolution climb", () => {
    expect(() => reposApi.changeset("sigma", "sigma-reckitt", "..")).toThrow(
      ApiError,
    );
    expect(() => reposApi.get("sigma", "..")).toThrow(/Invalid path segment/);
  });

  it("encodes org and repo slugs and keeps raw/search parameters in the query string", () => {
    const url = reposApi.rawUrl("si/gma", "re po", {
      path: "docs/a b.md",
      rev: "feature/x",
    });
    expect(url).toBe(
      "/api/v1/organizations/si%2Fgma/repositories/re%20po/raw?rev=feature%2Fx&path=docs%2Fa+b.md",
    );
  });

  it("sends the CSRF token when retrying provisioning", async () => {
    let token: string | null = null;
    server.use(
      http.post(
        "*/api/v1/organizations/:org/repositories/:repo/provision",
        ({ request }) => {
          token = request.headers.get("X-CSRF-Token");
          return HttpResponse.json({});
        },
      ),
    );
    await reposApi.provision("sigma", "ml-experiments", "tok-123");
    expect(token).toBe("tok-123");
  });
});

describe("Phase 2 history, diff and refs requests", () => {
  const R = "*/api/v1/organizations/:org/repositories/:repo";

  it("serialises history filters with URLSearchParams and drops empty ones (F4, F7)", async () => {
    let url: URL | undefined;
    server.use(
      http.get(`${R}/changesets`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({ changesets: [], next_cursor: null });
      }),
    );
    await reposApi.changesets("sigma", "sigma-reckitt", {
      branch: "feature/a&b",
      author: "Brxj19 <b@x>",
      path: "src/a b.cpp",
      q: "100% #1",
      cursor: "f".repeat(40),
      limit: 50,
    });
    expect(url?.pathname).toBe(
      "/api/v1/organizations/sigma/repositories/sigma-reckitt/changesets",
    );
    expect(Object.fromEntries(url!.searchParams)).toEqual({
      branch: "feature/a&b",
      author: "Brxj19 <b@x>",
      path: "src/a b.cpp",
      q: "100% #1",
      cursor: "f".repeat(40),
      limit: "50",
    });
    expect(url?.search).toContain("branch=feature%2Fa%26b");
    await reposApi.changesets("sigma", "sigma-reckitt", { branch: "", q: "" });
    expect(url?.search).toBe("");
  });

  it("encodes the node in the diff path (F7)", async () => {
    let seen = "";
    server.use(
      http.get(`${R}/changesets/:node/diff`, ({ request }) => {
        seen = new URL(request.url).pathname;
        return HttpResponse.json({ content: "", is_truncated: false });
      }),
    );
    await reposApi.changesetDiff("sigma", "sigma-reckitt", "a/b?c");
    expect(seen).toBe(
      "/api/v1/organizations/sigma/repositories/sigma-reckitt/changesets/a%2Fb%3Fc/diff",
    );
    expect(() =>
      reposApi.changesetDiff("sigma", "sigma-reckitt", ".."),
    ).toThrow(ApiError);
  });

  it("asks for closed branches only when requested", async () => {
    const seen: string[] = [];
    server.use(
      http.get(`${R}/refs`, ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json({ branches: [], tags: [], bookmarks: [] });
      }),
    );
    await reposApi.refs("sigma", "sigma-reckitt");
    await reposApi.refs("sigma", "sigma-reckitt", { includeClosed: true });
    expect(seen).toEqual(["", "?include_closed=true"]);
  });

  it("keys history by cleaned filters, apart from the other changeset lists", () => {
    expect(qk.history("o", "r", { q: "", branch: "default" })).toEqual(
      qk.history("o", "r", { branch: "default" }),
    );
    expect(qk.history("o", "r", {})).not.toEqual(
      qk.recentChangesets("o", "r", 6),
    );
    // One invalidation of the list prefix still covers history.
    expect(qk.history("o", "r", {}).slice(0, 3)).toEqual([
      ...qk.changesets("o", "r"),
    ]);
    expect(qk.changesetDiff("o", "r", "n")[0]).not.toBe(
      qk.changeset("o", "r", "n")[0],
    );
    expect(qk.refsWithClosed("o", "r").slice(0, 4)).toEqual([
      ...qk.refs("o", "r"),
    ]);
  });
});

describe("Phase 1 field normalisation", () => {
  it("fills content_kind, size and language from a legacy browse payload", () => {
    const file = normalizeBrowse({
      kind: "file",
      revision: "abc",
      path: "docs/diagram.png",
      content: null,
      language_hint_when_available: "image/png",
      is_binary: true,
      is_too_large: false,
      size_when_known: 10,
    });
    expect(file).toMatchObject({
      content_kind: "image",
      size: 10,
      language: null,
    });
  });

  it("accepts the pre-Phase-1 blame shape", () => {
    const b = normalizeBlame({
      revision: "n",
      path: "a.cpp",
      lines: [
        {
          line_number: 1,
          revision: "0123456789abcdef0123456789abcdef01234567",
          short_revision: "0123456789ab",
          author_name: "A",
          author_email_when_available: "a@x",
          path: "a.cpp",
          content: "x",
        },
      ],
    });
    expect(b.is_binary).toBe(false);
    expect(b.lines[0]).toMatchObject({
      node: "0123456789abcdef0123456789abcdef01234567",
      short_node: "0123456789ab",
      author_email: "a@x",
      origin_line: 1,
      summary: "",
    });
  });
});
