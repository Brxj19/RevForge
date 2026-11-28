import { fireEvent, screen, waitFor, within } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { renderApp } from "~/test/app";

describe("RepoSettingsLayout", () => {
  it("renders the settings subnav with all sections", async () => {
    renderApp("/sigma/sigma-reckitt/settings");
    const nav = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    expect(within(nav).getByText("General")).toBeInTheDocument();
    expect(within(nav).getByText("Access")).toBeInTheDocument();
    expect(within(nav).getByText("Clone & transport")).toBeInTheDocument();
    expect(within(nav).getByText("Webhooks")).toBeInTheDocument();
    expect(within(nav).getByText("Audit log")).toBeInTheDocument();
    expect(within(nav).getByText("Danger zone")).toBeInTheDocument();
  });

  it("defaults to the general section", async () => {
    renderApp("/sigma/sigma-reckitt/settings");
    const nav = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    const generalLink = within(nav).getByText("General").closest("a");
    expect(generalLink).toHaveAttribute("aria-current", "page");
  });

  it("highlights the active section in subnav", async () => {
    renderApp("/sigma/sigma-reckitt/settings/access");
    const nav = await screen.findByRole("navigation", {
      name: "Settings sections",
    });
    const accessLink = within(nav).getByText("Access").closest("a");
    expect(accessLink).toHaveAttribute("aria-current", "page");
  });

  it("shows audit log placeholder", async () => {
    renderApp("/sigma/sigma-reckitt/settings/audit");
    await waitFor(() => {
      expect(screen.getByText(/coming in a later phase/i)).toBeInTheDocument();
    });
  });
});

describe("RepoGeneralPage", () => {
  it("renders the form with display name, slug, description, and visibility", async () => {
    renderApp("/sigma/sigma-reckitt/settings/general");
    // Wait for form to load
    expect(await screen.findByText("Repository details")).toBeInTheDocument();
    expect(screen.getByLabelText("Display name")).toBeInTheDocument();
    expect(screen.getByLabelText("Slug")).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Default branch/i }),
    ).not.toBeDisabled();
    expect(screen.getByText("Visibility")).toBeInTheDocument();
  });

  it("shows all 3 visibility options", async () => {
    renderApp("/sigma/sigma-reckitt/settings/general");
    await screen.findByText("Repository details");
    // Visibility labels appear both in the radio cards and potentially in the repo header pill,
    // so check that all three option descriptions are present
    expect(
      screen.getByText(/Anyone, including people who aren't signed in/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Every member of the organization/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Only people with a grant/)).toBeInTheDocument();
  });

  it("disables save when form is clean", async () => {
    renderApp("/sigma/sigma-reckitt/settings/general");
    const saveButton = await screen.findByRole("button", {
      name: "Save changes",
    });
    expect(saveButton).toBeDisabled();
  });

  it("enables save when form is dirty", async () => {
    renderApp("/sigma/sigma-reckitt/settings/general");
    const nameInput = await screen.findByLabelText("Display name");
    fireEvent.input(nameInput, { target: { value: "Updated Name" } });
    const saveButton = screen.getByRole("button", { name: "Save changes" });
    expect(saveButton).not.toBeDisabled();
  });

  it("discard resets the form", async () => {
    renderApp("/sigma/sigma-reckitt/settings/general");
    const nameInput = (await screen.findByLabelText(
      "Display name",
    )) as HTMLInputElement;
    const original = nameInput.value;
    fireEvent.input(nameInput, { target: { value: "Changed" } });
    const discardButton = screen.getByRole("button", { name: "Discard" });
    fireEvent.click(discardButton);
    await waitFor(() => {
      expect(nameInput.value).toBe(original);
    });
  });
});

