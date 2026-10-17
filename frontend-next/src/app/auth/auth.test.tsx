import { screen, waitFor } from "@solidjs/testing-library";
import { createQuery } from "@tanstack/solid-query";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Show } from "solid-js";
import { describe, expect, it } from "vitest";
import { createAppQueryClient } from "~/app/query-client";
import { ApiError, request } from "~/lib/api";
import { db } from "~/mocks/db";
import { apiError } from "~/mocks/handlers";
import { server } from "~/mocks/server";
import { fixtureUsers, renderWithProviders } from "~/test/render";
import { SessionExpiredDialog, useAuth } from ".";

function Probe() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="status">{auth.status()}</span>
      <span data-testid="user">{auth.user()?.display_name ?? "anonymous"}</span>
      <button
        onClick={() =>
          void auth.login({
            email: "tatwa@sigma.dev",
            password: "correct horse battery",
          })
        }
      >
        login tatwa
      </button>
      <button onClick={() => void auth.logout()}>logout</button>
    </div>
  );
}

describe("F1: cache belongs to the signed-in user", () => {
  it("clears the query cache on login", async () => {
    const { queryClient } = renderWithProviders(() => <Probe />, {
      user: null,
    });
    queryClient.setQueryData(["repos", "sigma"], ["secret-from-previous-user"]);
    db.session = null;
    await userEvent.click(screen.getByRole("button", { name: "login tatwa" }));
    await waitFor(() =>
      expect(screen.getByTestId("user")).toHaveTextContent("Tatwa Prasad"),
    );
    expect(queryClient.getQueryData(["repos", "sigma"])).toBeUndefined();
  });

  it("clears the cache and local session on logout", async () => {
    const { queryClient } = renderWithProviders(() => <Probe />, {
      user: fixtureUsers.brxj19,
      route: "/",
    });
    queryClient.setQueryData(["repos", "sigma"], ["private"]);
    await userEvent.click(screen.getByRole("button", { name: "logout" }));
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("anonymous"),
    );
    expect(queryClient.getQueryData(["repos", "sigma"])).toBeUndefined();
  });

  it("signs out locally even when the logout request fails", async () => {
    server.use(http.post("*/api/v1/auth/logout", () => HttpResponse.error()));
    const { queryClient } = renderWithProviders(() => <Probe />, {
      user: fixtureUsers.brxj19,
    });
    queryClient.setQueryData(["me", "pins"], {
      items: [{ org: "sigma", repo: "payments-api" }],
    });
    await userEvent.click(screen.getByRole("button", { name: "logout" }));
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("anonymous"),
    );
    expect(screen.getByTestId("user")).toHaveTextContent("anonymous");
    expect(queryClient.getQueryData(["me", "pins"])).toBeUndefined();
  });

  it("clears the cache when a different user signs in over an existing session", async () => {
    const { queryClient } = renderWithProviders(() => <Probe />, {
      user: fixtureUsers.brxj19,
    });
    queryClient.setQueryData(["repos", "sigma"], ["brxj19-only"]);
    await userEvent.click(screen.getByRole("button", { name: "login tatwa" }));
    await waitFor(() =>
      expect(screen.getByTestId("user")).toHaveTextContent("Tatwa Prasad"),
    );
    expect(queryClient.getQueryData(["repos", "sigma"])).toBeUndefined();
  });

  it("restores the session from /auth/me on start", async () => {
    renderWithProviders(() => <Probe />);
    expect(screen.getByTestId("status")).toHaveTextContent("loading");
    await waitFor(() =>
      expect(screen.getByTestId("user")).toHaveTextContent("Brxj19"),
    );
  });
});

function ExpiringPage() {
  const q = createQuery(() => ({
    queryKey: ["needs-session"],
    queryFn: () => request<{ ok: boolean }>("/needs-session"),
  }));
  return (
    <>
      <p>Page content</p>
      <Show when={q.data}>
        <p>Loaded</p>
      </Show>
      <SessionExpiredDialog />
    </>
  );
}

