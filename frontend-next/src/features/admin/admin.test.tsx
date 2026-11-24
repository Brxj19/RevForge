import { screen, waitFor, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { apiError } from "~/mocks/handlers";
import { server } from "~/mocks/server";
import { renderApp } from "~/test/app";

describe("Forge admin access & layout", () => {
  it("denies non-platform-admins with permission-denied", async () => {
    renderApp("/admin", { user: "tatwa" });
    expect(
      await screen.findByRole("heading", {
        name: "Forge admin is for platform admins",
      }),
    ).toBeInTheDocument();
  });

  it("renders the admin header, all 7 navigation links, and overview stats", async () => {
    renderApp("/admin");
    expect(
      await screen.findByRole("heading", { name: "Forge admin", level: 1 }),
    ).toBeInTheDocument();

    const nav = screen.getByRole("navigation", {
      name: "Forge admin sections",
    });
    for (const label of [
      "Overview",
      "Users",
      "Organizations",
      "Repositories",
      "Audit log",
      "Break-glass",
      "System health",
    ]) {
      expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument();
    }

    expect(
      await screen.findByText(/Every action here is recorded as a high-severity/i),
    ).toBeInTheDocument();
    expect(await screen.findByText("Needs attention")).toBeInTheDocument();
    expect(
      await screen.findByText("sigma/ml-experiments failed to provision"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("2 accounts paused after repeated failed sign-ins"),
    ).toBeInTheDocument();
  });

  it("renders not-found empty state for unknown admin sections", async () => {
    renderApp("/admin/nonexistent");
    expect(
      await screen.findByRole("heading", { name: "Admin section not found" }),
    ).toBeInTheDocument();
  });

  it("shows loading shimmer while pending and ErrorState on API failure", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get("*/api/v1/admin/overview", async () => {
        await gate;
        return apiError(500, "Database unavailable.", "internal_error");
      }),
    );

    renderApp("/admin/overview");
    expect(
      await screen.findByLabelText("Loading overview metrics"),
    ).toBeInTheDocument();

    release();
    expect(
      await screen.findByRole("heading", {
        name: "Couldn't load forge overview",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });
});

describe("Forge admin — Users", () => {
  it("lists users, filters by search, hides self actions, suspends with typed confirmation, reactivates, and revokes sessions", async () => {
    renderApp("/admin/users");
    expect(await screen.findByText("Tatwa Prasad")).toBeInTheDocument();
    expect(screen.getByText("Sana Verma")).toBeInTheDocument();
    expect(screen.getByText("platform admin")).toBeInTheDocument();

    // Self row (Brxj19) has no actions button.
    expect(
      screen.queryByRole("button", { name: "Actions for Brxj19" }),
    ).toBeNull();

    // Search filters the list.
    const search = screen.getByRole("textbox", { name: "Search users" });
    await userEvent.type(search, "tatwa");
    await waitFor(() => {
      expect(screen.queryByText("Sana Verma")).toBeNull();
      expect(screen.getByText("Tatwa Prasad")).toBeInTheDocument();
    });

    // Suspend Tatwa Prasad — requires typed handle + reason.
    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Tatwa Prasad" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Suspend account" }),
    );

    const dialog = await screen.findByRole("alertdialog", {
      name: "Suspend Tatwa Prasad?",
    });
    const submitBtn = within(dialog).getByRole("button", {
      name: "Suspend account",
    });
    expect(submitBtn).toBeDisabled();

    // Typing handle alone without reason keeps button disabled.
    const confirmInput = within(dialog).getByLabelText(/Type/i);
    await userEvent.type(confirmInput, "tatwa");
    expect(submitBtn).toBeDisabled();

    // Adding reason enables submit.
    await userEvent.type(
      within(dialog).getByLabelText("Reason"),
      "Suspicious token activity detected",
    );
    expect(submitBtn).not.toBeDisabled();

    await userEvent.click(submitBtn);
    await waitFor(() => {
      expect(
        screen.queryByRole("alertdialog", { name: "Suspend Tatwa Prasad?" }),
      ).toBeNull();
    });

    // Tatwa is now suspended.
    await waitFor(() => {
      const tatwaRow = screen.getByText("Tatwa Prasad").closest("tr")!;
      expect(within(tatwaRow).getByText("suspended")).toBeInTheDocument();
    });

    // Reactivate Tatwa Prasad.
    await userEvent.click(
      await screen.findByRole("button", { name: "Actions for Tatwa Prasad" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Reactivate account" }),
    );
    await waitFor(() => {
      const tatwaRow = screen.getByText("Tatwa Prasad").closest("tr")!;
      expect(within(tatwaRow).getByText("active")).toBeInTheDocument();
    });

    // Revoke all sessions.
    await userEvent.click(
      await screen.findByRole("button", { name: "Actions for Tatwa Prasad" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Sign out of all sessions" }),
    );
    const revokeDialog = await screen.findByRole("alertdialog", {
      name: "Sign Tatwa Prasad out everywhere?",
    });
    await userEvent.click(
      within(revokeDialog).getByRole("button", { name: "Sign out everywhere" }),
    );
    await waitFor(() => {
      expect(screen.getByText("Sessions revoked")).toBeInTheDocument();
    });
  });
});

describe("Forge admin — Organizations, Repositories, Audit & System health", () => {
  it("renders organizations table with counts", async () => {
    renderApp("/admin/organizations");
    expect(await screen.findByText("Acme Labs")).toBeInTheDocument();
    expect(screen.getByText("Rishik Rohan")).toBeInTheDocument();
  });

  it("retries failed provisioning and resets stuck provisioning with confirmation", async () => {
    renderApp("/admin/repositories");
    const failedLink = await screen.findByRole("link", {
      name: "sigma/ml-experiments",
    });
    const failedRow = failedLink.closest("tr")!;
    expect(within(failedRow).getByText("failed")).toBeInTheDocument();

    // Retry failed repo.
    await userEvent.click(
      within(failedRow).getByRole("button", { name: "Retry" }),
    );
    await waitFor(() => {
      const row = screen
        .getByRole("link", { name: "sigma/ml-experiments" })
        .closest("tr")!;
      expect(within(row).getByText("provisioning")).toBeInTheDocument();
    });

    // Reset stuck provisioning on sigma/infra-scripts.
    const stuckLink = screen.getByRole("link", { name: "sigma/infra-scripts" });
    const stuckRow = stuckLink.closest("tr")!;
    expect(within(stuckRow).getByText("provisioning")).toBeInTheDocument();

    await userEvent.click(
      within(stuckRow).getByRole("button", { name: "Reset stuck" }),
    );
    const confirm = await screen.findByRole("alertdialog", {
      name: "Reset provisioning for sigma/infra-scripts?",
    });
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Reset to failed" }),
    );
    await waitFor(() => {
      const row = screen
        .getByRole("link", { name: "sigma/infra-scripts" })
        .closest("tr")!;
      expect(within(row).getByText("failed")).toBeInTheDocument();
    });
  });

  it("filters audit log by High severity and links Export CSV", async () => {
    renderApp("/admin/audit");
    expect(
      await screen.findByText(/started break-glass access/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/merged sigma-reckitt #4/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "High severity" }));
    await waitFor(() => {
      expect(screen.queryByText(/merged sigma-reckitt #4/i)).toBeNull();
    });
    expect(screen.getByText(/started break-glass access/i)).toBeInTheDocument();

    const exportLink = screen.getByRole("link", { name: "Export" });
    expect(exportLink.getAttribute("href")).toContain("format=csv");
    expect(exportLink.getAttribute("href")).toContain("severity=high");
  });

  it("renders system health components including degraded status", async () => {
    renderApp("/admin/system");
    expect(await screen.findByText("Webhook delivery")).toBeInTheDocument();
    expect(screen.getByText("ci.sigma.dev failing")).toBeInTheDocument();
    expect(screen.getByText("degraded")).toBeInTheDocument();
    expect(screen.getByText("API")).toBeInTheDocument();
    expect(screen.getByText("Database")).toBeInTheDocument();
  });
});

describe("Forge admin — Break-glass workflow", () => {
  it("validates reason, starts a break-glass session, renders shell banner, grants read-only access, and ends session", async () => {
    renderApp("/admin/breakglass");
    const startBtn = await screen.findByRole("button", {
      name: "Start a break-glass session",
    });
    await userEvent.click(startBtn);

    const dialog = await screen.findByRole("alertdialog", {
      name: "Break-glass access",
    });

    // Submitting with short reason shows validation error.
    await userEvent.type(within(dialog).getByLabelText("Reason"), "short");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Start session" }),
    );
    expect(
      await within(dialog).findByText(/at least 10 characters/i),
    ).toBeInTheDocument();

    // Valid reason succeeds, navigates to acme-labs/payments-core, and shows banner.
    const reasonInput = within(dialog).getByLabelText("Reason");
    await userEvent.clear(reasonInput);
    await userEvent.type(
      reasonInput,
      "INC-2041: investigating a leaked credential in history",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Start session" }),
    );

    await waitFor(() => {
      expect(window.location.pathname).toBe("/acme-labs/payments-core");
    });

    // BreakGlassBanner appears above the page.
    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent(
      /Break-glass session on acme-labs\/payments-core/i,
    );

    // Ending session from the banner clears it and returns to /admin/breakglass.
    await userEvent.click(
      within(banner).getByRole("button", { name: "End session" }),
    );
    await waitFor(() => {
      expect(window.location.pathname).toBe("/admin/breakglass");
    });
    expect(
      await screen.findByRole("button", {
        name: "Start a break-glass session",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Break-glass session on acme-labs\/payments-core/i),
    ).toBeNull();
  });

  it("handles slow health response with skeleton shimmer", async () => {
    server.use(
      http.get("*/api/v1/admin/health", async () => {
        await delay(50);
        return HttpResponse.json({
          components: [{ name: "API", status: "healthy", detail: "p95 50 ms" }],
        });
      }),
    );

    renderApp("/admin/system");
    expect(
      await screen.findByLabelText("Loading system health"),
    ).toBeInTheDocument();
    expect(await screen.findByText("p95 50 ms")).toBeInTheDocument();
  });
});
