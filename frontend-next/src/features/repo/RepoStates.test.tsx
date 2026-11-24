import { describe, expect, it } from "vitest";
import { fireEvent, screen, within } from "@solidjs/testing-library";
import { renderWithProviders, fixtureUsers } from "~/test/render";
import { RepoLoadError } from "./RepoStates";
import { ApiError } from "~/lib/api";

// Wrap RepoLoadError in a minimal context since it doesn't need useRepo for the 403 path.

describe("RepoLoadError — 403 request access flow", () => {
  const error403 = new ApiError("Forbidden", 403, { code: "forbidden" });

  it("shows permission denied title for 403", async () => {
    renderWithProviders(
      () => <RepoLoadError error={error403} onRetry={() => {}} />,
      { user: fixtureUsers.brxj19, route: "/sigma/secret-repo" },
    );
    expect(await screen.findByText(/don't have access/)).toBeInTheDocument();
  });

  it("opens the Request access dialog with role picker and sends a request", async () => {
    renderWithProviders(
      () => <RepoLoadError error={error403} onRetry={() => {}} />,
      { route: "/sigma/secret-repo" },
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Request access" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Request access to sigma/secret-repo",
    });
    expect(
      within(dialog).getByRole("radio", { name: /Read/ }),
    ).toBeChecked();
    expect(
      within(dialog).getByRole("radio", { name: /Write/ }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Send request" }),
    );
    expect(await screen.findByText("Request sent")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Withdraw request" }),
    ).toBeInTheDocument();
  });

  it("shows Back to Explore link for authenticated user", async () => {
    renderWithProviders(
      () => <RepoLoadError error={error403} onRetry={() => {}} />,
      { user: fixtureUsers.brxj19, route: "/sigma/secret-repo" },
    );
    expect(await screen.findByText("Back to Explore")).toBeInTheDocument();
  });

  it("shows switch accounts link for authenticated user", async () => {
    renderWithProviders(
      () => <RepoLoadError error={error403} onRetry={() => {}} />,
      { user: fixtureUsers.brxj19, route: "/sigma/secret-repo" },
    );
    expect(await screen.findByText("Switch accounts")).toBeInTheDocument();
  });

  it("shows Repository not found (never leaking existence) for anonymous user on 403", async () => {
    renderWithProviders(
      () => <RepoLoadError error={error403} onRetry={() => {}} />,
      { user: null, route: "/sigma/secret-repo" },
    );
    expect(
      await screen.findByText("Repository not found"),
    ).toBeInTheDocument();
    expect(screen.getByText("Sign in")).toBeInTheDocument();
    expect(
      screen.getByText("Explore public repositories"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Request access")).not.toBeInTheDocument();
  });
});