describe("F2: a 401 mid-session opens the session dialog", () => {
  it("re-authenticates in place and keeps the page", async () => {
    let calls = 0;
    server.use(
      http.get("*/api/v1/needs-session", () => {
        calls++;
        return calls === 1
          ? apiError(401, "Session expired.")
          : HttpResponse.json({ ok: true });
      }),
    );
    const { history } = renderWithProviders(() => <ExpiringPage />, {
      user: fixtureUsers.brxj19,
      route: "/sigma/sigma-reckitt?rev=default",
    });
    const dialog = await screen.findByRole("dialog", {
      name: "Your session has expired",
    });
    expect(screen.getByLabelText("Email")).toHaveValue("brajesh@sigma.dev");
    expect(dialog).toBeInTheDocument();
    await userEvent.type(
      screen.getByLabelText("Password"),
      "correct horse battery",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Sign in and continue" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Page content")).toBeInTheDocument();
    expect(await screen.findByText("Loaded")).toBeInTheDocument();
    expect(history.get()).toBe("/sigma/sigma-reckitt?rev=default");
  });

  it("sends the user to /login after two failed attempts", async () => {
    server.use(
      http.get("*/api/v1/needs-session", () =>
        apiError(401, "Session expired."),
      ),
    );
    const { history } = renderWithProviders(() => <ExpiringPage />, {
      user: fixtureUsers.brxj19,
      route: "/activity?q=push",
    });
    await screen.findByRole("dialog", { name: "Your session has expired" });
    const pw = screen.getByLabelText("Password");
    for (let i = 0; i < 2; i++) {
      await userEvent.clear(pw);
      await userEvent.type(pw, "wrong password");
      await userEvent.click(
        screen.getByRole("button", { name: "Sign in and continue" }),
      );
      if (i === 0)
        expect(
          await screen.findByText("That email and password don't match."),
        ).toBeInTheDocument();
    }
    await waitFor(() =>
      expect(history.get()).toBe(
        "/login?state=expired&next=%2Factivity%3Fq%3Dpush",
      ),
    );
  });

  it("does not open the dialog for anonymous visitors", async () => {
    server.use(
      http.get("*/api/v1/needs-session", () =>
        apiError(401, "Authentication required."),
      ),
    );
    renderWithProviders(() => <ExpiringPage />, { user: null });
    await waitFor(() =>
      expect(screen.getByText("Page content")).toBeInTheDocument(),
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("F3: retry only network errors and 5xx", () => {
  it("never retries 4xx and retries 5xx/network at most twice", () => {
    const retry = createAppQueryClient().getDefaultOptions().queries?.retry as (
      n: number,
      e: unknown,
    ) => boolean;
    expect(retry(0, new ApiError("nope", 404))).toBe(false);
    expect(retry(0, new ApiError("nope", 401))).toBe(false);
    expect(retry(0, new ApiError("nope", 403))).toBe(false);
    expect(retry(0, new ApiError("down", 503))).toBe(true);
    expect(retry(1, new ApiError("down", 0))).toBe(true);
    expect(retry(2, new ApiError("down", 503))).toBe(false);
  });

  it("requests a 404 exactly once with the default policy", async () => {
    let calls = 0;
    server.use(
      http.get("*/api/v1/missing", () => {
        calls++;
        return apiError(404, "Not Found");
      }),
    );
    function Missing() {
      const q = createQuery(() => ({
        queryKey: ["missing"],
        queryFn: () => request("/missing"),
      }));
      return <span>{q.isError ? "error" : "pending"}</span>;
    }
    renderWithProviders(() => <Missing />, {
      user: fixtureUsers.brxj19,
      queryClient: createAppQueryClient(),
    });
    expect(await screen.findByText("error")).toBeInTheDocument();
    expect(calls).toBe(1);
  });
});
