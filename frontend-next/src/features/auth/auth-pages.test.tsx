import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "~/app/App";
import { createAppQueryClient } from "~/app/query-client";
import { resetMockDb } from "~/mocks/db";

function renderApp(path: string, opts: { signedIn?: boolean } = {}) {
  resetMockDb({ signedIn: opts.signedIn ? "brxj19" : null });
  window.history.replaceState({}, "", path);
  return render(() => (
    <App queryClient={createAppQueryClient({ retry: false })} />
  ));
}

describe("Phase 7 auth pages", () => {
  it("shows lockout countdown on /login when backend returns 429 Retry-After", async () => {
    renderApp("/login");
    await userEvent.type(
      await screen.findByLabelText("Email"),
      "locked@sigma.dev",
    );
    await userEvent.type(screen.getByLabelText("Password"), "any password 123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText(/Too many attempts/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Try again in/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("link", { name: /reset your password/i }),
    ).toHaveAttribute("href", "/forgot");
  });

  it("navigates to /suspended on 403 account_suspended without leaking internal notes", async () => {
    renderApp("/login");
    await userEvent.type(
      await screen.findByLabelText("Email"),
      "suspended@sigma.dev",
    );
    await userEvent.type(screen.getByLabelText("Password"), "any password 123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByRole("heading", {
        name: "This account is suspended",
        level: 1,
      }),
    ).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe("/suspended"));
    expect(
      screen.getByRole("link", { name: "Browse public repositories" }),
    ).toHaveAttribute("href", "/explore");
  });

  it("shows verification guidance on 403 email_not_verified", async () => {
    renderApp("/login");
    await userEvent.type(
      await screen.findByLabelText("Email"),
      "unverified@sigma.dev",
    );
    await userEvent.type(screen.getByLabelText("Password"), "any password 123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText(/Verify your email/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /verification/i })).toHaveAttribute(
      "href",
      "/verify",
    );
  });

  it("shows signedout, expired, verified, and reset banners on /login", async () => {
    renderApp("/login?state=expired&reason=idle_timeout");
    expect(
      await screen.findByText(/expired after 30 minutes without activity/i),
    ).toBeInTheDocument();
  });

  it("checks handle availability, shows password strength, and redirects to /verify on 202 register", async () => {
    renderApp("/register");
    const nameInput = await screen.findByLabelText("Name");
    const handleInput = screen.getByLabelText("Username");
    const emailInput = screen.getByLabelText("Email");
    const passwordInput = screen.getByLabelText("Password");

    await userEvent.type(nameInput, "Priya Rao");

    // Reserved slug rejected immediately
    await userEvent.type(handleInput, "admin");
    expect(
      await screen.findByText("That name is reserved"),
    ).toBeInTheDocument();

    // Taken handle detected via GET /users/check-handle
    await userEvent.clear(handleInput);
    await userEvent.type(handleInput, "brxj19");
    expect(
      await screen.findByText("That username is taken"),
    ).toBeInTheDocument();

    // Available handle succeeds
    await userEvent.clear(handleInput);
    await userEvent.type(handleInput, "priya-rao");
    expect(await screen.findByText("Available")).toBeInTheDocument();

    await userEvent.type(emailInput, "priya@sigma.dev");
    await userEvent.type(passwordInput, "CorrectHorseBattery99!");
    expect(screen.getByText("Strong")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Create account" }),
    );

    await waitFor(() => expect(window.location.pathname).toBe("/verify"));
    // Email must NOT leak into URL query string
    expect(window.location.search).toBe("");
    expect(
      await screen.findByRole("heading", { name: "Check your email" }),
    ).toBeInTheDocument();
  });

  it("strips ?token= from URL on /verify and verifies a valid token", async () => {
    renderApp("/verify?token=valid-verify-token");

    await waitFor(() => expect(window.location.search).toBe(""));
    expect(
      await screen.findByRole("heading", { name: /Email verified/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login?state=verified",
    );
  });

  it("handles invalid token on /verify with resend option", async () => {
    renderApp("/verify?token=expired-bad-token");

    await waitFor(() => expect(window.location.search).toBe(""));
    expect(
      await screen.findByText(/invalid or has expired/i),
    ).toBeInTheDocument();
  });

  it("handles /forgot request flow and strips ?token= on confirm flow", async () => {
    const first = renderApp("/forgot");
    await userEvent.type(
      await screen.findByLabelText("Email"),
      "brajesh@sigma.dev",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Send reset link" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Check your email" }),
    ).toBeInTheDocument();
    first.unmount();

    // Confirm mode with secret token in query string
    renderApp("/forgot?token=valid-reset-token");
    await waitFor(() => expect(window.location.search).toBe(""));

    const newPw = await screen.findByLabelText("New password");
    const confirmPw = screen.getByLabelText("Confirm password");
    await userEvent.type(newPw, "BrandNewPassphrase99!");
    await userEvent.type(confirmPw, "BrandNewPassphrase99!");
    await userEvent.click(
      screen.getByRole("button", { name: /Update password|Reset password/i }),
    );

    expect(
      await screen.findByRole("heading", { name: /Password updated/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/access tokens and SSH keys/i)).toBeInTheDocument();
  });

  it("mounts password reset confirmation at /reset-password and strips ?token= from URL", async () => {
    renderApp("/reset-password?token=valid-reset-token");
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(
      await screen.findByRole("heading", { name: "Choose a new password" }),
    ).toBeInTheDocument();
  });
});
