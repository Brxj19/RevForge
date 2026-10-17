import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "~/mocks/server";
import { ApiError, isRetryable, path, request, withQuery } from "./client";

describe("path (F7)", () => {
  it("encodes every interpolated segment", () => {
    expect(path`/organizations/${"a/b"}/repositories/${"../x?y#z"}`).toBe(
      "/organizations/a%2Fb/repositories/..%2Fx%3Fy%23z",
    );
  });
  it("refuses dot segments that would change the endpoint", () => {
    expect(() => path`/organizations/${"sigma"}/repositories/${".."}`).toThrow(
      ApiError,
    );
    expect(() => path`/r/${"."}`).toThrow("Invalid path segment.");
    expect(path`/r/${"..."}`).toBe("/r/...");
    expect(path`/r/${".hgignore"}`).toBe("/r/.hgignore");
  });

  it("builds query strings without empty values", () => {
    expect(
      withQuery("/browse", {
        revision: "default",
        path: "src/a b.c",
        x: undefined,
        y: "",
      }),
    ).toBe("/browse?revision=default&path=src%2Fa+b.c");
  });
});

describe("request", () => {
  it("prefixes /api/v1, sends cookies and JSON, and adds CSRF only on mutations", async () => {
    const seen: {
      url: string;
      csrf: string | null;
      type: string | null;
      creds: RequestCredentials;
    }[] = [];
    server.use(
      http.all("*/api/v1/things", ({ request: r }) => {
        seen.push({
          url: r.url,
          csrf: r.headers.get("X-CSRF-Token"),
          type: r.headers.get("Content-Type"),
          creds: r.credentials,
        });
        return HttpResponse.json({ ok: true });
      }),
    );
    await request("/things", { csrf: "tok" });
    await request("/things", { method: "POST", json: { a: 1 }, csrf: "tok" });
    expect(seen[0]!.url).toMatch(/\/api\/v1\/things$/);
    expect(seen[0]!.csrf).toBeNull();
    expect(seen[1]!.csrf).toBe("tok");
    expect(seen[1]!.type).toBe("application/json");
  });

  it("parses the error envelope including request_id (I1)", async () => {
    server.use(
      http.get("*/api/v1/boom", () =>
        HttpResponse.json(
          {
            error: {
              code: "internal_error",
              message: "An unexpected error occurred.",
              request_id: "req-9",
            },
          },
          { status: 500 },
        ),
      ),
    );
    const err = await request("/boom").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 500,
      code: "internal_error",
      requestId: "req-9",
      message: "An unexpected error occurred.",
    });
  });

  it("falls back to FastAPI detail and the X-Request-ID header", async () => {
    server.use(
      http.get("*/api/v1/old", () =>
        HttpResponse.json(
          { detail: "Not Found" },
          { status: 404, headers: { "X-Request-ID": "req-h" } },
        ),
      ),
    );
    await expect(request("/old")).rejects.toMatchObject({
      status: 404,
      message: "Not Found",
      requestId: "req-h",
    });
  });

  it("turns network failures into status 0 errors", async () => {
    server.use(http.get("*/api/v1/down", () => HttpResponse.error()));
    const err = (await request("/down").catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(0);
    expect(err.isNetworkError).toBe(true);
  });

  it("returns undefined for 204", async () => {
    server.use(
      http.post(
        "*/api/v1/auth/logout",
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    await expect(
      request("/auth/logout", { method: "POST", csrf: "t" }),
    ).resolves.toBeUndefined();
  });
});

describe("isRetryable (F3)", () => {
  it("retries only network errors and 5xx", () => {
    expect(isRetryable(new ApiError("x", 0))).toBe(true);
    expect(isRetryable(new ApiError("x", 502))).toBe(true);
    expect(isRetryable(new ApiError("x", 401))).toBe(false);
    expect(isRetryable(new ApiError("x", 404))).toBe(false);
    expect(isRetryable(new ApiError("x", 429))).toBe(false);
    expect(isRetryable(new SyntaxError("Unexpected token"))).toBe(false);
    expect(isRetryable(new TypeError("bug in queryFn"))).toBe(false);
  });
});
