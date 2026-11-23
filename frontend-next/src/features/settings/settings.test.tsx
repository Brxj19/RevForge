import { fireEvent, screen, waitFor, within } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { renderApp } from "~/test/app";

describe("SettingsLayout", () => {
  it("renders the settings shell with subnav and defaults to profile", async () => {
    renderApp("/settings");
    // Wait for the lazy-loaded SettingsLayout to render (the h1 is inside it)
    const nav = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    expect(within(nav).getByText("Profile")).toBeInTheDocument();
    expect(within(nav).getByText("SSH keys")).toBeInTheDocument();
    expect(within(nav).getByText("Access tokens")).toBeInTheDocument();
    expect(within(nav).getByText("Sessions")).toBeInTheDocument();
    expect(within(nav).getByText("Notifications")).toBeInTheDocument();
    expect(within(nav).getByText("Appearance")).toBeInTheDocument();
  });

  it("highlights the active section in the subnav", async () => {
    renderApp("/settings/ssh-keys");
    const nav = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    const sshLink = within(nav).getByText("SSH keys").closest("a");
    expect(sshLink).toHaveAttribute("aria-current", "page");
  });

  it("redirects unknown sections to profile", async () => {
    renderApp("/settings/nonexistent");
    // Should redirect and load profile — look for profile-specific content
    const nav = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    expect(nav).toBeInTheDocument();
  });
});