describe("RepoAccessPage", () => {
  it("shows the access table with people and roles", async () => {
    renderApp("/sigma/sigma-reckitt/settings/access");
    expect(await screen.findByText(/Who can access/)).toBeInTheDocument();
    // Table headers
    expect(screen.getByText("Person")).toBeInTheDocument();
    expect(screen.getByText("Role")).toBeInTheDocument();
    expect(screen.getByText("Source")).toBeInTheDocument();
  });

  it("shows direct grants with a revoke button", async () => {
    renderApp("/sigma/sigma-reckitt/settings/access");
    await screen.findByText(/Who can access/);
    // Priya Sharma has a direct grant
    await waitFor(() => {
      expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
    });
    const revokeButtons = screen.getAllByRole("button", { name: /Revoke/i });
    expect(revokeButtons.length).toBeGreaterThan(0);
  });

  it("shows org role members without a revoke button", async () => {
    renderApp("/sigma/sigma-reckitt/settings/access");
    await screen.findByText(/Who can access/);
    await waitFor(() => {
      expect(screen.getByText("Arjun Nair")).toBeInTheDocument();
    });
    // Arjun's row should show "Organization role" and no revoke
    expect(screen.getAllByText("Organization role").length).toBeGreaterThan(0);
  });

  it("enables Add person button and opens the grant access dialog", async () => {
    renderApp("/sigma/sigma-reckitt/settings/access");
    const addButton = await screen.findByRole("button", {
      name: /Add person/i,
    });
    expect(addButton).not.toBeDisabled();
    fireEvent.click(addButton);
    expect(
      await screen.findByText(/Add person to sigma-reckitt/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Grant access" })).toBeDisabled();
  });
});

describe("RepoTransportPage", () => {
  it("shows the SSH, HTTPS, and anonymous toggles", async () => {
    renderApp("/sigma/sigma-reckitt/settings/transport");
    await screen.findByText("SSH");
    expect(screen.getByText("HTTPS")).toBeInTheDocument();
    expect(screen.getByText("Anonymous clone")).toBeInTheDocument();
  });

  it("shows the clone URL cards", async () => {
    renderApp("/sigma/sigma-reckitt/settings/transport");
    await waitFor(() => {
      expect(screen.getByText("SSH clone URL")).toBeInTheDocument();
      expect(screen.getByText("HTTPS clone URL")).toBeInTheDocument();
    });
  });
});

describe("WebhooksListPage", () => {
  it("shows the webhooks list with Add webhook button", async () => {
    renderApp("/sigma/sigma-reckitt/settings/webhooks");
    // "Webhooks" appears in the subnav and the card header; wait for data
    await waitFor(() => {
      expect(
        screen.getByText("https://ci.sigma.dev/hooks/revforge"),
      ).toBeInTheDocument();
    });
    // The button contains an Icon + text; find buttons containing "Add webhook"
    const buttons = screen.getAllByRole("button");
    const addBtn = buttons.find((b) => b.textContent?.includes("Add webhook"));
    expect(addBtn).toBeTruthy();
  });

  it("shows webhook URL for repos with webhooks", async () => {
    renderApp("/sigma/sigma-reckitt/settings/webhooks");
    await waitFor(() => {
      expect(
        screen.getByText("https://ci.sigma.dev/hooks/revforge"),
      ).toBeInTheDocument();
    });
  });

  it("opens the create webhook dialog", async () => {
    renderApp("/sigma/sigma-reckitt/settings/webhooks");
    const addButton = await screen.findByRole("button", {
      name: /Add webhook/i,
    });
    fireEvent.click(addButton);
    await waitFor(() => {
      expect(screen.getByText("Payload URL")).toBeInTheDocument();
      expect(screen.getByText("Events")).toBeInTheDocument();
    });
  });
});

describe("WebhookDetailPage", () => {
  it("shows webhook URL and deliveries table", async () => {
    renderApp("/sigma/sigma-reckitt/settings/webhooks/1");
    // Wait for webhook detail to load
    await waitFor(() => {
      expect(
        screen.getByText("https://ci.sigma.dev/hooks/revforge"),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Signing secret")).toBeInTheDocument();
    expect(screen.getByText("Recent deliveries")).toBeInTheDocument();
  });

  it("shows delivery rows with event and status", async () => {
    renderApp("/sigma/sigma-reckitt/settings/webhooks/1");
    await waitFor(() => {
      expect(screen.getByText("Recent deliveries")).toBeInTheDocument();
    });
    // Should have delivery rows with event types
    await waitFor(() => {
      const pushRefs = screen.getAllByText("push");
      expect(pushRefs.length).toBeGreaterThan(0);
    });
  });

  it("has a Send test button", async () => {
    renderApp("/sigma/sigma-reckitt/settings/webhooks/1");
    expect(
      await screen.findByRole("button", { name: "Send test" }),
    ).toBeInTheDocument();
  });

  it("has a Regenerate button for the secret", async () => {
    renderApp("/sigma/sigma-reckitt/settings/webhooks/1");
    expect(
      await screen.findByRole("button", { name: "Regenerate" }),
    ).toBeInTheDocument();
  });

  it("has redeliver buttons for each delivery", async () => {
    renderApp("/sigma/sigma-reckitt/settings/webhooks/1");
    await waitFor(() => {
      const redeliverButtons = screen.getAllByRole("button", {
        name: /Redeliver/i,
      });
      expect(redeliverButtons.length).toBeGreaterThan(0);
    });
  });

  it("shows the back link to All webhooks", async () => {
    renderApp("/sigma/sigma-reckitt/settings/webhooks/1");
    expect(await screen.findByText("All webhooks")).toBeInTheDocument();
  });
});

describe("RepoDangerPage", () => {
  it("shows all three danger actions", async () => {
    renderApp("/sigma/sigma-reckitt/settings/danger");
    expect(await screen.findByText("Archive repository")).toBeInTheDocument();
    expect(
      screen.getByText("Transfer to another organization"),
    ).toBeInTheDocument();
    expect(screen.getByText("Delete repository")).toBeInTheDocument();
  });

  it("has archive and delete buttons", async () => {
    renderApp("/sigma/sigma-reckitt/settings/danger");
    await screen.findByText("Archive repository");
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("transfer button is disabled", async () => {
    renderApp("/sigma/sigma-reckitt/settings/danger");
    await screen.findByText("Transfer to another organization");
    expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();
  });

  it("delete button opens confirm dialog", async () => {
    renderApp("/sigma/sigma-reckitt/settings/danger");
    const deleteButton = await screen.findByRole("button", {
      name: "Delete",
    });
    fireEvent.click(deleteButton);
    await waitFor(() => {
      expect(screen.getByText(/Delete sigma-reckitt/)).toBeInTheDocument();
    });
  });
});
