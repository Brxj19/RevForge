import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { App } from "~/app/App";
import { createAppQueryClient } from "~/app/query-client";
import { resetMockDb, type UserKey } from "~/mocks/db";
import { server } from "~/mocks/server";

function renderApp(path: string, opts: { user: UserKey | null }) {
  resetMockDb({ signedIn: opts.user });
  window.history.replaceState({}, "", path);
  return render(() => (
    <App queryClient={createAppQueryClient({ retry: false })} />
  ));
}

describe("InvitationAcceptPage (/invitations/:token)", () => {
  it("shows invitation details and sign-in CTA for anonymous visitors", async () => {
    renderApp("/invitations/tok-valid", { user: null });
    expect(
      await screen.findByRole("heading", { name: "Join Sigma" }),
    ).toBeInTheDocument();
    expect(
      (await screen.findAllByText(/t\*\*\*@sigma\.dev/)).length,
    ).toBeGreaterThanOrEqual(1);
    const signInLink = screen.getByRole("link", { name: "Sign in to accept" });
    expect(signInLink).toHaveAttribute(
      "href",
      "/login?next=%2Finvitations%2Ftok-valid",
    );
  });

  it("warns when signed in as a different account", async () => {
    renderApp("/invitations/tok-valid", { user: "brxj19" });
    expect(
      await screen.findByText("Signed in with a different account"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign out and switch account" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Accept invitation" }),
    ).not.toBeInTheDocument();
  });

  it("lets the matching user accept the invitation and navigates to the org", async () => {
    renderApp("/invitations/tok-valid", { user: "tatwa" });
    const acceptBtn = await screen.findByRole("button", {
      name: "Accept invitation",
    });
    await userEvent.click(acceptBtn);
    await waitFor(() => expect(window.location.pathname).toBe("/org/sigma"));
  });

  it("lets the matching user decline the invitation", async () => {
    renderApp("/invitations/tok-valid", { user: "tatwa" });
    const declineBtn = await screen.findByRole("button", { name: "Decline" });
    await userEvent.click(declineBtn);
    expect(await screen.findByText("Invitation declined")).toBeInTheDocument();
  });

  it("renders a not-found state for invalid tokens", async () => {
    renderApp("/invitations/not-found", { user: "tatwa" });
    expect(
      await screen.findByRole("heading", { name: "Invitation not found" }),
    ).toBeInTheDocument();
  });

  it("renders expired state for expired invitations", async () => {
    server.use(
      http.get("*/api/v1/invitations/tok-exp", () =>
        HttpResponse.json({
          organization_slug: "sigma",
          organization_display_name: "Sigma",
          organization_description: null,
          role: "member",
          status: "expired",
          invited_by_name: "Brajesh",
          email_hint: "tatwa@sigma.dev",
          email_matches: true,
          already_member: false,
          expires_at: "2025-01-01T00:00:00Z",
        }),
      ),
    );
    renderApp("/invitations/tok-exp", { user: "tatwa" });
    expect(await screen.findByText("Invitation expired")).toBeInTheDocument();
  });
});
