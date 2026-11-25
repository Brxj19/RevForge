import { fireEvent, screen, waitFor, within } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { renderApp } from "~/test/app";

describe("OrgLayout", () => {
  it("renders the org header and subnav, defaulting to overview", async () => {
    renderApp("/org/sigma");
    const nav = await screen.findByRole("navigation", {
      name: "Organization sections",
    });
    expect(within(nav).getByText("Overview")).toBeInTheDocument();
    expect(within(nav).getByText("Members")).toBeInTheDocument();
    expect(within(nav).getByText("General")).toBeInTheDocument();
    expect(within(nav).getByText("Danger zone")).toBeInTheDocument();
    // Header shows org name
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Sigma",
    );
  });

  it("shows the active section in the subnav", async () => {
    renderApp("/org/sigma/members");
    const nav = await screen.findByRole("navigation", {
      name: "Organization sections",
    });
    const membersLink = within(nav).getByText("Members").closest("a");
    expect(membersLink).toHaveAttribute("aria-current", "page");
  });

  it("displays org subtitle with repository and member counts", async () => {
    renderApp("/org/sigma");
    // Wait for the subtitle to appear (relies on the org detail loading)
    await waitFor(() => {
      expect(screen.getByText(/repositories/)).toBeInTheDocument();
      expect(screen.getByText(/members/)).toBeInTheDocument();
      expect(screen.getByText(/owner/)).toBeInTheDocument();
    });
  });

  it("shows not-found for a non-existent org", async () => {
    renderApp("/org/nonexistent");
    expect(
      await screen.findByText("Organization not found"),
    ).toBeInTheDocument();
  });

  it("redirects unknown sections to overview", async () => {
    renderApp("/org/sigma/nonexistent");
    // Should redirect to overview
    const nav = await screen.findByRole("navigation", {
      name: "Organization sections",
    });
    expect(nav).toBeInTheDocument();
  });
});

