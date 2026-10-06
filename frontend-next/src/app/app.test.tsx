import { render, screen, waitFor, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { RESERVED_SLUGS } from "~/lib/reserved";
import { db, resetMockDb } from "~/mocks/db";
import { apiError } from "~/mocks/handlers";
import { server } from "~/mocks/server";
import { App } from "./App";
import { createAppQueryClient } from "./query-client";
import { TOP_LEVEL_SEGMENTS } from "./routes";

function renderApp(path: string, opts: { signedIn?: boolean } = {}) {
  resetMockDb({ signedIn: opts.signedIn === false ? null : "brxj19" });
  window.history.replaceState({}, "", path);
  return render(() => (
    <App queryClient={createAppQueryClient({ retry: false })} />
  ));
}

describe("routes", () => {
  it("reserves every top-level segment so /:org can't shadow a route", () => {
    for (const seg of TOP_LEVEL_SEGMENTS)
      expect(RESERVED_SLUGS.has(seg), seg).toBe(true);
  });

  it("shows a placeholder for screens that aren't built yet", async () => {
    renderApp("/sigma/sigma-reckitt/history?branch=default");
    expect(
      await screen.findByRole("heading", { name: "History", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Not built yet" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/phase 2/)).toBeInTheDocument();
  });

  it("redirects legacy repository URLs", async () => {
    renderApp(
      "/organizations/sigma/repositories/sigma-reckitt/history?branch=default",
    );
    await waitFor(() =>
      expect(window.location.pathname + window.location.search).toBe(
        "/sigma/sigma-reckitt/history?branch=default",
      ),
    );
  });

  it("treats reserved org slugs as not found", async () => {
    renderApp("/api/sigma-reckitt");
    expect(
      await screen.findByRole("heading", { name: "No page at this address" }),
    ).toBeInTheDocument();
  });

  it("sends anonymous visitors on signed-in routes to /login with next", async () => {
    renderApp("/repos?sort=name", { signedIn: false });
    await waitFor(() => expect(window.location.pathname).toBe("/login"));
    expect(new URLSearchParams(window.location.search).get("next")).toBe(
      "/repos?sort=name",
    );
    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeInTheDocument();
  });

  it("signs in from the interim login page and returns to next", async () => {
    renderApp("/login?next=%2Factivity", { signedIn: false });
    await userEvent.type(
      await screen.findByLabelText("Email"),
      "brajesh@sigma.dev",
    );
    await userEvent.type(
      screen.getByLabelText("Password"),
      "correct horse battery",
    );
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(window.location.pathname).toBe("/activity"));
  });

  it("rejects off-site next targets after sign-in", async () => {
    renderApp("/login?next=%2F%2Fevil.example", { signedIn: false });
    await userEvent.type(
      await screen.findByLabelText("Email"),
      "brajesh@sigma.dev",
    );
    await userEvent.type(
      screen.getByLabelText("Password"),
      "correct horse battery",
    );
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(window.location.pathname).toBe("/"));
  });

  it("denies forge admin to non platform admins", async () => {
    resetMockDb({ signedIn: "tatwa" });
    window.history.replaceState({}, "", "/admin/users");
    render(() => <App queryClient={createAppQueryClient({ retry: false })} />);
    expect(
      await screen.findByRole("heading", {
        name: "Forge admin is for platform admins",
      }),
    ).toBeInTheDocument();
  });
});

describe("app shell", () => {
  it("renders the signed-in shell: top bar, primary nav, org, pins and health", async () => {
    renderApp("/");
    const nav = await screen.findByRole("navigation", { name: "Primary" });
    expect(within(nav).getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      await within(nav).findByRole("link", { name: "sigma-reckitt" }),
    ).toHaveAttribute("href", "/sigma/sigma-reckitt");
    expect(
      await screen.findByRole("button", { name: /Organization: Sigma/ }),
    ).toBeInTheDocument();
    expect(
      within(nav).getByRole("link", { name: "Forge admin" }),
    ).toBeInTheDocument();
    expect(await within(nav).findByText("Forge healthy")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Skip to content" }),
    ).toHaveAttribute("href", "#main");
  });

  it("renders the anonymous shell without a sidebar", async () => {
    renderApp("/explore", { signedIn: false });
    expect(
      await screen.findByRole("link", { name: "Sign in" }),
    ).toHaveAttribute("href", "/login?next=%2Fexplore");
    expect(
      screen.getByRole("link", { name: "Create account" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explore" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.queryByRole("link", { name: "Activity" })).toBeNull();
  });

  it("unpins with Undo (DESIGN.md §7.10)", async () => {
    renderApp("/");
    const nav = await screen.findByRole("navigation", { name: "Primary" });
    await within(nav).findByRole("link", { name: "payments-api" });
    await userEvent.click(
      within(nav).getByRole("button", { name: "Unpin payments-api" }),
    );
    await waitFor(() =>
      expect(
        within(nav).queryByRole("link", { name: "payments-api" }),
      ).toBeNull(),
    );
    expect(db.pins.brxj19?.map((p) => p.repo)).toEqual([
      "sigma-reckitt",
      "infra-scripts",
    ]);
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
    expect(
      await within(nav).findByRole("link", { name: "payments-api" }),
    ).toBeInTheDocument();
  });

  it("falls back to local pins while the pins API doesn't exist", async () => {
    server.use(
      http.get("*/api/v1/me/pins", () => apiError(404, "Not Found")),
      http.put("*/api/v1/me/pins", () => apiError(404, "Not Found")),
    );
    renderApp("/");
    const nav = await screen.findByRole("navigation", { name: "Primary" });
    expect(
      await within(nav).findByRole("button", {
        name: /Pin repositories you use often/,
      }),
    ).toBeInTheDocument();
    await userEvent.click(
      within(nav).getByRole("button", { name: "Pin a repository" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitemcheckbox", { name: /design-tokens/ }),
    );
    // The multi-select stays open (and hides the page from assistive tech) until Esc.
    await userEvent.keyboard("{Escape}");
    expect(
      await within(nav).findByRole("link", { name: "design-tokens" }),
    ).toBeInTheDocument();
    expect(
      JSON.parse(
        localStorage.getItem(
          "revforge.pins.00000000-0000-4000-8000-000000000001",
        ) ?? "[]",
      ),
    ).toEqual([{ org: "sigma", repo: "design-tokens" }]);
  });

  it("signs out from the account menu even if the request fails", async () => {
    server.use(http.post("*/api/v1/auth/logout", () => HttpResponse.error()));
    renderApp("/");
    await userEvent.click(
      await screen.findByRole("button", { name: "Account menu" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Sign out" }),
    );
    await waitFor(() => expect(window.location.pathname).toBe("/login"));
    expect(await screen.findByText("You're signed out")).toBeInTheDocument();
  });
});

describe("command palette", () => {
  it("opens with ⌘K, filters actions with a prefix chip and runs with Enter", async () => {
    renderApp("/");
    await screen.findByRole("navigation", { name: "Primary" });
    await userEvent.keyboard("{Control>}k{/Control}");
    const input = await screen.findByRole("combobox", {
      name: "Search or run a command",
    });
    expect(input).toHaveFocus();
    expect(screen.getByText("Jump to a mode")).toBeInTheDocument();
    await userEvent.type(input, ">activity");
    expect(input).toHaveValue("activity");
    expect(input).toHaveAttribute("placeholder", "Run a command…");
    const option = screen.getByRole("option", { name: /Open activity log/ });
    expect(option).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", option.id);
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(window.location.pathname).toBe("/activity"));
    expect(
      screen.queryByRole("combobox", { name: "Search or run a command" }),
    ).toBeNull();
  });

  it("lists projects, cycles modes with Tab and clears the mode with Backspace", async () => {
    renderApp("/");
    await screen.findByRole("navigation", { name: "Primary" });
    await userEvent.click(
      screen.getByRole("button", { name: "Search or run a command" }),
    );
    const input = await screen.findByRole("combobox", {
      name: "Search or run a command",
    });
    await userEvent.type(input, ":reck");
    expect(
      await screen.findByRole("option", { name: /sigma-reckitt/ }),
    ).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.keyboard("{Backspace}");
    expect(
      screen.getByRole("button", { name: /All/, pressed: true }),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Tab}");
    expect(
      screen.getByRole("button", { name: /Actions/, pressed: true }),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("combobox", { name: "Search or run a command" }),
      ).toBeNull(),
    );
  });

  it("searches files of the repository in the URL", async () => {
    renderApp("/sigma/sigma-reckitt");
    await screen.findByRole("navigation", { name: "Primary" });
    await userEvent.keyboard("t");
    const input = await screen.findByRole("combobox", {
      name: "Search or run a command",
    });
    expect(screen.getByText("sigma / sigma-reckitt")).toBeInTheDocument();
    await userEvent.type(input, "graph.c");
    const option = (
      await screen.findAllByRole("option", { name: /^graph\.cpp/ })
    )[0]!;
    await userEvent.click(option);
    await waitFor(() =>
      expect(window.location.pathname).toBe(
        "/sigma/sigma-reckitt/code/src/graph.cpp",
      ),
    );
  });

  it("explains repository-only modes outside a repository", async () => {
    renderApp("/");
    await screen.findByRole("navigation", { name: "Primary" });
    await userEvent.keyboard("/");
    await userEvent.type(
      await screen.findByRole("combobox", { name: "Search or run a command" }),
      "~",
    );
    expect(
      await screen.findByText("Open a repository to search its files."),
    ).toBeInTheDocument();
  });
});
