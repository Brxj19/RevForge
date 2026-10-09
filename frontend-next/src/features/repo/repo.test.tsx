import { screen, waitFor, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { apiError } from "~/mocks/handlers";
import { server } from "~/mocks/server";
import { renderApp, stubClipboard } from "~/test/app";

const TIP = "1c7450e15fcbe499620a42a89b43139ca1ea6aa9";

describe("repository overview", () => {
  it("renders header, file table with last changesets, README, About and recent changesets", async () => {
    renderApp("/sigma/sigma-reckitt");
    const title = await screen.findByRole("heading", {
      level: 1,
      name: /sigma-reckitt/,
    });
    expect(title).toHaveTextContent("sigma / sigma-reckitt");
    expect(within(title).getByText("Public")).toBeInTheDocument();
    const files = await screen.findByRole("table", {
      name: "Files at the repository root",
    });
    const readmeRow = within(files)
      .getByRole("link", { name: "README.md" })
      .closest("tr")!;
    expect(
      within(readmeRow).getByRole("link", { name: "Add README" }),
    ).toHaveAttribute(
      "href",
      "/sigma/sigma-reckitt/changesets/2594ec590c3f0f666695600b07503e2e910cea01",
    );
    // README rendered through the Markdown preview (headings, alert, relative image).
    const readme = await screen.findByRole("document", { name: "README" });
    expect(
      await within(readme).findByRole("heading", {
        level: 1,
        name: /sigma-reckitt/,
      }),
    ).toBeInTheDocument();
    expect(readme.querySelector(".alert.note")).not.toBeNull();
    expect(readme.querySelector("img")?.getAttribute("src")).toContain(
      "/raw?rev=" + TIP + "&path=docs%2Fgraph-diagram.png",
    );
    // About: from refs and stats (API-GAP: stats).
    const about = screen.getByRole("complementary", {
      name: "About this repository",
    });
    expect(await within(about).findByText("C++ 78%")).toBeInTheDocument();
    expect(within(about).getByText("48 KB")).toBeInTheDocument();
    expect(within(about).getByText("v0.1.0")).toBeInTheDocument();
    expect(
      within(about).getByRole("img", { name: /Languages: C\+\+ 78%/ }),
    ).toBeInTheDocument();
    // Recent changesets: limit=6.
    const recent = within(about)
      .getAllByRole("listitem")
      .filter((li) => li.querySelector("a[href*='/changesets/']"));
    expect(recent).toHaveLength(6);
    // Rail resolves the default branch to its node.
    expect(
      await screen.findByRole("link", {
        name: `Open changeset ${TIP.slice(0, 12)}`,
      }),
    ).toHaveAttribute("href", `/sigma/sigma-reckitt/changesets/${TIP}`);
  });

  it("shows Settings only to repository admins and never to anonymous visitors", async () => {
    renderApp("/sigma/sigma-reckitt");
    const tabs = await screen.findByRole("navigation", {
      name: "Repository sections",
    });
    expect(
      within(tabs).getByRole("link", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(
      within(tabs).getByRole("link", { name: "Overview" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("anonymous visitors on a public repository get HTTPS clone only and a sign-in prompt", async () => {
    renderApp("/sigma/sigma-reckitt", { user: null });
    await screen.findByRole("heading", { level: 1, name: /sigma-reckitt/ });
    expect(
      screen.getByRole("link", { name: "Sign in to watch" }),
    ).toHaveAttribute("href", "/login?next=%2Fsigma%2Fsigma-reckitt");
    const tabs = screen.getByRole("navigation", {
      name: "Repository sections",
    });
    expect(within(tabs).queryByRole("link", { name: "Settings" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Clone" }));
    const pop = await screen.findByRole("dialog", {
      name: "Clone sigma-reckitt",
    });
    expect(
      await within(pop).findByText(
        "hg clone https://revforge.sigma.dev/hg/sigma/sigma-reckitt",
      ),
    ).toBeInTheDocument();
    expect(
      within(pop).queryByRole("radiogroup", { name: "Clone protocol" }),
    ).toBeNull();
    expect(
      within(pop).getByText(/anyone can clone over HTTPS without signing in/),
    ).toBeInTheDocument();
  });

  it("signed-in members switch the clone command between SSH and HTTPS", async () => {
    renderApp("/sigma/sigma-reckitt");
    await userEvent.click(await screen.findByRole("button", { name: "Clone" }));
    const pop = await screen.findByRole("dialog", {
      name: "Clone sigma-reckitt",
    });
    expect(
      await within(pop).findByText(
        "hg clone ssh://hg@revforge.sigma.dev/sigma/sigma-reckitt",
      ),
    ).toBeInTheDocument();
    await userEvent.click(within(pop).getByRole("radio", { name: "HTTPS" }));
    expect(
      await within(pop).findByText(
        "hg clone https://revforge.sigma.dev/hg/sigma/sigma-reckitt",
      ),
    ).toBeInTheDocument();
    expect(
      within(pop).getByRole("link", { name: "Create a token" }),
    ).toHaveAttribute("href", "/settings/tokens");
  });

  it("never tells anonymous visitors that a private repository exists", async () => {
    renderApp("/sigma/payments-api", { user: null });
    expect(
      await screen.findByRole("heading", { name: "Repository not found" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("payments-api")).toBeNull();
    expect(
      within(screen.getByRole("main")).getByRole("link", { name: "Sign in" }),
    ).toBeInTheDocument();
  });

  it("shows permission denied on 403 and the request id on 5xx", async () => {
    server.use(
      http.get("*/api/v1/organizations/sigma/repositories/sigma-reckitt", () =>
        apiError(403, "Forbidden", "forbidden"),
      ),
    );
    renderApp("/sigma/sigma-reckitt");
    expect(
      await screen.findByRole("heading", {
        name: "You don't have access to this repository",
      }),
    ).toBeInTheDocument();
  });

  it("shows the request id when the repository fails to load", async () => {
    server.use(
      http.get("*/api/v1/organizations/sigma/repositories/sigma-reckitt", () =>
        apiError(500, "Internal error", "internal_error"),
      ),
    );
    renderApp("/sigma/sigma-reckitt");
    expect(
      await screen.findByRole("heading", {
        name: "Couldn't load this repository.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/mock-\d{4}/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("explains an empty repository and how to push", async () => {
    renderApp("/sigma/design-tokens");
    expect(
      await screen.findByText(/design-tokens is ready. Push from your machine/),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        "hg push https://revforge.sigma.dev/hg/sigma/design-tokens",
      ),
    ).toBeInTheDocument();
  });

  it("copies a permalink pinned to the full node from the rail (U5)", async () => {
    const written = stubClipboard();
    renderApp("/sigma/sigma-reckitt?rev=feature/data-structures");
    await screen.findByRole("link", { name: /Open changeset e0c8db2ddfe6/ });
    await userEvent.click(
      screen.getByRole("button", { name: "Copy permalink" }),
    );
    await waitFor(() => expect(written).toHaveLength(1));
    const url = new URL(written[0]!);
    expect(url.pathname).toBe("/sigma/sigma-reckitt");
    expect(url.searchParams.get("rev")).toBe(
      "e0c8db2ddfe6b6df66d78476c48be90e4d6070b0",
    );
  });
});

describe("session restore", () => {
  it("mounts repository pages only after the session is known, so the F1 cache clear can't orphan their queries", async () => {
    // With the chunks already loaded the page would mount while /auth/me is in flight; restoring
    // the session clears the cache and the page's pending queries never settled (blank page).
    await import("./RepoLayout");
    await import("./OverviewPage");
    renderApp("/sigma/sigma-reckitt");
    expect(
      await screen.findByRole("table", {
        name: "Files at the repository root",
      }),
    ).toBeInTheDocument();
  });
});

describe("revision picker", () => {
  it("switches to a bookmark and to a short hash (I11), keeping the path", async () => {
    renderApp("/sigma/sigma-reckitt/code/src");
    const trigger = await screen.findByRole("button", {
      name: /Switch branch, bookmark or tag/,
    });
    await userEvent.click(trigger);
    const find = await screen.findByRole("combobox", { name: /Find a branch/ });
    await userEvent.type(find, "graph-api");
    const option = await screen.findByRole("option", {
      name: /review\/graph-api/,
    });
    expect(option).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(window.location.search).toBe("?rev=review%2Fgraph-api"),
    );
    expect(window.location.pathname).toBe("/sigma/sigma-reckitt/code/src");
    expect(trigger).toHaveTextContent("review/graph-api");

    await userEvent.click(trigger);
    await userEvent.type(
      await screen.findByRole("combobox", { name: /Find a branch/ }),
      "0b486f",
    );
    expect(
      await screen.findByRole("option", { name: /0b486f.*Go to changeset/ }),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(window.location.search).toBe("?rev=0b486f"));
    expect(
      await screen.findByRole("link", { name: "Open changeset 0b486fec60de" }),
    ).toBeInTheDocument();
  });

  it("explains unknown and ambiguous revisions", async () => {
    renderApp("/sigma/sigma-reckitt?rev=no-such-branch");
    expect(
      await screen.findByRole("heading", { name: "Revision not found" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/“no-such-branch”/)).toBeInTheDocument();
  });

  it("explains an ambiguous short hash without listing candidates", async () => {
    server.use(
      http.get(
        "*/api/v1/organizations/sigma/repositories/sigma-reckitt/browse",
        () => apiError(409, "Ambiguous.", "revision_ambiguous"),
      ),
    );
    renderApp("/sigma/sigma-reckitt?rev=abcdef");
    expect(
      await screen.findByRole("heading", {
        name: "That short hash is ambiguous",
      }),
    ).toBeInTheDocument();
  });
});

describe("repository states", () => {
  it("provisioning: progress, Check again, and Retry for admins once it looks stuck (I36)", async () => {
    let csrf: string | null = null;
    server.use(
      http.post(
        "*/api/v1/organizations/sigma/repositories/infra-scripts/provision",
        ({ request }) => {
          csrf = request.headers.get("X-CSRF-Token");
          return HttpResponse.json({ provisioning_state: "provisioning" });
        },
      ),
    );
    renderApp("/sigma/infra-scripts");
    expect(
      await screen.findByRole("progressbar", { name: "Provisioning" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Provisioning").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Check again" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Retry provisioning" }),
    );
    await waitFor(() => expect(csrf).toBe("mock-csrf-token"));
    expect(
      await screen.findByText("Provisioning restarted"),
    ).toBeInTheDocument();
  });

  it("failed: friendly copy for the error code, details without stderr, retry for admins", async () => {
    renderApp("/sigma/ml-experiments");
    expect(
      await screen.findByRole("heading", { name: "Provisioning failed" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Mercurial couldn't create the repository storage/),
    ).toBeInTheDocument();
    expect(screen.getByText("hg_init_failed")).toBeInTheDocument();
    expect(screen.queryByText(/permission denied/)).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Retry provisioning" }),
    );
    expect(
      await screen.findByRole("progressbar", { name: "Provisioning" }),
    ).toBeInTheDocument();
  });

  it("provisioning with no start time (stuck before migration 0008): admins can retry", async () => {
    server.use(
      http.get("*/api/v1/organizations/sigma/repositories/infra-scripts", () =>
        HttpResponse.json({
          id: "x",
          organization_id: "o",
          organization_slug: "sigma",
          slug: "infra-scripts",
          display_name: "infra-scripts",
          description: null,
          visibility: "private",
          created_by_user_id: "u",
          created_at: "2026-07-13T20:00:00.000Z",
          updated_at: "2026-07-13T20:00:00.000Z",
          archived_at: null,
          provisioning_state: "provisioning",
          provisioned_at: null,
          is_browsable: false,
          viewer_role: "admin",
          can_manage: true,
          inherited_access: false,
          phase_status: "ready",
          provisioning_error: null,
          provisioning_started_at: null,
        }),
      ),
    );
    renderApp("/sigma/infra-scripts");
    expect(
      await screen.findByRole("button", { name: "Retry provisioning" }),
    ).toBeInTheDocument();
  });

  it("failed: non-admins are told who can retry", async () => {
    server.use(
      http.get(
        "*/api/v1/organizations/sigma/repositories/ml-experiments",
        () => {
          return HttpResponse.json({
            id: "x",
            organization_id: "o",
            organization_slug: "sigma",
            slug: "ml-experiments",
            display_name: "ml-experiments",
            description: null,
            visibility: "private",
            created_by_user_id: "u",
            created_at: "2026-07-13T20:00:00.000Z",
            updated_at: "2026-07-13T20:00:00.000Z",
            archived_at: null,
            provisioning_state: "failed",
            provisioned_at: null,
            is_browsable: false,
            viewer_role: "read",
            can_manage: false,
            inherited_access: false,
            phase_status: "ready",
            provisioning_error: "storage_conflict",
            provisioning_started_at: null,
          });
        },
      ),
    );
    renderApp("/sigma/ml-experiments");
    expect(
      await screen.findByText("Ask a repository admin to retry provisioning."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Retry provisioning" }),
    ).toBeNull();
    expect(
      screen.getByText(/Ask a platform admin to check the storage location/),
    ).toBeInTheDocument();
  });

  it("archived: banner, still browsable", async () => {
    renderApp("/sigma/legacy-billing");
    expect(
      await screen.findByText("This repository is archived"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/pushes and new pull requests are\s+rejected/),
    ).toBeInTheDocument();
  });
});
