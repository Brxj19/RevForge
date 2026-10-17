import { screen, waitFor, within } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { renderApp } from "~/test/app";

describe("PullsListPage", () => {
  it("renders pull request list with state tabs and PR rows", async () => {
    renderApp("/sigma/sigma-reckitt/pulls");

    // Wait for PR list to load
    expect(
      await screen.findByText("feat: add edge-weight decay to graph pruner"),
    ).toBeInTheDocument();

    // State tabs should be present
    const nav = screen.getByRole("navigation", { name: "Pull request state" });
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
      await screen.findByText("docs: update algorithm complexity notes"),
    ).toBeInTheDocument();
  });

  it("shows error state and retry button when loading fails", async () => {
    const { http, HttpResponse } = await import("msw");
    const { server } = await import("~/mocks/server");
    server.use(
      http.get("*/api/v1/organizations/:org/repositories/:repo/pull-requests", () =>
        HttpResponse.json({ detail: "fail" }, { status: 500 }),
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
      await screen.findByText("feat: add edge-weight decay to graph pruner"),
    ).toBeInTheDocument();
    expect(screen.getByText("#7")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("shows timeline events", async () => {
    renderApp("/sigma/sigma-reckitt/pulls/7");

    await waitFor(() => {
      expect(screen.getByText(/opened this pull request/)).toBeInTheDocument();
    });
  });

  it("shows merge box with checks", async () => {
    renderApp("/sigma/sigma-reckitt/pulls/7");

    await waitFor(() => {
      expect(screen.getByText("No merge conflicts")).toBeInTheDocument();
    });
  });

  it("shows reviewers sidebar", async () => {
    renderApp("/sigma/sigma-reckitt/pulls/7");

    await waitFor(() => {
      expect(screen.getByText("Reviewers")).toBeInTheDocument();
    });
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

    expect(await screen.findByText("New pull request")).toBeInTheDocument();

    expect(screen.getByText("Create pull request")).toBeInTheDocument();
    expect(screen.getByText("Create draft")).toBeInTheDocument();
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
      expect(prTab).toHaveTextContent(/Pull requests\s*1/);
    });
  });
});
