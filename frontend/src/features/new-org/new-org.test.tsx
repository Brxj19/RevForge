import { fireEvent, screen, waitFor } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { renderApp } from "~/test/app";

/** Helper: set an input value and fire the input event so SolidJS picks it up. */
function typeInto(el: HTMLInputElement, value: string) {
  // Directly set the DOM property so currentTarget.value is correct
  // when SolidJS's delegated event handler reads it.
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("NewOrgPage", () => {
  it("renders the page heading and form", async () => {
    renderApp("/orgs/new");
    expect(
      await screen.findByRole("heading", { name: "New organization" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Display name")).toBeInTheDocument();
    expect(screen.getByLabelText("URL")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create organization" }),
    ).toBeInTheDocument();
  });

  it("auto-derives slug from display name", async () => {
    renderApp("/orgs/new");
    const nameInput = await screen.findByLabelText("Display name");
    typeInto(nameInput as HTMLInputElement, "My Team");
    // The slug appears in the status message after debounce + check
    await waitFor(
      () => {
        expect(screen.getByText(/my-team/)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it("shows the info callout about being first owner", async () => {
    renderApp("/orgs/new");
    expect(await screen.findByText(/first owner/)).toBeInTheDocument();
  });

  it("disables submit when slug is empty", async () => {
    renderApp("/orgs/new");
    const btn = await screen.findByRole("button", {
      name: "Create organization",
    });
    expect(btn).toBeDisabled();
  });

  it("shows slug availability for a valid unique slug", async () => {
    renderApp("/orgs/new");
    const nameInput = await screen.findByLabelText("Display name");
    typeInto(nameInput as HTMLInputElement, "Unique Org");
    await waitFor(
      () => {
        expect(screen.getByText(/is available/)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it("shows taken status for existing slug", async () => {
    renderApp("/orgs/new");
    const nameInput = await screen.findByLabelText("Display name");
    typeInto(nameInput as HTMLInputElement, "Sigma");
    await waitFor(
      () => {
        expect(screen.getByText(/already taken/)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it("shows reserved status for a reserved slug", async () => {
    renderApp("/orgs/new");
    const nameInput = await screen.findByLabelText("Display name");
    typeInto(nameInput as HTMLInputElement, "Admin");
    await waitFor(
      () => {
        expect(screen.getByText(/reserved/)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it("sends CSRF on create", async () => {
    const { http, HttpResponse } = await import("msw");
    const { server } = await import("~/mocks/server");
    let sentCsrf: string | null = null;
    server.use(
      http.post("*/api/v1/organizations", async ({ request }) => {
        sentCsrf = request.headers.get("X-CSRF-Token");
        return HttpResponse.json(
          {
            id: "new-org-id",
            slug: "unique-org",
            display_name: "Unique Org",
            description: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            viewer_role: "owner",
            can_manage: true,
            member_count: 1,
            repository_count: 0,
          },
          { status: 201 },
        );
      }),
    );
    renderApp("/orgs/new");
    const nameInput = await screen.findByLabelText("Display name");
    typeInto(nameInput as HTMLInputElement, "Unique Org");
    await waitFor(
      () => {
        expect(screen.getByText(/is available/)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Create organization" }),
    );
    await waitFor(() => {
      expect(sentCsrf).toBeTruthy();
    });
  });

  it("has a cancel link that navigates home", async () => {
    renderApp("/orgs/new");
    const cancelBtn = await screen.findByRole("button", { name: "Cancel" });
    const link = cancelBtn.closest("a");
    expect(link).toHaveAttribute("href", "/");
  });
});
