import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
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