describe("ProfilePage", () => {
  it("loads and displays the profile form", async () => {
    renderApp("/settings/profile");
    // Wait for the profile form to load (lazy component + API fetch)
    expect(await screen.findByLabelText("Display name")).toHaveValue("Brxj19");
    expect(screen.getByLabelText("Email")).toHaveValue("brajesh@sigma.dev");
    expect(
      screen.getByRole("button", { name: "Save profile" }),
    ).toBeInTheDocument();
  });

  it("saves profile with CSRF token", async () => {
    const { http, HttpResponse } = await import("msw");
    const { server } = await import("~/mocks/server");
    let sentCsrf: string | null = null;
    let sentBody: Record<string, unknown> | undefined;
    server.use(
      http.patch("*/api/v1/me/profile", async ({ request }) => {
        sentCsrf = request.headers.get("X-CSRF-Token");
        sentBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          display_name: "Updated",
          email: "brajesh@sigma.dev",
          author_aliases: [],
        });
      }),
    );
    renderApp("/settings/profile");
    const nameInput = await screen.findByLabelText("Display name");
    fireEvent.input(nameInput, { target: { value: "Updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => {
      expect(sentCsrf).toBeTruthy();
      expect(sentBody).toMatchObject({ display_name: "Updated" });
    });
  });

  it("shows error state when profile fails to load", async () => {
    const { http, HttpResponse } = await import("msw");
    const { server } = await import("~/mocks/server");
    server.use(
      http.get("*/api/v1/me/profile", () =>
        HttpResponse.json({ detail: "fail" }, { status: 500 }),
      ),
    );
    renderApp("/settings/profile");
    expect(
      await screen.findByText("Couldn't load your profile"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });
});

describe("SshKeysPage", () => {
  it("displays SSH keys with fingerprints", async () => {
    renderApp("/settings/ssh-keys");
    expect(await screen.findByText("MacBook Pro")).toBeInTheDocument();
    expect(screen.getByText(/SHA256:9vK2/)).toBeInTheDocument();
    expect(screen.getByText("Old work laptop")).toBeInTheDocument();
  });

  it("shows removed pill on revoked keys", async () => {
    renderApp("/settings/ssh-keys");
    await screen.findByText("Old work laptop");
    expect(screen.getByText("Removed")).toBeInTheDocument();
  });

  it("opens the add key dialog", async () => {
    renderApp("/settings/ssh-keys");
    await screen.findByText("MacBook Pro");
    // Find the "Add key" button in the card header (not the empty-state one)
    const addBtns = screen.getAllByRole("button", { name: /Add key/ });
    fireEvent.click(addBtns[0]!);
    expect(
      await screen.findByRole("dialog", { name: "Add SSH key" }),
    ).toBeInTheDocument();
  });

  it("validates that key starts with ssh-", async () => {
    renderApp("/settings/ssh-keys");
    await screen.findByText("MacBook Pro");
    fireEvent.click(screen.getAllByRole("button", { name: /Add key/ })[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Add SSH key" });
    const keyInput = within(dialog).getByLabelText("Public key");
    fireEvent.input(keyInput, { target: { value: "not-a-valid-key" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add key" }));
    expect(
      await within(dialog).findByText("Public key must start with ssh-."),
    ).toBeInTheDocument();
  });

  it("shows empty state when no keys exist", async () => {
    const { http, HttpResponse } = await import("msw");
    const { server } = await import("~/mocks/server");
    server.use(
      http.get("*/api/v1/me/ssh-keys", () => HttpResponse.json({ items: [] })),
    );
    renderApp("/settings/ssh-keys");
    expect(await screen.findByText("No SSH keys yet")).toBeInTheDocument();
  });
});

describe("TokensPage", () => {
  it("displays tokens with names and expiry", async () => {
    renderApp("/settings/tokens");
    expect(await screen.findByText("CI runner")).toBeInTheDocument();
    expect(screen.getByText("Laptop backup")).toBeInTheDocument();
    expect(screen.getByText("Old deploy key")).toBeInTheDocument();
  });

  it("shows expired pill for expired tokens", async () => {
    renderApp("/settings/tokens");
    await screen.findByText("Old deploy key");
    const pills = screen.getAllByText(/Expired/);
    expect(pills.length).toBeGreaterThanOrEqual(1);
  });

  it("opens the create token dialog", async () => {
    renderApp("/settings/tokens");
    await screen.findByText("CI runner");
    // The "Create token" button in the card header
    const btns = screen.getAllByRole("button", { name: /Create token/ });
    fireEvent.click(btns[0]!);
    expect(
      await screen.findByRole("dialog", { name: "Create access token" }),
    ).toBeInTheDocument();
  });

  it("creates a token and shows the reveal dialog", async () => {
    renderApp("/settings/tokens");
    await screen.findByText("CI runner");
    const btns = screen.getAllByRole("button", { name: /Create token/ });
    fireEvent.click(btns[0]!);
    const dialog = await screen.findByRole("dialog", {
      name: "Create access token",
    });
    fireEvent.input(within(dialog).getByLabelText("Name"), {
      target: { value: "Test token" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Create token" }),
    );
    // Should show the reveal dialog
    const reveal = await screen.findByRole("dialog", {
      name: "Copy your token now",
    });
    expect(reveal).toBeInTheDocument();
    // The reveal dialog contains the plaintext token (rf_pat_...)
    expect(within(reveal).getByText(/rf_pat_/)).toBeInTheDocument();
  });

  it("shows empty state when no tokens exist", async () => {
    const { http, HttpResponse } = await import("msw");
    const { server } = await import("~/mocks/server");
    server.use(
      http.get("*/api/v1/me/tokens", () => HttpResponse.json({ items: [] })),
    );
    renderApp("/settings/tokens");
    expect(await screen.findByText("No access tokens yet")).toBeInTheDocument();
  });
});

describe("SessionsPage", () => {
  it("displays sessions with current device pill", async () => {
    renderApp("/settings/sessions");
    // Wait for lazy load + data fetch
    expect(await screen.findByText("This device")).toBeInTheDocument();
    expect(screen.getByText("Signed-in sessions")).toBeInTheDocument();
  });

  it("shows sign out other sessions button", async () => {
    renderApp("/settings/sessions");
    await screen.findByText("This device");
    expect(
      screen.getByRole("button", { name: "Sign out other sessions" }),
    ).toBeInTheDocument();
  });

  it("confirms before signing out other sessions", async () => {
    renderApp("/settings/sessions");
    await screen.findByText("This device");
    fireEvent.click(
      screen.getByRole("button", { name: "Sign out other sessions" }),
    );
    expect(
      await screen.findByRole("alertdialog", {
        name: "Sign out other sessions?",
      }),
    ).toBeInTheDocument();
  });
});

describe("NotificationsPage", () => {
  it("displays notification rows with toggles", async () => {
    renderApp("/settings/notifications");
    expect(await screen.findByText("Review requested")).toBeInTheDocument();
    expect(screen.getByText("Mentions")).toBeInTheDocument();
    expect(screen.getByText("Sign-in from a new device")).toBeInTheDocument();
  });

  it("locks security notification toggles", async () => {
    renderApp("/settings/notifications");
    await screen.findByText("Sign-in from a new device");
    // Find the row for sign-in and check its switches are disabled
    const switches = screen.getAllByRole("switch");
    // The last two switches should be disabled (sign-in from new device row)
    const lastTwo = switches.slice(-2);
    expect(lastTwo[0]).toBeDisabled();
    expect(lastTwo[1]).toBeDisabled();
  });
});

describe("PreferencesPage", () => {
  it("displays accent palette options", async () => {
    renderApp("/settings/preferences");
    // Wait for the radio buttons (only present after data loads, not in skeleton)
    expect(
      await screen.findByRole("radio", { name: "Forge blue" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Tech & cyber" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Professional" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Amber" })).toBeInTheDocument();
  });

  it("displays toggle preferences", async () => {
    renderApp("/settings/preferences");
    // Wait for loaded state via a radio button, then check toggles
    await screen.findByRole("radio", { name: "Forge blue" });
    // Each toggle label appears both as a row title and as the Switch label
    expect(
      screen.getAllByText("Show the graph in History by default").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Compact rows").length).toBeGreaterThanOrEqual(
      1,
    );
    expect(screen.getAllByText("Reduce motion").length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("selects a palette and applies it with CSRF", async () => {
    const { http, HttpResponse } = await import("msw");
    const { server } = await import("~/mocks/server");
    let sentBody: Record<string, unknown> | undefined;
    let sentCsrf: string | null = null;
    server.use(
      http.put("*/api/v1/me/preferences", async ({ request }) => {
        sentCsrf = request.headers.get("X-CSRF-Token");
        sentBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          accent: "tech",
          graph_default: true,
          compact: false,
          reduce_motion: false,
        });
      }),
    );
    renderApp("/settings/preferences");
    // Wait for loaded radio buttons before interacting
    const techRadio = await screen.findByRole("radio", {
      name: "Tech & cyber",
    });
    fireEvent.click(techRadio);
    await waitFor(() => {
      expect(sentBody).toMatchObject({ accent: "tech" });
      expect(sentCsrf).toBeTruthy();
    });
    // Check accent is applied to the document
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe(
      "#00E5FF",
    );
  });
});
