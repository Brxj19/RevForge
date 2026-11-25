import { fireEvent, screen, waitFor, within } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { renderApp } from "~/test/app";

describe("PullsListPage", () => {
  it("renders pull request list with state tabs and PR rows", async () => {
    renderApp("/sigma/sigma-reckitt/pulls");

    // Wait for PR list to load
    expect(
      await screen.findByText("Add Dijkstra shortest path to Graph"),
    ).toBeInTheDocument();

    // State tabs should be present
    const nav = screen.getByRole("radiogroup", { name: "Pull request state" });
    expect(within(nav).getByText("Open")).toBeInTheDocument();
    expect(within(nav).getByText("Draft")).toBeInTheDocument();
    expect(within(nav).getByText("Merged")).toBeInTheDocument();
    expect(within(nav).getByText("Closed")).toBeInTheDocument();

    // PR number and "New pull request" button visible
    expect(screen.getByText(/#7/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /New pull request/ }),
    ).toBeInTheDocument();
  });

  it("shows closed PRs when filtered by state", async () => {
    renderApp("/sigma/sigma-reckitt/pulls?state=closed");

    expect(
      await screen.findByText("Experiment: AVL rebalancing"),
    ).toBeInTheDocument();
  });

  it("applies the URL search to the server-side list", async () => {
    renderApp("/sigma/sigma-reckitt/pulls?q=iterative");
    expect(
      await screen.findByText("Iterative in-order traversal for BinaryTree"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Add Dijkstra shortest path to Graph"),
    ).not.toBeInTheDocument();
  });

  it("shows error state and retry button when loading fails", async () => {
    const { http, HttpResponse } = await import("msw");
    const { server } = await import("~/mocks/server");
    server.use(
      http.get(
        "*/api/v1/organizations/:org/repositories/:repo/pull-requests",
        () => HttpResponse.json({ detail: "fail" }, { status: 500 }),
      ),
    );
    renderApp("/sigma/sigma-reckitt/pulls");

    expect(
      await screen.findByText("Couldn't load pull requests"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });
});

describe("PullRequestPage", () => {
  it("shows PR detail with title, number and state badge", async () => {
    renderApp("/sigma/sigma-reckitt/pulls/7");

    expect(
      await screen.findByText(/Add Dijkstra shortest path to Graph/),
    ).toBeInTheDocument();
    expect(screen.getByText("#7")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("shows timeline events", async () => {
    renderApp("/sigma/sigma-reckitt/pulls/7");

    await waitFor(() => {
      expect(
        screen.getByRole("document", { name: "Pull request description" }),
      ).toBeInTheDocument();
    });
  });

  it("shows merge box with checks", async () => {
    renderApp("/sigma/sigma-reckitt/pulls/7");

    await waitFor(() => {
      expect(screen.getByText("No conflicts with default")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Merge" })).toBeDisabled();
    });
  });

  it("shows reviewers sidebar", async () => {
    renderApp("/sigma/sigma-reckitt/pulls/7");

    await waitFor(() => {
      expect(screen.getByText("Reviewers")).toBeInTheDocument();
    });
  });

  it("requests a required review with CSRF and keeps failures retryable", async () => {
    const { http, HttpResponse } = await import("msw");
    const { server } = await import("~/mocks/server");
    let sent: { reviewer_id: string; required: boolean } | undefined;
    let csrf: string | null = null;
    server.use(
      http.post(
        "*/api/v1/organizations/:org/repositories/:repo/pull-requests/:id/reviewers",
        async ({ request }) => {
          sent = (await request.json()) as typeof sent;
          csrf = request.headers.get("X-CSRF-Token");
          return HttpResponse.json({ detail: "failed" }, { status: 500 });
        },
      ),
    );
    renderApp("/sigma/sigma-reckitt/pulls/7");
    fireEvent.click(
      await screen.findByRole("button", { name: "Request a review" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Request reviews",
    });
    const search = within(dialog).getByRole("combobox", {
      name: "Search people",
    });
    fireEvent.input(search, { target: { value: "dheeraj" } });
    const candidate = await within(dialog).findByRole("option", {
      name: /Kushwah Dheeraj/,
    });
    fireEvent.click(candidate);
    expect(
      within(dialog).getByRole("checkbox", { name: /Required/ }),
    ).toBeChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: "Request 1" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "1 review request failed",
    );
    expect(
      within(dialog).getByRole("button", { name: "Remove Kushwah Dheeraj" }),
    ).toBeInTheDocument();
    expect(sent).toMatchObject({ required: true });
    expect(csrf).toBeTruthy();
  });

  it("shows error state for non-existent PR", async () => {
    renderApp("/sigma/sigma-reckitt/pulls/999");

    expect(
      await screen.findByText(/Couldn't load this pull request/),
    ).toBeInTheDocument();
  });
});

describe("NewPullRequestPage", () => {
  it("renders branch pickers and create buttons", async () => {
    renderApp("/sigma/sigma-reckitt/pulls/new");

    expect(await screen.findByText("Open a pull request")).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Open pull request" }),
    ).toBeDisabled();
    expect(screen.getByLabelText(/Open as a draft/)).toBeInTheDocument();
  });

  it("creates a pull request using the compared immutable revisions", async () => {
    const { http, HttpResponse } = await import("msw");
    const { server } = await import("~/mocks/server");
    let sent: Record<string, unknown> | undefined;
    server.use(
      http.post(
        "*/api/v1/organizations/:org/repositories/:repo/pull-requests",
        async ({ request }) => {
          sent = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ number: 7 }, { status: 201 });
        },
      ),
    );
    renderApp("/sigma/sigma-reckitt/pulls/new?head=feature%2Fshortest-path");
    const title = await screen.findByLabelText("Title");
    fireEvent.input(title, { target: { value: "Improve graph" } });
    const create = screen.getByRole("button", { name: "Open pull request" });
    await waitFor(() => expect(create).toBeEnabled());
    fireEvent.click(create);
    await waitFor(() =>
      expect(sent).toMatchObject({
        source_branch: "feature/shortest-path",
        target_branch: "default",
        source_revision: "0b486fec60de599c0dfab1a065eca86a06651c31",
        target_revision: "1c7450e15fcbe499620a42a89b43139ca1ea6aa9",
      }),
    );
  });

  it("reports reviewer request failures after creating the pull request", async () => {
    const { http, HttpResponse } = await import("msw");
    const { server } = await import("~/mocks/server");
    let reviewBody: { required: boolean } | undefined;
    server.use(
      http.post(
        "*/api/v1/organizations/:org/repositories/:repo/pull-requests",
        () => HttpResponse.json({ number: 7 }, { status: 201 }),
      ),
      http.post(
        "*/api/v1/organizations/:org/repositories/:repo/pull-requests/:id/reviewers",
        async ({ request }) => {
          reviewBody = (await request.json()) as typeof reviewBody;
          return HttpResponse.json({ detail: "failed" }, { status: 500 });
        },
      ),
    );
    renderApp("/sigma/sigma-reckitt/pulls/new?head=feature%2Fshortest-path");
    fireEvent.input(await screen.findByLabelText("Title"), {
      target: { value: "Improve graph" },
    });
    fireEvent.input(screen.getByRole("combobox", { name: "Search people" }), {
      target: { value: "dheeraj" },
    });
    await screen.findByRole("option", { name: /Kushwah Dheeraj/ });
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Search people" }), {
      key: "Enter",
    });
    expect(
      screen.getByRole("button", { name: "Remove Kushwah Dheeraj" }),
    ).toBeInTheDocument();
    const create = screen.getByRole("button", { name: "Open pull request" });
    await waitFor(() => expect(create).toBeEnabled());
    fireEvent.click(create);
    expect(
      await screen.findByText(
        /Pull request created, but 1 review request failed/,
      ),
    ).toBeInTheDocument();
    expect(reviewBody).toMatchObject({ required: false });
  });
});

describe("PR count badge on repo header", () => {
  it("shows open PR count on the Pull requests tab", async () => {
    renderApp("/sigma/sigma-reckitt");

    const tabs = await screen.findByRole("navigation", {
      name: "Repository sections",
    });

    // Wait for PR count to load (async background query)
    await waitFor(() => {
      const prTab = within(tabs).getByRole("link", {
        name: /Pull requests/,
      });
      // The open PR count should appear within the tab
      expect(prTab).toHaveTextContent(/Pull requests\s*2/);
    });
  });
});

describe("Prototype review workspace", () => {
  it("offers three addressable tabs and renders the changeset deep link", async () => {
    renderApp("/sigma/sigma-reckitt/pulls/7/changesets");
    const tabs = await screen.findByRole("navigation", {
      name: "Pull request tabs",
    });
    expect(
      within(tabs).getByRole("link", { name: /Changesets/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(tabs).getByRole("link", { name: /Files changed/ }),
    ).toHaveAttribute("href", "/sigma/sigma-reckitt/pulls/7/files");
    expect(
      await screen.findByText(
        "Merge feature/data-structures-improvements into default",
      ),
    ).toBeInTheDocument();
  });

  it("opens the review dialog and offers decisions", async () => {
    renderApp("/sigma/sigma-reckitt/pulls/7");
    const review = await screen.findByRole("button", { name: /^Review/ });
    fireEvent.click(review);
    const dialog = await screen.findByRole("dialog", {
      name: "Review pull request",
    });
    expect(
      within(dialog).getByRole("radio", { name: /Approve/ }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("radio", { name: /Request changes/ }),
    ).toBeInTheDocument();
  });

  it("submits a review with the CSRF token and chosen decision", async () => {
    const { http, HttpResponse } = await import("msw");
    const { server } = await import("~/mocks/server");
    let sent: { decision?: string; csrf?: string | null } | undefined;
    server.use(
      http.post(
        "*/api/v1/organizations/:org/repositories/:repo/pull-requests/:n/reviews",
        async ({ request }) => {
          const body = (await request.json()) as { decision?: string };
          sent = {
            decision: body.decision,
            csrf: request.headers.get("x-csrf-token"),
          };
          return HttpResponse.json({ ok: true }, { status: 201 });
        },
      ),
    );
    renderApp("/sigma/sigma-reckitt/pulls/7");
    fireEvent.click(await screen.findByRole("button", { name: /^Review/ }));
    const dialog = await screen.findByRole("dialog", {
      name: "Review pull request",
    });
    fireEvent.click(within(dialog).getByRole("radio", { name: /Approve/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(sent).toEqual({ decision: "approved", csrf: expect.any(String) }),
    );
  });

  it("renders changed files, existing inline threads and line-comment controls", async () => {
    renderApp("/sigma/sigma-reckitt/pulls/7/files");
    expect(
      await screen.findByRole("navigation", { name: "Changed files" }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/can overflow when/)).toBeInTheDocument();
    const add = screen.getByRole("button", {
      name: "Comment on src/graph.cpp line 28",
    });
    fireEvent.click(add);
    expect(
      screen.getByRole("textbox", { name: "Comment on line 28" }),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText("Viewed").length).toBeGreaterThan(0);
  });

  it("links inbox rows to their real repository and exposes all prototype filters", async () => {
    renderApp("/reviews");
    const nav = await screen.findByRole("radiogroup", {
      name: "Review inbox filter",
    });
    expect(within(nav).getByText("Your pull requests")).toBeInTheDocument();
    expect(within(nav).getByText("All open")).toBeInTheDocument();
    expect(within(nav).getByText("Recently closed")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /New pull request/ }),
    ).toBeInTheDocument();
    const link = await screen.findByRole("link", {
      name: /Add Dijkstra shortest path/,
    });
    expect(link).toHaveAttribute("href", "/sigma/sigma-reckitt/pulls/7");
  });
});