describe("OrgOverviewPage", () => {
  it("shows repositories and members cards", async () => {
    renderApp("/org/sigma/overview");
    // Wait for lazy load + data
    expect(
      await screen.findByRole("heading", { name: "Repositories" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Members" }),
    ).toBeInTheDocument();
  });

  it("displays repository names from the fixture", async () => {
    renderApp("/org/sigma/overview");
    expect(await screen.findByText("sigma-reckitt")).toBeInTheDocument();
  });

  it("shows member count in footer", async () => {
    renderApp("/org/sigma/overview");
    await waitFor(() => {
      expect(screen.getByText(/people/)).toBeInTheDocument();
    });
  });
});

describe("OrgMembersPage", () => {
  it("displays the members table with names", async () => {
    renderApp("/org/sigma/members");
    expect(await screen.findByText("Brxj19")).toBeInTheDocument();
    expect(screen.getByText("Tatwa Prasad")).toBeInTheDocument();
  });

  it("shows the last-owner lock instead of a role dropdown", async () => {
    renderApp("/org/sigma/members");
    // The sole owner (Brxj19) should show a locked indicator with lock icon
    await waitFor(() => {
      const locked = document.querySelector("[class*='lockedRole']");
      expect(locked).toBeTruthy();
      expect(locked!.textContent).toContain("Owner");
      // Lock icon should be present inside the locked span
      expect(locked!.querySelector("[data-icon='lock']")).toBeTruthy();
    });
  });

  it("shows the invite button", async () => {
    renderApp("/org/sigma/members");
    expect(
      await screen.findByRole("button", { name: /Invite/ }),
    ).toBeInTheDocument();
  });

  it("displays pagination", async () => {
    renderApp("/org/sigma/members");
    await waitFor(() => {
      expect(screen.getByText(/of/)).toBeInTheDocument();
    });
  });

  it("shows pending invitations", async () => {
    renderApp("/org/sigma/members");
    expect(await screen.findByText("Pending invitations")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("sana@sigma.dev")).toBeInTheDocument();
      expect(screen.getByText("arjun.nair@outlook.com")).toBeInTheDocument();
    });
  });

  it("opens the invite dialog", async () => {
    renderApp("/org/sigma/members");
    const btn = await screen.findByRole("button", { name: /Invite/ });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Invite member" }),
      ).toBeInTheDocument();
    });
  });

  it("sends CSRF on invitation create", async () => {
    const { http, HttpResponse } = await import("msw");
    const { server } = await import("~/mocks/server");
    let sentCsrf: string | null = null;
    server.use(
      http.post(
        "*/api/v1/organizations/sigma/invitations",
        async ({ request }) => {
          sentCsrf = request.headers.get("X-CSRF-Token");
          return HttpResponse.json(
            {
              id: "inv-new",
              organization_id: "test",
              email: "new@example.com",
              role: "member",
              status: "pending",
              invited_by_email: "brajesh@sigma.dev",
              created_at: new Date().toISOString(),
              expires_at: new Date().toISOString(),
            },
            { status: 201 },
          );
        },
      ),
    );
    renderApp("/org/sigma/members");
    const btn = await screen.findByRole("button", { name: /Invite/ });
    fireEvent.click(btn);
    const dialog = await screen.findByRole("dialog", {
      name: "Invite member",
    });
    const emailInput = within(dialog).getByPlaceholderText("name@example.com");
    fireEvent.input(emailInput, { target: { value: "new@example.com" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Send invitation" }),
    );
    await waitFor(() => {
      expect(sentCsrf).toBeTruthy();
    });
  });

  it("sends CSRF on resend invitation", async () => {
    const { http, HttpResponse } = await import("msw");
    const { server } = await import("~/mocks/server");
    let sentCsrf: string | null = null;
    server.use(
      http.post(
        "*/api/v1/organizations/sigma/invitations/:id/resend",
        async ({ request }) => {
          sentCsrf = request.headers.get("X-CSRF-Token");
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );
    renderApp("/org/sigma/members");
    // Wait for invitations to load
    await screen.findByText("sana@sigma.dev");
    const resendButtons = screen.getAllByRole("button", { name: "Resend" });
    fireEvent.click(resendButtons[0]!);
    await waitFor(() => {
      expect(sentCsrf).toBeTruthy();
    });
  });

  it("sends CSRF on revoke invitation", async () => {
    const { http, HttpResponse } = await import("msw");
    const { server } = await import("~/mocks/server");
    let sentCsrf: string | null = null;
    server.use(
      http.delete(
        "*/api/v1/organizations/sigma/invitations/:id",
        async ({ request }) => {
          sentCsrf = request.headers.get("X-CSRF-Token");
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );
    renderApp("/org/sigma/members");
    await screen.findByText("sana@sigma.dev");
    const revokeButtons = screen.getAllByRole("button", { name: "Revoke" });
    fireEvent.click(revokeButtons[0]!);
    await waitFor(() => {
      expect(sentCsrf).toBeTruthy();
    });
  });
});

describe("OrgGeneralPage", () => {
  it("loads and displays the form with org data", async () => {
    renderApp("/org/sigma/general");
    const nameInput = await screen.findByLabelText("Display name");
    expect(nameInput).toHaveValue("Sigma");
    expect(screen.getByLabelText("Slug")).toBeDisabled();
  });

  it("tracks dirty state and enables save", async () => {
    renderApp("/org/sigma/general");
    const nameInput = await screen.findByLabelText("Display name");
    const saveBtn = screen.getByRole("button", { name: "Save changes" });
    expect(saveBtn).toBeDisabled();
    fireEvent.input(nameInput, { target: { value: "Sigma Updated" } });
    expect(saveBtn).not.toBeDisabled();
  });

  it("sends CSRF on save", async () => {
    const { http, HttpResponse } = await import("msw");
    const { server } = await import("~/mocks/server");
    let sentCsrf: string | null = null;
    server.use(
      http.patch("*/api/v1/organizations/sigma", async ({ request }) => {
        sentCsrf = request.headers.get("X-CSRF-Token");
        return HttpResponse.json({
          id: "test",
          slug: "sigma",
          display_name: "Sigma Updated",
          description: "Delivery team forge",
          created_at: "2026-07-13T20:00:00.000Z",
          updated_at: new Date().toISOString(),
          viewer_role: "owner",
          can_manage: true,
          member_count: 5,
          repository_count: 5,
        });
      }),
    );
    renderApp("/org/sigma/general");
    const nameInput = await screen.findByLabelText("Display name");
    fireEvent.input(nameInput, { target: { value: "Sigma Updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => {
      expect(sentCsrf).toBeTruthy();
    });
  });
});

describe("OrgDangerPage", () => {
  it("shows delete button disabled when repos exist", async () => {
    renderApp("/org/sigma/danger");
    const btn = await screen.findByRole("button", { name: "Delete" });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/repositories first/)).toBeInTheDocument();
  });
});
