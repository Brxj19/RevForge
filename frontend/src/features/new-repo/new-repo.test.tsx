import { fireEvent, screen, waitFor } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { renderApp } from "~/test/app";

/** Helper: set an input value and fire the input event so SolidJS picks it up. */
function typeInto(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Wait for the owner dropdown to load and auto-select. */
async function waitForOwnerLoaded() {
  // The owner field is a Kobalte Select trigger button, not a native <select>.
  // Wait for the trigger to show the selected org's display name.
  await waitFor(() => {
    const ownerEl = screen.getByLabelText("Owner");
    expect(ownerEl).toBeInTheDocument();
    // The trigger should have text content (the selected org's display name)
    expect(ownerEl.textContent?.trim()).toBeTruthy();
  });
}

describe("NewRepoPage", () => {
  it("renders the page heading and form", async () => {
    renderApp("/new");
    expect(
      await screen.findByRole("heading", { name: "New repository" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create repository" }),
    ).toBeInTheDocument();
  });

  it("loads and auto-selects the first manageable org as owner", async () => {
    renderApp("/new");
    await waitFor(() => {
      expect(screen.getByLabelText("Owner")).toBeInTheDocument();
    });
  });

  it("shows visibility radios with two options", async () => {
    renderApp("/new");
    expect(await screen.findByText("Private")).toBeInTheDocument();
    expect(screen.getByText("Public")).toBeInTheDocument();
  });

  it("defaults to private visibility", async () => {
    renderApp("/new");
    const privateRadio = await screen.findByRole("radio", { name: /Private/ });
    expect(privateRadio).toBeChecked();
  });

  it("shows the clone preview", async () => {
    renderApp("/new");
    await waitFor(() => {
      expect(screen.getByText(/hg clone/)).toBeInTheDocument();
    });
  });

  it("auto-derives repo slug from name and shows availability", async () => {
    renderApp("/new");
    await waitForOwnerLoaded();
    const nameInput = screen.getByLabelText("Name");
    typeInto(nameInput as HTMLInputElement, "My New API");
    await waitFor(
      () => {
        expect(screen.getByText(/is available/)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it("shows taken status for existing repo slug", async () => {
    renderApp("/new");
    await waitForOwnerLoaded();
    const nameInput = screen.getByLabelText("Name");
    typeInto(nameInput as HTMLInputElement, "Sigma Reckitt");
    await waitFor(
      () => {
        expect(screen.getByText(/already taken/)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it("disables submit when slug is not available", async () => {
    renderApp("/new");
    const btn = await screen.findByRole("button", {
      name: "Create repository",
    });
    expect(btn).toBeDisabled();
  });

  it("sends CSRF on create", async () => {
    const { http, HttpResponse } = await import("msw");
    const { server } = await import("~/mocks/server");
    let sentCsrf: string | null = null;
    server.use(
      http.post(
        "*/api/v1/organizations/sigma/repositories",
        async ({ request }) => {
          sentCsrf = request.headers.get("X-CSRF-Token");
          return HttpResponse.json(
            {
              id: "new-repo-id",
              organization_id: "test",
              slug: "my-new-api",
              display_name: "My New API",
              description: null,
              visibility: "private",
              created_by_user_id: "user-1",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              archived_at: null,
              provisioning_state: "unprovisioned",
              provisioned_at: null,
              is_browsable: false,
              viewer_role: "admin",
              can_manage: true,
              inherited_access: false,
            },
            { status: 201 },
          );
        },
      ),
    );
    renderApp("/new");
    await waitForOwnerLoaded();
    const nameInput = screen.getByLabelText("Name");
    typeInto(nameInput as HTMLInputElement, "My New API");
    await waitFor(
      () => {
        expect(screen.getByText(/is available/)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
    fireEvent.click(screen.getByRole("button", { name: "Create repository" }));
    await waitFor(() => {
      expect(sentCsrf).toBeTruthy();
      expect(window.location.pathname).toBe("/sigma/my-new-api");
    });
  });

  it("has a cancel link that navigates home", async () => {
    renderApp("/new");
    const link = await screen.findByRole("link", { name: "Cancel" });
    expect(link).toHaveAttribute("href", "/");
  });

  it("can select public visibility", async () => {
    renderApp("/new");
    const publicRadio = await screen.findByRole("radio", { name: /Public/ });
    fireEvent.click(publicRadio);
    expect(publicRadio).toBeChecked();
  });

  it("shows the lead paragraph", async () => {
    renderApp("/new");
    expect(
      await screen.findByText(/Push your first changeset/),
    ).toBeInTheDocument();
  });
});
